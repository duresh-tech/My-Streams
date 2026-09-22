export interface SiteContact {
  email: string;
  phone: string;
  whatsapp: string;
  addressLocality: string;
  addressCountry: string;
  supportHours: string;
}

export interface Site {
  name: string;
  legalName: string;
  url: string;
  locale: string;
  currency: string;
  currencySymbol: string;
  logo: string;
  tagline: string;
  description: string;
  contact: SiteContact;
  social: Record<string, string>;
  nav: { label: string; href: string }[];
  stats: { value: string; label: string }[];
  protocols: string[];
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  summary: string;
  highlight: string;
  popular: boolean;
  features: string[];
}

export interface PlanGroup {
  id: string;
  label: string;
  blurb: string;
  period: string;
  periodSuffix: string;
  plans: Plan[];
}

export interface Pricing {
  groups: PlanGroup[];
  footnotes: string[];
}

export interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface Step {
  id: string;
  title: string;
  description: string;
}

export interface Features {
  platform: Feature[];
  control: Feature[];
  steps: Step[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface LegalSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  summary: string;
  /** ISO date - rendered as the "last updated" line. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export interface Legal {
  documents: LegalDocument[];
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  planId: string;
  message: string;
  source: string;
  createdAt: string;
}

/** Shape accepted by POST /api/leads - everything the visitor can supply. */
export type LeadInput = Omit<Lead, "id" | "createdAt">;
