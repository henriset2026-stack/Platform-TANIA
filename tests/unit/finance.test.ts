import { describe, expect, it } from "vitest";

import {
  IRR_LOWER_BOUND,
  countSignChanges,
  internalRateOfReturn,
  netPresentValue,
  paybackPeriod,
  resolveCashflows,
  returnOnInvestment,
  type CashflowPeriod,
} from "@/lib/calculations/finance";

function cf(amounts: readonly (number | null)[]): readonly CashflowPeriod[] {
  return amounts.map((amount, period) => ({ period, amount, label: `P${period}` }));
}

describe("unit: NPV", () => {
  // Hand-checked: -100 + 50/1.1 + 50/1.21 + 50/1.331 = 24.3426...
  it("discounts each period and leaves period 0 alone", () => {
    const result = netPresentValue(cf([-100, 50, 50, 50]), 0.1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.npv).toBeCloseTo(24.34, 2);
    expect(result.value.discounted[0]?.present).toBe(-100);
  });

  it("returns the undiscounted sum at a zero rate", () => {
    const result = netPresentValue(cf([-100, 60, 60]), 0);
    expect(result.ok && result.value.npv).toBe(20);
  });

  // The single figure that most changes an NPV is not allowed to default.
  it("refuses without a discount rate rather than assuming one", () => {
    const result = netPresentValue(cf([-100, 50]), null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toBe("NO_DISCOUNT_RATE");
    expect(result.refusal.detail).toMatch(/defaulting it would hide/i);
  });

  it("refuses a rate at or below -100%", () => {
    expect(netPresentValue(cf([-100, 50]), -1).ok).toBe(false);
    expect(netPresentValue(cf([-100, 50]), Number.NaN).ok).toBe(false);
  });

  // Unknown spend and zero spend are different facts.
  it("refuses when any cashflow is unknown, rather than treating it as zero", () => {
    const result = netPresentValue(cf([-100, null, 50]), 0.1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toBe("UNKNOWN_AMOUNT");
    expect(result.refusal.detail).toMatch(/not zero/i);
  });

  it("refuses an empty series", () => {
    expect(resolveCashflows([]).ok).toBe(false);
  });
});

describe("unit: IRR", () => {
  // Hand-checked: -100 + 60/(1+r) + 60/(1+r)^2 = 0 → r = 13.065%.
  it("finds the unique rate by bisection", () => {
    const result = internalRateOfReturn(cf([-100, 60, 60]));
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "unique") throw new Error("expected unique");
    expect(result.value.rate).toBeCloseTo(0.13065, 4);
  });

  it("agrees with NPV: the IRR is the rate where NPV is zero", () => {
    const flows = cf([-250, 100, 100, 100]);
    const irr = internalRateOfReturn(flows);
    if (!irr.ok || irr.value.kind !== "unique") throw new Error("expected unique");
    const npv = netPresentValue(flows, irr.value.rate);
    expect(npv.ok && Math.abs(npv.value.npv)).toBeLessThan(0.01);
  });

  // Returning 0 or -100% here would be a fabricated figure stated confidently.
  it("reports no IRR when the cashflows never change sign", () => {
    const result = internalRateOfReturn(cf([-100, -50, -20]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("none");
  });

  // Several real roots are possible; picking one would look authoritative.
  it("reports ambiguity rather than picking one of several roots", () => {
    const result = internalRateOfReturn(cf([-100, 300, -250]));
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.value.signChanges).toBe(2);
    expect(result.value.detail).toMatch(/more than one real IRR/i);
  });

  it("counts sign changes, ignoring zeroes", () => {
    expect(countSignChanges([-1, 1, 1])).toBe(1);
    expect(countSignChanges([-1, 0, 1, -1])).toBe(2);
    expect(countSignChanges([1, 2, 3])).toBe(0);
  });

  it("reports none when the root lies outside the searched range", () => {
    // One sign change, but the return is far below the lower bound.
    const result = internalRateOfReturn([
      { period: 0, amount: -100, label: "P0" },
      { period: 1, amount: 0.0001, label: "P1" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind === "unique") {
      expect(result.value.rate).toBeGreaterThanOrEqual(IRR_LOWER_BOUND);
    } else {
      expect(result.value.kind).toBe("none");
    }
  });

  it("refuses on an unknown amount", () => {
    expect(internalRateOfReturn(cf([-100, null])).ok).toBe(false);
  });
});

describe("unit: payback", () => {
  it("interpolates within the crossing period", () => {
    const result = paybackPeriod(cf([-100, 40, 40, 40]));
    expect(result.ok && result.value.kind === "recovered" && result.value.periods).toBe(2.5);
  });

  it("lands exactly on a period boundary", () => {
    const result = paybackPeriod(cf([-100, 50, 50, 50]));
    expect(result.ok && result.value.kind === "recovered" && result.value.periods).toBe(2);
  });

  // No payback within the horizon is not the same as a long payback.
  it("reports never rather than a large number", () => {
    const result = paybackPeriod(cf([-100, 10, 10]));
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "never") throw new Error("expected never");
    expect(result.value.shortfall).toBe(-80);
    expect(result.value.detail).toMatch(/not a long payback/i);
  });
});

describe("unit: ROI", () => {
  it("computes net benefit over cost", () => {
    const result = returnOnInvestment(150, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roi).toBe(0.5);
    expect(result.value.netBenefit).toBe(50);
  });

  // A project with no recorded cost has an incomplete model, not infinite return.
  it("refuses a zero or negative cost rather than returning Infinity", () => {
    const zero = returnOnInvestment(150, 0);
    expect(zero.ok).toBe(false);
    if (zero.ok) return;
    expect(zero.refusal.reason).toBe("NO_INVESTMENT");
    expect(Number.isFinite(0 / 0)).toBe(false);
  });

  it("refuses when either side is unknown", () => {
    expect(returnOnInvestment(null, 100).ok).toBe(false);
    expect(returnOnInvestment(150, null).ok).toBe(false);
  });
});
