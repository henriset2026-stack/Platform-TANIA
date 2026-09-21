import { cn } from "@/lib/utils";

/**
 * Card-shaped section with a heading and optional action.
 *
 * Uses a real <section> with aria-labelledby rather than a div, so the page
 * has a navigable landmark structure. The heading level is a prop because a
 * section's correct level depends on where it sits, and hard-coding <h2>
 * produces broken outlines on nested pages.
 */
export function SectionCard({
  title,
  description,
  action,
  headingLevel = 2,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  headingLevel?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-[var(--radius-card)] border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <Heading
            id={id}
            className="text-base font-semibold text-[var(--color-telkom-navy)]"
          >
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Page heading block. One <h1> per page. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 pb-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-[var(--color-telkom-navy)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
