# MyStreams — public site (`home/`)

Marketing and lead-capture front end for [mystreams.in](https://www.mystreams.in). Standalone
Next.js 15 app, separate from `frontend/` (the tenant/customer console) and `backend/`.

Content lives in JSON files rather than a database. Editing `data/*.json` is the whole content
workflow — no rebuild of component code needed, just a restart (or a rebuild for static pages).

## Run it

```bash
cd home
npm install
npm run dev      # http://localhost:3100
npm run build && npm start
npm run lint
```

Port 3100 keeps it clear of the console app's default 3000.

## The JSON store

| File | Written by | Holds |
| --- | --- | --- |
| `data/site.json` | you | Brand name, URL, logo path, contact details, nav, stat band |
| `data/plans.json` | you | Plan groups (`monthly`, `annual`), prices, features, footnotes |
| `data/features.json` | you | Platform features, dashboard/control features, onboarding steps |
| `data/faqs.json` | you | FAQ entries, rendered on `/` (first five) and `/plans` (all) |
| `data/legal.json` | you | Terms, refund policy and privacy policy, rendered by `/legal/[slug]` |
| `data/leads.json` | the app | Enquiries posted to `/api/leads` — gitignored |

Access goes through [`src/lib/db.ts`](src/lib/db.ts). Reads are wrapped in React `cache()` so a
render pass hits each file once. Writes go to a temp file and are renamed into place, and
concurrent appends are queued, so two submissions arriving together cannot clobber each other.

### Editing plans

`data/plans.json` drives the pricing tabs, the plan dropdown on the contact form, and the
`OfferCatalog` structured data in the page head. A group needs `id`, `label`, `blurb`, `period`
(`month` or `year`), `periodSuffix`, and `plans[]`. Set `"popular": true` on at most one plan per
group — that is what draws the gradient border and the *Most popular* flag.

Current plan data follows the packages on the reference site: monthly tiers at ₹499 / ₹799 /
₹999 / ₹1,899 sized by concurrent viewers, and annual bandwidth packages at ₹8,999 (4 TB),
₹12,999 (8 TB) and ₹19,999 (16 TB) on dedicated servers. **Confirm these against your own
costs before launch** — they are a starting point, not a commitment.

## Legal pages

`data/legal.json` holds three documents — Terms and Conditions, Refund and Cancellation Policy,
and Privacy Policy — as `{ slug, title, summary, updated, intro, sections[] }`. Each section has
a `heading`, a `body` array of paragraphs and an optional `list` of bullets. Adding a fourth
document is a matter of appending an object: the route, the `/legal` index, the footer column
and the sitemap all follow automatically.

Contact details are written as `{{siteName}}`, `{{siteUrl}}` and `{{email}}` tokens, resolved
from `site.json` at render time so they cannot go stale in three documents at once.

**These are drafts, not legal advice.** Two things must happen before they go live:

1. **Fill in the bracketed placeholders.** `[REGISTERED ENTITY NAME]`, `[REGISTERED ADDRESS]`,
   `[CITY]` (jurisdiction, in Terms §12) and `[GRIEVANCE OFFICER NAME]` (Privacy §11). They
   render literally, so they are hard to miss.
2. **Have a qualified professional review them**, particularly the liability cap (Terms §9),
   the refund windows, and the retention periods. Several figures are sensible defaults that
   are really your business decisions: the 7-day refund window on annual plans, the 90-day
   limit on refund requests, 5–10 business days to process a refund, 12-month retention of
   enquiries, and 30 days' notice of changes to the terms.

## Leads

`POST /api/leads` takes `{ name, email, phone, planId, message, source }`. `name` and a
well-formed `email` are required; an unrecognised `planId` is dropped rather than failing the
submission, since the enquiry is still worth keeping. Successful posts return `201` with the new
id and append to `data/leads.json`.

There is no admin UI — read the file, or point something at it. Note that on a serverless host
(Vercel and similar) the filesystem is ephemeral, so **leads written there will not survive a
redeploy**. On a normal Node host or container with a persistent volume it behaves as expected.

## Branding

- Logo: `public/brand/mystreams-logo.webp`, used in the header, footer, favicon and OG image.
- Colours: the logo's cyan → blue → violet → magenta sweep, defined once as
  `--gradient-brand` in [`src/app/globals.css`](src/app/globals.css) over a deep navy surface.
- The site is dark-only by design, so there is a single token set rather than a light/dark pair.

## Before launch

- `data/site.json` ships with `contact.phone`, `contact.whatsapp` and the social links empty —
  fill them in and the footer, contact page and structured data pick them up automatically. Any
  that stay empty are simply not rendered.
- `site.stats` are placeholder figures. Replace them with real numbers or drop the array.
- Review the plan prices as noted above.
