# Stream Management — Implementation Plan

Status: **Phases 0-2 and 4 implemented.** Remaining: 3 (quotas), 5 (sessions), 6 (transfer), 7 (scheduled sync). All open questions resolved — the plan below is grounded in the live OpenAPI schema from `sx.nellaiiptv.com:8033`, not inference.

Scope: manage streams per tenant business, keep them in sync with the servers, assign them to customers under a configurable stream limit, show live sessions, and move a stream between servers — all behind role permissions.

**Out of scope, decided:** DVR/recording features, and the customer-facing portal. See §13.

---

## 1. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Config model | **Push-based.** The server exposes `PUT /streams/{name}` and `GET/PUT/POST /config`; streams are server-persisted config. `config_external` is *supported* by the server but not how we will drive it |
| 2 | Conflict policy | **Wait for a human.** Drift marks `CONFLICT` and surfaces "Push ours" / "Adopt theirs". Nothing is auto-overwritten |
| 3 | Input types | **Derived from the URL scheme.** There is no discriminator field — `rtmp://`, `srt://`, `file://` etc. select which extra fields apply (§4.3) |
| 4 | Stream limits | **Kept**, per customer-server assignment, enforced on create, restore and transfer-in (§7) |
| 5 | Sessions | **Live read-through only.** No storage. Plus a kick action via `DELETE /sessions/{id}` (§9) |
| 6 | DVR | **Dropped entirely.** No DVR endpoints are called and no recording state is modelled |
| 7 | Customer portal | **Not now.** Tenant and system surfaces only; the customer credential columns stay dormant |

---

## 2. What the server actually offers

From `GET /streamer/api/v3/schema` — OpenAPI 3.1.0, Flussonic Media Server API **1.2.3**, 82 paths. Only the parts we use are listed.

**Streams**

| Method | Path | Use |
|---|---|---|
| GET | `/streams` | Reconcile listing. Params: `limit` (default **100**), `cursor`, `q`, `select`, `sort` — **cursor-paged, so reconcile must page** |
| GET | `/streams/{name}` | Verify after create; read one config |
| PUT | `/streams/{name}` | Create and update (body: `stream_config`) |
| DELETE | `/streams/{name}` | Delete |
| POST | `/streams/{name}/stop` | Stop/restart a running stream — distinct from `disabled` (§10) |

**Sessions**

| Method | Path | Use |
|---|---|---|
| GET | `/sessions` | Live list. Params: `select`, `sort`, `limit`, `cursor` |
| GET | `/sessions/{id}` | One session |
| DELETE | `/sessions/{id}` | Kick a viewer |

**Server**

| Method | Path | Use |
|---|---|---|
| GET | `/config/stats` | Already used by the existing connection probe |

`stream_config` is an `allOf` of seven fragments merging to **65 properties**. We map a deliberate subset (§4.2); the rest are left untouched on the server, which matters for conflict handling — we must not blank fields we do not model.

---

## 3. What already exists in this repo

| Piece | Where | Reused for |
|---|---|---|
| `TenantFlussonicServer` | `backend/prisma/schema.prisma` | The server a stream lives on |
| Encrypted credentials + `basicCredential()` | `tenant-flussonic-servers.service.ts` | Every outbound call authenticates identically |
| `probe()` / `connectionStatus` | same service | "Call the server, record the outcome, never throw" |
| Dual controller (system + `-self`) | every `tenant-*` module | Streams get the same two surfaces |
| `RequirePermissions` / `RequireTenantPermissions` | `common/decorators` | Permission gating, no new mechanism |
| Business scoping via `TenantMappedBusiness` | `tenant-*.service.ts` | A tenant user maps to exactly one business |
| Soft delete + restore | every module | Streams follow it |

---

## 4. Data model

### 4.1 `TenantStream`

```
id, systemCode
tenantBusinessId            -> scope
tenantFlussonicServerId     -> which server it lives on
tenantCustomerId?           -> assigned customer (null = unassigned)

applicationName  VarChar(100)   -> "app-restream"
streamKey        VarChar(100)   -> "2fx62e-royaltv"
name             VarChar(200)   -> stored, = applicationName + "/" + streamKey
title            VarChar(150)
ingestDomain     VarChar(255)?
comment          Text?
retryLimit       Int?
sourceTimeout    Int?            -> stream-level default, overridable per input
isStatic         Boolean @default(true)
disabled         Boolean @default(false)
protocols        Json            -> play_protocols_spec, see §4.4

namedBy          enum?           -> CONFIG | USER | REMOTE | EXTERNAL (read-only mirror, §6.3)
status           enum            -> ACTIVE | INACTIVE | BLOCKED | DELETED  (our lifecycle)
syncStatus       enum            -> see §6.2
configHash       Char(64)?       -> see §5.3
lastSyncedAt     BigInt?
createdAt/By, updatedAt/By, deletedAt/By

@@unique([tenantBusinessId, tenantFlussonicServerId, applicationName, streamKey])
@@unique([tenantFlussonicServerId, name])
@@index([tenantCustomerId]), @@index([syncStatus])
```

**Why two unique constraints.** The first is the requested rule — a key unique per business per
server — **scoped by application**. The plain `[business, server, streamKey]` form was the original
intent, but the production server holds `demo/demo` and `demo` side by side: both have key `demo`,
so that form rejects legitimate server state. Including `applicationName` keeps the intent (a key is
unique within its application) and admits real data.

The second constraint is what actually protects the server: Flussonic keys on the full name, and the
first alone does not stop two *different* businesses on one server both choosing
`app-restream/news_hd`. It also closes the NULL hole in the first — MySQL treats NULLs as distinct,
so two bare names with the same key would otherwise both be allowed; `name` is never null.

**`applicationName` is optional.** A server-side name may be bare (`demo`), namespaced
(`live/ch01`), or deeper (`a/b/c`). The key is the last segment and the application is everything
before it, so every shape round-trips: verified against all 48 production streams with 0 rejects and
0 mismatches.

`status` and `disabled` stay separate: one is our record lifecycle, the other mirrors the server flag. Merging them makes "soft-deleted here, still streaming there" unrepresentable — the exact state sync exists to catch.

**API naming.** The columns keep the vendor name (`tenantFlussonicServerId`), but the API exposes
`serverId` and a nested `server` object, mapped in `serializeStream`. Without this the vendor name
reaches the client apps through the field names alone, which the frontend convention forbids.

### 4.2 Mapped vs unmapped config

`stream_config` has 65 properties. We map these:

`name`, `title`, `comment`, `static`, `disabled`, `retry_limit`, `source_timeout`, `inputs[]`, `protocols`

Everything else — `transcoder`, `dvr`, `drm`, `pushes`, `thumbnails`, `abr_*`, `srt*`, `auth`-related, `on_play`/`on_publish` and the rest — is **read but never written**. On update we `PUT` a merge of the remote config with our mapped fields, so a transcoder profile configured on the server survives our writes. Sending only our subset would silently wipe them.

This also bounds `configHash` (§5.3): it covers **only the mapped fields**, so an unrelated server-side change to `dvr` does not register as drift we would fight over.

### 4.3 `TenantStreamInput`

Ordered and repeatable, so it gets a table. The schema has **no input type discriminator** — the type follows from the URL scheme, with scheme-specific fragments (`stream_input_rtmp`, `_srt`, `_hls`, `_rtsp`, `_file`, `_tshttp`, `_webrtc`, `_sdi`, `_h323`, `_fake`, `_mixer`, `_mosaic2`). So no `inputType` column: the URL is the source of truth and the UI offers presets that build one.

```
id
tenantStreamId   -> cascade delete
priority     Int        -> maps to stream_input.priority, defines failover order
url          VarChar(500)
comment      VarChar(255)?
sourceTimeout Int?
timeout       Int?
framesTimeout Int?
userAgent    VarChar(255)?
maxBitrate   Int?

@@unique([tenantStreamId, priority])
@@index([tenantStreamId])
```

`headers` and the `allow_if` / `deny_if` expressions exist in the API but are not exposed for now — they can be added without a migration shape change if needed.

### 4.4 Protocols — correction to the earlier draft

**The earlier draft was wrong to call this "18 booleans".** The schema's `play_protocols_spec` is 17 protocols plus a **`whitelist` flag that inverts the meaning of the entire set**:

- `whitelist: true` → only the listed protocols may play
- `whitelist: false` → the listed protocols are **forbidden**, everything else may play
- absent → all protocols allowed

The 18th toggle in the old portal is that flag, not a protocol. Treating it as one would have inverted playback access for every stream — an allow-list silently becoming a deny-list.

The 17: `hls`, `cmaf`, `dash`, `player`, `mss`, `rtmp`, `rtsp`, `m4f`, `m4s`, `mseld`, `tshttp`, `webrtc`, `srt`, `shoutcast`, `mp4`, `jpeg`, `api`.

Stored as one `Json` column shaped `{ whitelist: boolean, hls: boolean, … }`, validated by a Zod schema that is the single declaration of the protocol list, shared by API and UI. Rejected alternatives: 17 boolean columns (a migration whenever Flussonic adds a protocol) and a join table (a row per protocol per stream, for data never queried alone). The accepted cost is that "which streams have HLS on" is not an efficient query — nothing requires it.

The UI must label the whitelist toggle as the mode switch it is, not as a protocol.

### 4.5 `TenantCustomerServer` — assignment and quota

```
id, systemCode
tenantBusinessId, tenantCustomerId, tenantFlussonicServerId
streamLimit   Int?      -> null = unlimited
isDedicated   Boolean   -> displayed as a dedicated server
status        enum
createdAt/By, updatedAt/By, deletedAt/By

@@unique([tenantCustomerId, tenantFlussonicServerId])
```

### 4.6 `TenantStreamOperation` — rename and transfer audit

Multi-step remote operations that can fail halfway (§8, §9). The record makes a half-finished operation visible and resumable.

```
id, systemCode, tenantStreamId
kind        enum -> RENAME | TRANSFER
fromServerId?, toServerId?
fromName?,     toName?
state       enum -> PENDING | CREATED_ON_TARGET | COMPLETED | FAILED | ROLLED_BACK
error       Text?
createdAt/By, completedAt?
```

### 4.7 Not stored

- **Sessions** — live read-through (Q5).
- **Runtime state** — bitrate, uptime, viewer counts, codecs. Read-through when a stream is opened. Storing them means polling every stream forever for data that is stale on write.
- **Playback URLs** — derived from server host + name, so a server change leaves no dead links behind.
- **Anything DVR** (Q6).

---

## 5. How streams are held in our database

**Our database stores intended configuration; the server holds running reality; a hash links them.**

### 5.1 `name` is a stored column, not computed

Derived from `applicationName + "/" + streamKey`, but persisted, because:

1. It is the identity the server knows — every API call uses it.
2. `@@unique([serverId, name])` needs a real column.
3. A rename needs the old *and* new name at once (§8); a computed value gives only the new one.

Written by the service, never accepted from the client — as with the auto-generated `customerCode`.

### 5.2 One record, two shapes

| Shape | Used by |
|---|---|
| `TenantStream` + `TenantStreamInput[]` + `protocols` JSON | The API and UI |
| Flussonic `stream_config` | The payload pushed to the server |

A single `toServerConfig(stream, remoteConfig)` / `fromServerConfig(remote)` pair converts between
them, and is the only place a Flussonic payload is constructed. `toServerConfig` takes the current
remote config so unmapped fields are preserved (§4.2).

**Non-writable keys must be stripped.** A GET returns fields a PUT refuses, and sending any of them
back fails the whole request with `unknown_key`. Observed on the live server: `name`, `named_by`,
`stats` and `srt_port_resolve` are `readOnly` in the schema, `nomedia` is not in `stream_config` at
all, and `config_on_disk` merely reflects the server's own config file. `name` travels in the URL and
never in the body. `stripNonWritable` removes these; it is a denylist, because an allowlist would
silently drop a legitimate setting the day Flussonic adds one — the very config-wiping the merge
exists to prevent.

**Read-only fields nest, too.** Each entry in `inputs` carries a runtime `stats` object, and
sending it back crashes the streamer with a 500 `{"error":"crashed"}` rather than a polite
rejection, so the strip must recurse into `inputs`. Anything that builds a PUT body goes through
`toServerConfig`, which replaces `inputs` from our own rows — echoing the server's config back
verbatim is how this bug reached production the first time.

### 5.3 `configHash` — cheap drift detection

After each successful push, store a SHA-256 of the **canonically serialised mapped config** (keys sorted, inputs in priority order). Reconcile is then:

```
hash(mapped(fromServerConfig(remote))) == stream.configHash  -> IN_SYNC
                                       != stream.configHash  -> drift, classify per §6.2
```

One string comparison per stream instead of deep-diffing inputs and 17 flags on every pass. It also identifies *who* changed: remote hash differs while our row is untouched means someone edited the server directly.

Canonical serialisation is load-bearing — unstable key order would report false drift on every sync, so §14 property-tests it.

### 5.4 Delete semantics

Soft delete locally (`status = DELETED`) **and** `DELETE /streams/{name}` remotely. Leaving it running would mean a "deleted" stream still consuming capacity and serving viewers. If the remote call fails, mark `PENDING_PUSH` and let the scheduled job retry.

Restore re-creates it remotely and **re-checks the customer's quota**, since the seat may have been taken meanwhile.

---

## 6. Sync engine

### 6.1 Source of truth

Our database holds intent; the server holds reality. Reconciliation pushes intent — except for streams we have no record of, which are surfaced for adoption, never deleted. Auto-deleting unknown streams is how a reconcile job erases someone's manual work.

### 6.2 `syncStatus`

| Value | Meaning | Action |
|---|---|---|
| `IN_SYNC` | Both sides present, hashes match | none |
| `PENDING_PUSH` | Local change not yet accepted remotely | retry |
| `MISSING_ON_SERVER` | In our DB, absent remotely | push (create) |
| `ORPHAN_ON_SERVER` | Remote, no DB record | offer adoption (§6.3) |
| `CONFLICT` | Both present, hashes differ | human decision (Q2) |
| `RENAMING` / `TRANSFERRING` | Mid-operation | let it finish |
| `UNREACHABLE` | Server did not answer | retry |

### 6.3 `named_by` changes orphan handling

The schema exposes `named_by` on every stream: `config` (defined in the on-disk config), `user` (created by an ad-hoc play/publish request), `remote` (sourced from another streamer via cluster), `external` (from a `config_external` backend).

This matters, and the earlier draft missed it — not every remote stream is adoptable:

| `named_by` | Treatment |
|---|---|
| `config` | Ours to manage. Adoptable; reconcilable |
| `external` | Adoptable, but flagged — another system owns it |
| `user` | **Ignore.** Ephemeral, created by a viewer publishing or playing. Adopting it would persist a transient stream; deleting it would cut off a live publisher |
| `remote` | **Ignore.** Owned by another node in the cluster |

Without this, the reconcile job would offer to "adopt" every ad-hoc publish session and could delete live cluster streams. Only `config` and `external` streams appear in the unmanaged list.

### 6.4 Three mechanisms

1. **Write-through** — every create/update/delete/enable/disable calls the server immediately. Success → `IN_SYNC` + new `configHash`. Failure → keep the local change, mark `PENDING_PUSH`, return success with a warning. An edit is never lost to a brief outage.
2. **Manual reconcile** — `POST /servers/:id/sync-streams`, the same shape as the existing Check Connection action.
3. **Scheduled reconcile** — `@nestjs/schedule`, every N minutes per reachable server, plus `PENDING_PUSH` retries, with a per-server concurrency guard so a slow server cannot overlap its own runs.

### 6.5 Reconcile algorithm

```
remote = [] ; cursor = null
repeat:                                   # GET /streams is cursor-paged, limit 100
  page = GET /streams?limit=100&cursor=<cursor>
  remote += page.items ; cursor = page.next
until no cursor

remote = remote where named_by in (config, external)     # §6.3
local  = TenantStream where serverId and status != DELETED

for each name in union(remote, local):
  both, hash equal    -> IN_SYNC
  both, hash differs  -> CONFLICT            # human decides (Q2)
  local only          -> push; IN_SYNC or PENDING_PUSH
  remote only         -> ORPHAN_ON_SERVER    # never auto-delete
  mid-operation       -> skip
record lastSyncedAt
```

Orphans get an **Adopt** action building a `TenantStream` via `fromServerConfig`, with customer assignment as a separate step.

---

## 7. Stream limits

Enforced **in the service**; the UI only hides buttons.

On create, restore, and transfer-in:

```
assignment = TenantCustomerServer(customerId, serverId, ACTIVE)
if !assignment             -> 403 "Customer is not assigned to this server"
if assignment.streamLimit != null:
    used = count(TenantStream where customerId, serverId, status != DELETED)
    if used >= streamLimit -> 400 "Stream limit reached (N of N)"
```

Soft-deleted streams do not consume quota. Adoption of an orphan into a customer counts against it.

---

## 8. Rename — destructive

The old portal warns: *"Renaming deletes the old stream on Flussonic and recreates it under the new name."* Changing `applicationName` or `streamKey` disconnects every viewer on the old name, so it is not an ordinary edit.

- `PATCH` changing neither name field → ordinary update.
- `PATCH` changing either → **rejected**, pointing at the rename endpoint. No silent destruction behind a text input.
- `POST /streams/:id/rename { applicationName?, streamKey }` — permission `tenant-streams:rename`, with a confirmation dialog stating viewers will be disconnected.
- The tenant portal form **does** allow editing both fields (requested). On save it detects the
  change, confirms, calls the rename endpoint first, then `PATCH`es the remaining fields. The
  destructive step stays explicit and permissioned; only the entry point is the ordinary form.
- `applicationName` may be cleared, renaming `live/ch01` to a bare `ch01`.
- If the stream is not on the server yet (never pushed), the rename is purely local and the row is
  left `PENDING_PUSH` so the next push creates it under the new name.

Steps, recorded in `TenantStreamOperation`:

1. Validate the new name is free locally and remotely.
2. `PUT` under the new name. Failure → `FAILED`, nothing changed.
3. `GET` to verify. Failure → delete the partial remote stream, `ROLLED_BACK`.
4. Delete the old name. Failure → `CREATED_ON_TARGET` + `CONFLICT`; both names live and visible.
5. Update local fields, state `COMPLETED`.

Create-then-delete throughout: briefly duplicated is recoverable, briefly absent is an outage.

---

## 9. Transfer between servers

`POST /streams/:id/transfer { targetServerId }`, permission `tenant-streams:transfer`.

1. **Validate** — target belongs to the same business; the customer has an ACTIVE assignment with spare quota; `name` is free on the target; target `connectionStatus` is `CONNECTED`.
2. **Create on target** with all inputs and protocols. Failure → `FAILED`, source untouched.
3. **Verify on target.** Failure → delete the partial remote stream, `ROLLED_BACK`.
4. **Disable, then delete on source.** Failure → `CREATED_ON_TARGET` + `CONFLICT`; live on both, visible and fixable.
5. **Update** `tenantFlussonicServerId`, state `COMPLETED`.

Configuration only — no recorded content is considered (Q6).

---

## 10. Permissions

Seeded through the existing `MODULES` list in `backend/prisma/seed.ts`, granted to `TENANT_ADMIN`; `SUPER_ADMIN` receives everything automatically.

**`tenant-streams`**

| Action | Gates |
|---|---|
| `list`, `view` | seeing streams and live status |
| `create`, `update`, `delete`, `restore` | CRUD |
| `enable`, `disable` | toggling without full edit rights — an operator can restart a feed but not repoint its source |
| `stop` | `POST /streams/{name}/stop`, a runtime restart distinct from `disabled` |
| `rename` | the destructive rename of §8 |
| `sync` | reconcile and orphan adoption |
| `transfer` | moving between servers |
| `view_sessions` | live sessions, which expose viewer IPs |
| `kick_session` | `DELETE /sessions/{id}` — disconnecting a viewer |

`rename`, `transfer`, `stop`, `kick_session` and `view_sessions` are deliberately separate from `update`: two are destructive, two are runtime actions, one is personal data.

**`tenant-customer-servers`**: `list`, `view`, `create`, `update`, `delete` — assigning servers and setting quotas is an admin act distinct from managing streams.

---

## 11. API surface

Dual controllers sharing one service. The tenant surface never accepts `tenantBusinessId` in a body — it is resolved from the caller, as with streaming servers.

**Streams** — `system/tenant-streams` and `tenant/streams`

| Method | Path | Permission |
|---|---|---|
| GET | `/` (filters: server, customer, status, syncStatus, search) | `list` |
| GET | `/:id` | `view` |
| GET | `/:id/status` (live runtime, not stored) | `view` |
| POST | `/` | `create` |
| PATCH | `/:id` (rejects name changes) | `update` |
| DELETE | `/:id` | `delete` |
| PATCH | `/:id/restore` | `restore` |
| POST | `/:id/enable` \| `/:id/disable` | `enable` \| `disable` |
| POST | `/:id/stop` | `stop` |
| POST | `/:id/rename` | `rename` |
| POST | `/:id/transfer` | `transfer` |
| GET | `/:id/sessions` | `view_sessions` |
| DELETE | `/:id/sessions/:sessionId` | `kick_session` |

**Server-level** — implemented on the *streams* controllers, not the streaming-servers ones as
originally planned: putting them on the servers controller would make servers depend on streams
while streams already depends on servers, a module cycle.

| Method | Path | Permission |
|---|---|---|
| POST | `servers/:serverId/sync` | `tenant-streams:sync` |
| GET | `servers/:serverId/unmanaged` | `tenant-streams:sync` |
| POST | `servers/:serverId/adopt` | `tenant-streams:sync` |

**Assignments** — `system/tenant-customer-servers` and `tenant/customer-servers`: standard CRUD.

---

## 12. Frontend

Existing `ResourceTable` + `RowActionsMenu` + dialog patterns cover everything. The stream form mirrors the old portal:

- **Identity** — application name, key, read-only derived `Name` preview, title. On edit, the name fields are disabled with a Rename action beside them (§8).
- **Settings** — ingest domain, comment, retry limit, source timeout, Static and Disabled toggles.
- **Inputs** — repeatable rows: URL (with scheme presets that build it), source timeout, comment, plus advanced timeout / frames timeout / user agent / max bitrate; add, remove, reorder, priority from order.
- **Protocols** — the 17 toggles in a responsive grid, with the **whitelist mode switch presented separately and labelled as allow-list vs deny-list**, never as an eighteenth protocol (§4.4).

Other screens:

- **Streams page** in the tenant sidebar beside Streaming Servers: filters for server/customer/status/sync, sync badge per row, row actions for edit, enable/disable, stop, rename, transfer, sessions, delete.
- **Transfer dialog** showing each target server's remaining quota, so an impossible transfer cannot be selected.
- **Sessions drawer** — live table with manual refresh and a Kick action; no polling by default.
- **Customer detail** — assigned servers with quota usage (`3 / 10`), a Dedicated badge, and that customer's streams.
- **Server detail** — stream count, last sync, a Sync now button beside Check Connection, and unmanaged streams with Adopt.

"Flussonic" continues to appear nowhere in the frontend; the API stays vendor-neutral and the service maps to the vendor columns.

---

## 13. Explicitly out of scope

- **DVR / recording.** No calls to `/dvr/ranges`, `/dvr/locks` or `/dvr/export`; no recording state modelled. Consequence to accept: renaming or transferring a stream leaves any recorded content behind on the old name or server, unmanaged by us.
- **Customer portal.** The `username` / `passwordHash` columns on `TenantCustomer` stay dormant. Adding it later means a third controller surface and a customer-scoped guard.
- **Unmapped config** — transcoder, DRM, pushes, thumbnails, ABR, auth hooks. Preserved on write (§4.2) but not editable here.

---

## 14. Verification

Following how the existing server integration was validated:

- **Canonical hashing** — property-tested: reordering JSON keys or re-serialising must not change the hash; reordering inputs must, since priority is meaningful.
- **`toServerConfig` / `fromServerConfig`** — round-trip tested, so adopting a remote stream yields the same hash as pushing it. Plus an explicit test that unmapped remote fields survive a write (§4.2).
- **Protocol whitelist semantics** — tested both ways: `whitelist: true` restricts to the listed set, `false` forbids it. This is the bug with the worst blast radius.
- **`named_by` filtering** — `user` and `remote` streams never appear as orphans and are never deleted (§6.3).
- **Reconcile classification** — a pure function over `(remote[], local[])`; every branch of §6.5, including multi-page cursor results, no network.
- **Limit enforcement** — stubbed Prisma: at limit, under limit, soft-deleted excluded, restore re-checks, adoption counts.
- **Rename and transfer** — failure injected at each step, asserting the stream is never absent from both servers.
- **HTTP behaviour** — against a local stub, as the connection probe already is.
- **Live verification** only at the end of each phase and with explicit go-ahead, since it mutates a production streamer.

---

## 15. Sequencing

| Phase | Delivers | Status |
|---|---|---|
| 0 | Pin endpoints, payloads, protocol list from the live schema | **done** |
| 1 | `TenantStream` + inputs + protocols, permissions, local CRUD, both controllers, streams page | **done** |
| 2 | Write-through, `configHash`, manual reconcile with cursor paging, orphan adoption | **done** |
| 3 | `TenantCustomerServer`, quotas, dedicated flag, customer detail | **done** |
| 3b | Customer portal: own login, assigned servers with quota, stream view/reload/disable/enable, restricted edit, `tenant-customers:login-as` | **done** |
| 4 | Rename with its state machine | **done** |
| 5 | Live status, sessions, kick | after 1 |
| 6 | Transfer between servers | after 2 and 3 |
| 7 | Scheduled sync + `PENDING_PUSH` retry | after 2 |

One unresolved detail, non-blocking: whether `POST /streams/{name}/stop` should be surfaced as "Restart" (it stops a running stream, which a static stream then re-establishes). Confirm against a live stream in Phase 5.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Protocol whitelist flag misread as a protocol | §4.4; tested both ways (§14). Would invert playback access on every stream |
| Adopting or deleting ephemeral `user` streams | `named_by` filtering (§6.3) |
| Our writes blanking unmapped config | Merge remote config on write (§4.2) |
| Two businesses collide on one server | `@@unique([serverId, name])` (§4.1) |
| Rename silently drops viewers | Separate endpoint, permission, confirmation (§8) |
| Rename/transfer leaves a stream on both servers | Create-then-delete; `CONFLICT` visible |
| Sync deletes hand-made streams | Orphans never auto-deleted |
| False drift from unstable serialisation | Canonical serialisation, property-tested |
| Reconcile reads only the first 100 streams | Cursor paging in §6.5 |
| Sessions expose viewer IPs | Separate `view_sessions` / `kick_session` permissions |
| Scheduled sync overlaps on a slow server | Per-server concurrency guard |
| Protocol list drifts from Flussonic | Single Zod-declared list shared by API and UI |
