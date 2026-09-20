import { describe, expect, it } from "vitest";
import {
  PHASE_STATUSES,
  PHASES,
  phasesClaimingCompletion,
  statusCounts,
} from "../../lib/status";

describe("implementation status registry", () => {
  it("has unique, contiguous phase ids starting at 0", () => {
    const ids = PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids[0]).toBe(0);
    expect(ids.at(-1)).toBe(ids.length - 1);
  });

  it("only uses declared status values", () => {
    for (const phase of PHASES) {
      expect(PHASE_STATUSES).toContain(phase.status);
    }
  });

  it("counts every phase exactly once", () => {
    const counts = statusCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(PHASES.length);
  });

  // Project rule 11/12: a phase may not claim to exist without provenance.
  it("requires evidence for any phase claiming completion", () => {
    for (const phase of phasesClaimingCompletion()) {
      expect(
        phase.evidence,
        `Phase ${phase.id} (${phase.name}) is marked ${phase.status} but cites no evidence`,
      ).toBeTruthy();
    }
  });

  // A later phase may legitimately be PARTIALLY_IMPLEMENTED — a foundational
  // slice often lands early. A phase may not be fully IMPLEMENTED while an
  // earlier one is still outstanding, which would mean work was skipped.
  it("keeps fully implemented phases a contiguous prefix", () => {
    const done = PHASES.filter((p) => p.status === "IMPLEMENTED").map(
      (p) => p.id,
    );
    expect(done).toEqual(Array.from({ length: done.length }, (_, i) => i));
  });

  it("allows partial phases only with evidence naming what is outstanding", () => {
    for (const phase of PHASES.filter(
      (p) => p.status === "PARTIALLY_IMPLEMENTED",
    )) {
      expect(
        phase.evidence,
        `Phase ${phase.id} is partial but does not say what remains`,
      ).toMatch(/outstanding|remaining|pending/i);
    }
  });
});
