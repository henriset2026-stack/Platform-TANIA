"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Primary navigation list.
 *
 * Client component because it reads the active pathname. Destinations whose
 * implementing phase is not complete render as disabled with the phase number,
 * so the shell never links to a route that does not exist.
 *
 * Disabling here is presentation only. Authorization is enforced server-side
 * and in RLS (CLAUDE.md §4.1).
 */
export function SidebarNav({
  available,
  onNavigate,
}: {
  /** Ids of reachable destinations, computed on the server (lib/navigation-availability). */
  available: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Utama" className="px-2 py-3">
      <ul className="space-y-0.5">
        {PRIMARY_NAV.map((item) => {
          const isAvailable = available.includes(item.id);
          const active = pathname === item.href;
          const Icon = item.icon;

          if (!isAvailable) {
            return (
              <li key={item.id}>
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-400 select-none"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    P{item.implementedInPhase}
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                {...(active ? { "aria-current": "page" as const } : {})}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-telkom-navy)] font-medium text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
