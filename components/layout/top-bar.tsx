import { Bell, Search, Sparkles } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

/**
 * Global header — TANIA_PRD_v2.0.md §24.
 *
 * Search, AI Assistant, Notifications and Profile are rendered as affordances
 * but are inert: they are delivered in later phases. Each is disabled rather
 * than wired to a stub, so nothing appears to work that does not.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-4">
      <MobileNav />

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Search — Phase 7"
        aria-label="Search (not yet available)"
      >
        <Search aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="AI Assistant — Phase 15"
        aria-label="AI Assistant (not yet available)"
      >
        <Sparkles aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifications — Phase 19"
        aria-label="Notifications (not yet available)"
      >
        <Bell aria-hidden="true" className="size-4" />
      </Button>

      <div
        aria-label="Signed-out placeholder"
        title="Authentication — Phase 3"
        className="ml-1 flex size-8 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] font-medium text-slate-400"
      >
        —
      </div>
    </header>
  );
}
