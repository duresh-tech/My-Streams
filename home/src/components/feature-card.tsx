import { Icon } from "@/components/icon";
import type { Feature } from "@/lib/types";

export function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="surface-card group p-6 transition-colors duration-300 hover:border-border-strong">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 transition-transform duration-300 group-hover:scale-110"
        aria-hidden
      >
        <Icon name={feature.icon} className="h-5 w-5 text-brand-cyan" />
      </span>
      <h3 className="mt-5 text-base font-semibold">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
    </article>
  );
}
