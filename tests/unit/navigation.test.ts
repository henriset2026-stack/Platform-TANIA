import { describe, expect, it } from "vitest";

import { PRIMARY_NAV } from "../../lib/navigation";
import { isNavItemAvailable } from "../../lib/navigation-availability";
import { PHASES } from "../../lib/status";

describe("primary navigation", () => {
  it("covers the destinations named in PRD §24", () => {
    const labels = PRIMARY_NAV.map((i) => i.label);
    for (const expected of [
      "Executive Dashboard",
      "Talent",
      "Kinerja",
      "Capability",
      "Pengembangan",
      "Penugasan",
      "Proyek",
      "Dampak Bisnis",
      "Asisten AI",
      "Administrasi",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("gives every destination a declared permission", () => {
    for (const item of PRIMARY_NAV) {
      expect(item.permission, `${item.label} has no permission`).toMatch(
        /^[a-z_]+\.[a-z_]+$/,
      );
    }
  });

  it("references a real phase for every destination", () => {
    const ids = new Set(PHASES.map((p) => p.id));
    for (const item of PRIMARY_NAV) {
      expect(ids.has(item.implementedInPhase)).toBe(true);
    }
  });

  // The shell must not link to routes that do not exist yet.
  it("marks a destination available only when its phase is complete", () => {
    for (const item of PRIMARY_NAV) {
      const phase = PHASES.find((p) => p.id === item.implementedInPhase);
      expect(isNavItemAvailable(item)).toBe(phase?.status === "IMPLEMENTED");
    }
  });

  it("exposes no destination whose phase is still planned", () => {
    const available = PRIMARY_NAV.filter(isNavItemAvailable);
    for (const item of available) {
      const phase = PHASES.find((p) => p.id === item.implementedInPhase);
      expect(phase?.status).toBe("IMPLEMENTED");
    }
  });
});
