import { describe, expect, it } from "vitest";

import { isLive, notConnected } from "../../types/data";
import type { DataPoint } from "../../types/data";

describe("data provenance contract", () => {
  it("treats a not-connected point as not live", () => {
    expect(isLive(notConnected(9, "performance_metrics"))).toBe(false);
  });

  it("carries the phase and dependency that would supply the value", () => {
    const point = notConnected(8, "capabilities + talent_capabilities");
    expect(point.requiredPhase).toBe(8);
    expect(point.requires).toContain("capabilities");
  });

  it("narrows to a value only when live, and then provenance is present", () => {
    const point: DataPoint<number> = {
      state: "live",
      value: 42,
      provenance: {
        source: "supabase:performance_metrics",
        asOf: "2026-09-20T00:00:00.000Z",
        validated: true,
      },
    };

    if (!isLive(point)) throw new Error("expected live point");
    expect(point.value).toBe(42);
    expect(point.provenance.source).toBeTruthy();
    expect(point.provenance.asOf).toBeTruthy();
  });

  it("has no variant that carries a value without provenance", () => {
    // Guards the core rule: a number cannot reach the UI unsourced.
    const nonLive: Array<DataPoint<number>> = [
      notConnected(1, "x"),
      { state: "empty" },
      { state: "restricted", reason: "out of scope" },
      { state: "failed", reason: "timeout" },
    ];
    for (const point of nonLive) {
      expect("value" in point).toBe(false);
    }
  });
});
