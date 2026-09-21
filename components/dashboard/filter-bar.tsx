"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export interface FilterDefinition {
  readonly id: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
  readonly allLabel?: string | undefined;
}

/**
 * Filter row.
 *
 * Each control is a labelled Select, and the label is rendered — not replaced
 * by a placeholder. "Chapter" above a control is what tells a screen-reader
 * user what they are choosing; a greyed-out "All chapters" inside it does not.
 *
 * Active filters are summarised in a live region so the change is announced,
 * not merely visible.
 */
export function FilterBar({
  filters,
  values,
  onChange,
  onReset,
  children,
  className,
}: {
  filters: readonly FilterDefinition[];
  values: Readonly<Record<string, string>>;
  onChange: (id: string, value: string) => void;
  onReset?: () => void;
  /** Extra controls, e.g. a Search field. */
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  const activeCount = filters.filter(
    (f) => values[f.id] && values[f.id] !== "all",
  ).length;

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-slate-200 bg-white p-3",
        className,
      )}
    >
      {children ? <div className="min-w-48 flex-1">{children}</div> : null}

      {filters.map((filter) => (
        <div key={filter.id} className="flex flex-col gap-1">
          <label
            htmlFor={`filter-${filter.id}`}
            className="text-xs font-medium text-slate-600"
          >
            {filter.label}
          </label>
          <Select
            value={values[filter.id] ?? "all"}
            onValueChange={(value) => onChange(filter.id, String(value))}
          >
            <SelectTrigger id={`filter-${filter.id}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {filter.allLabel ?? `All ${filter.label.toLowerCase()}`}
              </SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      {onReset && activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X aria-hidden="true" className="size-4" />
          Clear
        </Button>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {activeCount === 0
          ? "No filters applied"
          : `${activeCount} filter${activeCount === 1 ? "" : "s"} applied`}
      </p>
    </div>
  );
}
