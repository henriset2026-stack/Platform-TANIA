import { AssistantMount } from "@/components/assistant/assistant-mount";
import { ScaleStrip } from "@/components/brand/scale-strip";
import { TaniaWordmark } from "@/components/brand/tania-wordmark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/top-bar";

/**
 * Application shell: fixed sidebar on desktop, sheet navigation below `lg`.
 * Server component — only SidebarNav and MobileNav opt into the client.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-surface-app)]">
      {/* Keyboard users must be able to reach content without tabbing the
          whole sidebar on every page. Visible only when focused. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside
        aria-label="Primary navigation"
        className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
      >
        <div className="flex h-14 items-center border-b border-slate-200 px-4">
          <TaniaWordmark showTagline />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <ScaleStrip />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>

      {/* Persistent assistant, bottom-right on every shell page (PRD §80.2). */}
      <AssistantMount />
    </div>
  );
}
