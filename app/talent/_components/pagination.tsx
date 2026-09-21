import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Pagination.
 *
 * Links, not buttons, so pages are shareable and work without JavaScript.
 * aria-live announces the position, since "page 3 of 7" is otherwise only
 * visual.
 */
export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || value === undefined) continue;
      params.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
    }
    if (target > 1) params.set("page", String(target));
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 pt-4"
    >
      <p aria-live="polite" className="text-sm text-slate-600">
        Page {page} of {pageCount} · {total} {total === 1 ? "person" : "people"}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" render={<Link href={href(page - 1)}>Previous</Link>} />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {page < pageCount ? (
          <Button variant="outline" size="sm" render={<Link href={href(page + 1)}>Next</Link>} />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}
