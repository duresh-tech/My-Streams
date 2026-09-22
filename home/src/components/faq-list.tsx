import { Plus } from "lucide-react";

import type { Faq } from "@/lib/types";

/**
 * Built on <details> so the answers are open-able (and indexable) without any
 * client-side JavaScript.
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/60">
      {faqs.map((faq) => (
        <details key={faq.id} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground hover:bg-surface-2/60">
            {faq.question}
            <Plus
              className="h-4 w-4 shrink-0 text-brand-cyan transition-transform duration-200 group-open:rotate-45"
              aria-hidden
            />
          </summary>
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
