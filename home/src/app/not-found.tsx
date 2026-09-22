import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-page flex flex-col items-center py-32 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-cyan">404</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
        That page is <span className="text-gradient">off air</span>
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        The link may be old, or the page may have moved. The plans and the contact form are
        where you left them.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-lg px-6 py-3 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          Back home
        </Link>
        <Link
          href="/plans"
          className="rounded-lg border border-border-strong px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-2"
        >
          See plans
        </Link>
      </div>
    </section>
  );
}
