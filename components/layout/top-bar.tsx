import { Bell, Search, Sparkles } from "lucide-react";

import { UserIdentity } from "@/components/dashboard/user-identity";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TaniaWordmark } from "@/components/brand/tania-wordmark";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth/session";
import { resolveDashboardView } from "@/lib/dashboard/views";

/**
 * Global header — TANIA_PRD_v2.0.md §24.
 *
 * Search, AI Assistant, Notifications and Profile are rendered as affordances
 * but are inert: they are delivered in later phases. Each is disabled rather
 * than wired to a stub, so nothing appears to work that does not.
 */
export async function TopBar({ availableNav }: { availableNav: readonly string[] }) {
  // Identity is read server-side. Nothing about the signed-in user reaches the
  // browser except what is rendered here.
  const context = await getAuthContext();
  const view = context ? resolveDashboardView(context) : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-4">
      <MobileNav availableNav={availableNav} />

      {/* Wordmark shows on mobile, where the sidebar is collapsed. */}
      <TaniaWordmark className="lg:hidden" />

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Cari — Fase 7"
        aria-label="Cari (belum tersedia)"
      >
        <Search aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Asisten AI — Fase 15"
        aria-label="Asisten AI (belum tersedia)"
      >
        <Sparkles aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifikasi — Fase 19"
        aria-label="Notifikasi (belum tersedia)"
      >
        <Bell aria-hidden="true" className="size-4" />
      </Button>

      {context ? (
        <UserIdentity
          name={context.email || "Sudah masuk"}
          role={view?.title}
          size="sm"
          className="ml-2"
        />
      ) : (
        <div
          aria-label="Belum masuk"
          title="Tidak ada sesi aktif"
          className="ml-1 flex size-8 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] font-medium text-slate-400"
        >
          —
        </div>
      )}
    </header>
  );
}
