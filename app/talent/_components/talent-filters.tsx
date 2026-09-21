"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { FilterBar, Search } from "@/components/dashboard";
import { TALENT_STATUSES } from "@/lib/talent/filters";

/**
 * Directory filters.
 *
 * Writes to the URL and lets the server re-render. Filtering is not done in
 * the browser: the list must never contain rows the viewer cannot see, so the
 * database has to do the narrowing.
 *
 * Changing a filter resets to page 1 — staying on page 7 of a smaller result
 * set is a blank screen.
 */
export function TalentFilters({
  squads,
}: {
  squads: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (changes: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === "all") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const values: Record<string, string> = {
    status: searchParams.get("status") ?? "all",
    squad: searchParams.get("squad") ?? "all",
  };

  return (
    <FilterBar
      filters={[
        {
          id: "status",
          label: "Status",
          options: TALENT_STATUSES.map((s) => ({
            value: s,
            label: s.replace(/_/g, " "),
          })),
        },
        {
          id: "squad",
          label: "Squad",
          options: squads.map((s) => ({ value: s.id, label: s.name })),
        },
      ]}
      values={values}
      onChange={(id, value) => update({ [id]: value })}
      onReset={() => router.push(pathname)}
    >
      <Search
        label="Search talent"
        placeholder="Name, employee ID, or job title"
        defaultValue={searchParams.get("q") ?? ""}
        onSearch={(q) => update({ q })}
      />
    </FilterBar>
  );
}
