import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import type {
  Faq,
  Features,
  Lead,
  LeadInput,
  Legal,
  LegalDocument,
  Pricing,
  Site,
} from "./types";

/**
 * JSON file store. Everything the public pages render comes from data/*.json,
 * and the only file written at runtime is leads.json.
 */
const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

/**
 * Writes via a temp file and a rename so a crash mid-write cannot leave a
 * half-written JSON file behind.
 */
async function writeJson(file: string, value: unknown): Promise<void> {
  const target = path.join(DATA_DIR, file);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

// cache() dedupes reads within a single render pass.
export const getSite = cache(() => readJson<Site>("site.json"));
export const getPricing = cache(() => readJson<Pricing>("plans.json"));
export const getFeatures = cache(() => readJson<Features>("features.json"));
export const getFaqs = cache(() => readJson<Faq[]>("faqs.json"));

export const getLegalDocuments = cache(async () => {
  const legal = await readJson<Legal>("legal.json");
  return legal.documents;
});

export async function getLegalDocument(slug: string): Promise<LegalDocument | undefined> {
  const documents = await getLegalDocuments();
  return documents.find((document) => document.slug === slug);
}

/** Every plan across all groups, for form selects and lookups. */
export const getAllPlans = cache(async () => {
  const pricing = await getPricing();
  return pricing.groups.flatMap((group) =>
    group.plans.map((plan) => ({ ...plan, groupId: group.id, groupLabel: group.label })),
  );
});

export async function getLeads(): Promise<Lead[]> {
  try {
    return await readJson<Lead[]>("leads.json");
  } catch (error) {
    // A missing store just means nobody has submitted yet.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// Serialises concurrent appends so two submissions cannot clobber each other.
let writeQueue: Promise<unknown> = Promise.resolve();

export function appendLead(input: LeadInput): Promise<Lead> {
  const run = async (): Promise<Lead> => {
    const leads = await getLeads();
    const lead: Lead = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await writeJson("leads.json", [...leads, lead]);
    return lead;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => undefined);
  return next;
}
