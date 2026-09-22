"use client";

import { CheckCircle2, Loader2, MessageCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { buildWhatsAppUrl } from "@/lib/whatsapp";

interface PlanOption {
  id: string;
  name: string;
  groupLabel: string;
}

type Status = "idle" | "submitting" | "sent" | "error";

const FIELD =
  "w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-foreground placeholder:text-subtle-foreground focus:border-brand-blue focus:outline-none";

export function LeadForm({
  plans,
  defaultPlanId = "",
  source = "contact",
  whatsappNumber = "",
  siteName,
}: {
  plans: PlanOption[];
  defaultPlanId?: string;
  source?: string;
  /** Empty disables the WhatsApp handoff entirely. */
  whatsappNumber?: string;
  siteName: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form)) as Record<string, string>;

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong. Please try again.");
      }

      const chosen = plans.find((plan) => plan.id === payload.planId);
      const url = buildWhatsAppUrl(
        whatsappNumber,
        {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          planLabel: chosen && `${chosen.groupLabel} — ${chosen.name}`,
          message: payload.message,
        },
        siteName,
      );

      setWhatsappUrl(url);
      form.reset();
      setStatus("sent");

      // The pop-up blocker may refuse this, since the await broke the chain
      // back to the click. The success panel always shows the link too.
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="surface-card flex flex-col items-start gap-3 p-6">
        <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
        <h3 className="text-lg font-semibold">Enquiry received</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We have your details and will reply with ingest credentials and a quote. Most
          enquiries get an answer the same day.
        </p>

        {whatsappUrl && (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              For a faster answer, send the same details over WhatsApp — the message is already
              written, you only need to press send.
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--gradient-brand)" }}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Continue on WhatsApp
            </a>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            setWhatsappUrl("");
            setStatus("idle");
          }}
          className="mt-1 text-sm font-medium text-brand-cyan hover:underline"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input id="name" name="name" required maxLength={120} className={FIELD} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={30}
            placeholder="Optional"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" required maxLength={200} className={FIELD} />
      </div>

      <div>
        <label htmlFor="planId" className="mb-1.5 block text-sm font-medium">
          Plan you are interested in
        </label>
        <select id="planId" name="planId" defaultValue={defaultPlanId} className={FIELD}>
          <option value="">Not sure yet — help me choose</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.groupLabel} — {plan.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          What are you broadcasting?
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="Encoder, expected audience size, how often you go live."
          className={FIELD}
        />
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        style={{ background: "var(--gradient-brand)" }}
      >
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {status === "submitting" ? "Sending" : "Send enquiry"}
      </button>

      <p className="text-xs text-subtle-foreground">
        We use your details to answer this enquiry. Nothing is shared with anyone else.
        {whatsappNumber &&
          " After sending, WhatsApp opens with the same details ready for you to forward to us."}
      </p>
    </form>
  );
}
