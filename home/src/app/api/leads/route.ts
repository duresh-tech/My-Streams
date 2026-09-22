import { NextResponse } from "next/server";

import { appendLead, getAllPlans } from "@/lib/db";

// The JSON store is written at request time, so this route must never be
// statically evaluated at build.
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const name = text(body.name, 120);
  const email = text(body.email, 200);
  const phone = text(body.phone, 30);
  const message = text(body.message, 2000);
  const source = text(body.source, 40) || "contact";

  if (name.length < 2) {
    return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  }

  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "That email address looks wrong." }, { status: 400 });
  }

  // A plan id that is not in the store is dropped rather than rejected - the
  // enquiry is still worth keeping.
  const plans = await getAllPlans();
  const requestedPlan = text(body.planId, 40);
  const planId = plans.some((plan) => plan.id === requestedPlan) ? requestedPlan : "";

  try {
    const lead = await appendLead({ name, email, phone, planId, message, source });
    return NextResponse.json({ id: lead.id, createdAt: lead.createdAt }, { status: 201 });
  } catch (error) {
    console.error("Failed to store lead", error);
    return NextResponse.json(
      { error: "We could not save that. Please email us instead." },
      { status: 500 },
    );
  }
}
