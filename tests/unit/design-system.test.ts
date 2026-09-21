import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { initials } from "@/components/dashboard/user-identity";
import { TANIA_STATES } from "@/components/brand/tania-avatar";
import {
  CAPABILITY_STATUSES,
  CAPABILITY_STATUS_LABELS,
  CAPABILITY_STATUS_TONE,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  WORK_STATUS_TONE,
  gapToStatus,
} from "@/types/status";

const ROOT = join(import.meta.dirname, "..", "..");

function readAll(dir: string): string {
  const full = join(ROOT, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(full, f), "utf8"))
    .join("\n");
}

describe("status vocabulary", () => {
  it("labels and tones every capability status", () => {
    for (const status of CAPABILITY_STATUSES) {
      expect(CAPABILITY_STATUS_LABELS[status]).toBeTruthy();
      expect(CAPABILITY_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("labels and tones every work status", () => {
    for (const status of WORK_STATUSES) {
      expect(WORK_STATUS_LABELS[status]).toBeTruthy();
      expect(WORK_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("maps capability gap to a status monotonically", () => {
    expect(gapToStatus(-1)).toBe("strong");
    expect(gapToStatus(0)).toBe("strong");
    expect(gapToStatus(1)).toBe("on_track");
    expect(gapToStatus(2)).toBe("needs_attention");
    expect(gapToStatus(3)).toBe("critical_gap");
    expect(gapToStatus(4)).toBe("critical_gap");
  });
});

describe("initials", () => {
  it("derives initials from a full name", () => {
    expect(initials("Budi Santoso")).toBe("BS");
    expect(initials("Henri")).toBe("H");
    expect(initials("  Ana  Maria  Lopez ")).toBe("AL");
  });

  it("never renders blank", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("TANIA avatar", () => {
  it("covers the presence states specified by the PRD", () => {
    expect([...TANIA_STATES]).toEqual([
      "idle",
      "greeting",
      "listening",
      "thinking",
      "answering",
      "expanded",
    ]);
  });
});

// ===========================================================================
// Accessibility and design-system invariants, checked against source.
// ===========================================================================
describe("accessibility invariants", () => {
  const dashboard = readAll("components/dashboard");
  const layout = readAll("components/layout");
  const brand = readAll("components/brand");
  const all = [dashboard, layout, brand].join("\n");

  it("never removes focus outlines", () => {
    expect(all).not.toMatch(/outline-none(?!.*focus-visible)/);
    expect(all).not.toMatch(/focus:outline-none(?!.*focus-visible)/);
  });

  it("marks decorative icons aria-hidden", () => {
    // Every lucide icon rendered directly should be hidden from the
    // accessibility tree, since an adjacent text label carries the meaning.
    const iconUsages = all.match(/<(Icon|ChevronRight|SearchIcon|X|CircleAlert|TrendingUp|TrendingDown)\b[^>]*>/g) ?? [];
    for (const usage of iconUsages) {
      expect(usage, `icon without aria-hidden: ${usage}`).toMatch(/aria-hidden/);
    }
  });

  it("gives the loading state a live region and a label", () => {
    const states = readFileSync(join(ROOT, "components/dashboard/states.tsx"), "utf8");
    expect(states).toMatch(/role="status"/);
    expect(states).toMatch(/aria-busy/);
    expect(states).toMatch(/aria-live/);
    expect(states).toMatch(/sr-only/);
  });

  it("gives the error state role=alert", () => {
    const states = readFileSync(join(ROOT, "components/dashboard/states.tsx"), "utf8");
    expect(states).toMatch(/role="alert"/);
  });

  it("labels the search field rather than relying on a placeholder", () => {
    const search = readFileSync(join(ROOT, "components/dashboard/search.tsx"), "utf8");
    expect(search).toMatch(/role="search"/);
    expect(search).toMatch(/<label htmlFor=\{id\}/);
    expect(search).toMatch(/sr-only/);
  });

  it("requires an accessible label on progress", () => {
    const progress = readFileSync(
      join(ROOT, "components/dashboard/progress-meter.tsx"),
      "utf8",
    );
    expect(progress).toMatch(/aria-label=\{label\}/);
    // `label` must be required, not optional.
    expect(progress).toMatch(/\blabel: string;/);
  });

  it("gives tables a caption and column scope", () => {
    const table = readFileSync(join(ROOT, "components/dashboard/data-table.tsx"), "utf8");
    expect(table).toMatch(/<caption/);
    expect(table).toMatch(/scope="col"/);
  });

  it("provides a skip link to main content", () => {
    expect(layout).toMatch(/skip-link/);
    expect(layout).toMatch(/id="main-content"/);
  });

  it("opens external links safely", () => {
    expect(all).not.toMatch(/target="_blank"(?![\s\S]{0,120}rel="noopener)/);
  });
});

describe("design token discipline", () => {
  const dashboard = readAll("components/dashboard");
  const brand = readAll("components/brand");

  it("uses tokens rather than raw hex colours", () => {
    const hex = [dashboard, brand].join("\n").match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hex, `raw hex in components: ${hex.join(", ")}`).toEqual([]);
  });

  it("defines the four capability states as tokens", () => {
    const css = readFileSync(join(ROOT, "styles/globals.css"), "utf8");
    for (const token of [
      "--color-status-strong",
      "--color-status-ontrack",
      "--color-status-attention",
      "--color-status-critical",
    ]) {
      expect(css, `missing token ${token}`).toContain(token);
    }
  });

  it("respects prefers-reduced-motion", () => {
    const css = readFileSync(join(ROOT, "styles/globals.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

// The design system must not reintroduce fabricated data (CLAUDE.md §2a).
describe("provenance discipline", () => {
  it("renders no invented metric values in the showcase", () => {
    const page = readFileSync(join(ROOT, "app/design-system/page.tsx"), "utf8");
    const liveStates = page.match(/state:\s*"live"/g) ?? [];
    expect(liveStates, "showcase fabricates a live data point").toEqual([]);
  });
});
