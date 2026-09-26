"use client";

import { Search as SearchIcon, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search field.
 *
 * A real <form role="search"> with a labelled input, not a decorated div.
 * The label is visually hidden rather than absent, and Escape clears — both
 * behaviours keyboard users expect and neither of which a placeholder
 * provides.
 *
 * `shortcutHint` renders the Ctrl K affordance from the mockup. It is
 * presentational only; binding the shortcut belongs to the page that owns the
 * search, not to the field.
 */
export function Search({
  label = "Cari",
  placeholder = "Cari talent, capability, proyek, atau tanya TANIA...",
  defaultValue = "",
  onSearch,
  shortcutHint,
  className,
}: {
  label?: string | undefined;
  placeholder?: string | undefined;
  defaultValue?: string | undefined;
  onSearch?: (query: string) => void;
  shortcutHint?: string | undefined;
  className?: string | undefined;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch?.(value);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
      />
      <Input
        id={id}
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            setValue("");
            onSearch?.("");
          }
        }}
        className={cn("pl-9", (value || shortcutHint) && "pr-20")}
      />

      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            onSearch?.("");
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
        >
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">Hapus pencarian</span>
        </button>
      ) : shortcutHint ? (
        <kbd
          aria-hidden="true"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-500"
        >
          {shortcutHint}
        </kbd>
      ) : null}
    </form>
  );
}
