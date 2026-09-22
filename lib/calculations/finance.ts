/**
 * Financial engine — NPV, IRR, payback, ROI.
 *
 * Deterministic and pure, and unwilling to return a number it cannot stand
 * behind. Every function returns a discriminated result rather than a bare
 * figure, because the interesting cases here are the ones where the answer
 * does not exist:
 *
 *  - a cashflow that never turns positive has no IRR, and returning 0 or
 *    -100% would be a fabricated figure presented with full confidence;
 *  - a cashflow that changes sign more than once may have SEVERAL real IRRs,
 *    and returning whichever one bisection lands on first is worse than
 *    returning none, because it looks authoritative;
 *  - a project that never recovers its outlay has no payback period, which is
 *    not the same as a long one.
 *
 * The discount rate is never defaulted. "We assumed 10%" is a decision
 * somebody has to own, and a silent default hides the single number that most
 * changes an NPV.
 */

import type { MoneyAmount } from "@/lib/calculations/budget";

// ===========================================================================
// Cashflows
// ===========================================================================

export interface CashflowPeriod {
  /** 0 is the present; period 0 is never discounted. */
  readonly period: number;
  /** Null means unknown, and unknown is not zero. */
  readonly amount: MoneyAmount;
  readonly label: string;
}

export type FinanceRefusal =
  | { readonly reason: "NO_CASHFLOWS"; readonly detail: string }
  | { readonly reason: "UNKNOWN_AMOUNT"; readonly detail: string }
  | { readonly reason: "NO_DISCOUNT_RATE"; readonly detail: string }
  | { readonly reason: "INVALID_DISCOUNT_RATE"; readonly detail: string }
  | { readonly reason: "NO_INVESTMENT"; readonly detail: string };

export type FinanceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: FinanceRefusal };

function refuse<T>(refusal: FinanceRefusal): FinanceResult<T> {
  return { ok: false, refusal };
}

/**
 * Resolves cashflows into a dense, known series.
 *
 * A single unknown amount refuses the whole calculation. Treating it as zero
 * would understate cost or overstate benefit depending on where it sat, and
 * the reader would have no way to see which — the same rule budget.ts applies
 * to a budget line.
 */
export function resolveCashflows(
  periods: readonly CashflowPeriod[],
): FinanceResult<readonly number[]> {
  if (periods.length === 0) {
    return refuse({
      reason: "NO_CASHFLOWS",
      detail: "No cashflow periods were supplied.",
    });
  }

  const unknown = periods.filter((p) => p.amount === null);
  if (unknown.length > 0) {
    return refuse({
      reason: "UNKNOWN_AMOUNT",
      detail:
        `${unknown.length} cashflow period(s) have no known amount: ` +
        `${unknown.map((p) => p.label).join(", ")}. An unknown amount is not zero.`,
    });
  }

  const maxPeriod = Math.max(...periods.map((p) => p.period));
  const series = new Array<number>(maxPeriod + 1).fill(0);
  for (const period of periods) {
    if (period.period < 0 || !Number.isInteger(period.period)) {
      return refuse({
        reason: "NO_CASHFLOWS",
        detail: `Period ${period.period} is not a non-negative whole period.`,
      });
    }
    series[period.period] = (series[period.period] ?? 0) + (period.amount ?? 0);
  }
  return { ok: true, value: series };
}

// ===========================================================================
// NPV
// ===========================================================================

export interface NpvResult {
  readonly npv: number;
  readonly discountRate: number;
  /** Present value of each period, so the total can be checked line by line. */
  readonly discounted: readonly { period: number; undiscounted: number; present: number }[];
}

/**
 * Net present value at an explicitly supplied rate.
 *
 * `discountRate` is `number | null` rather than an optional with a default.
 * The null case returns a refusal naming what is missing, so a business case
 * cannot acquire a discount rate by omission.
 */
export function netPresentValue(
  periods: readonly CashflowPeriod[],
  discountRate: number | null,
): FinanceResult<NpvResult> {
  if (discountRate === null) {
    return refuse({
      reason: "NO_DISCOUNT_RATE",
      detail:
        "No discount rate was supplied. NPV cannot be calculated without one, and defaulting it " +
        "would hide the assumption that most changes the answer.",
    });
  }
  if (!Number.isFinite(discountRate) || discountRate <= -1) {
    return refuse({
      reason: "INVALID_DISCOUNT_RATE",
      detail: `A discount rate of ${discountRate} is outside the domain (must be greater than -1).`,
    });
  }

  const resolved = resolveCashflows(periods);
  if (!resolved.ok) return refuse(resolved.refusal);

  const discounted = resolved.value.map((amount, period) => ({
    period,
    undiscounted: amount,
    present: amount / Math.pow(1 + discountRate, period),
  }));

  return {
    ok: true,
    value: {
      npv: round2(discounted.reduce((sum, row) => sum + row.present, 0)),
      discountRate,
      discounted: discounted.map((row) => ({
        period: row.period,
        undiscounted: round2(row.undiscounted),
        present: round2(row.present),
      })),
    },
  };
}

function npvOf(series: readonly number[], rate: number): number {
  let total = 0;
  for (let period = 0; period < series.length; period += 1) {
    total += (series[period] ?? 0) / Math.pow(1 + rate, period);
  }
  return total;
}

// ===========================================================================
// IRR
// ===========================================================================

export const IRR_LOWER_BOUND = -0.9999;
export const IRR_UPPER_BOUND = 10;
export const IRR_TOLERANCE = 1e-9;
export const IRR_MAX_ITERATIONS = 400;

export type IrrOutcome =
  | { readonly kind: "unique"; readonly rate: number; readonly iterations: number }
  | {
      /** More than one sign change: several real roots are possible. */
      readonly kind: "ambiguous";
      readonly signChanges: number;
      readonly detail: string;
    }
  | { readonly kind: "none"; readonly detail: string };

/** Sign changes in the cashflow series — Descartes' rule of signs. */
export function countSignChanges(series: readonly number[]): number {
  let changes = 0;
  let previous = 0;
  for (const amount of series) {
    if (amount === 0) continue;
    const sign = amount > 0 ? 1 : -1;
    if (previous !== 0 && sign !== previous) changes += 1;
    previous = sign;
  }
  return changes;
}

/**
 * Internal rate of return, by bisection.
 *
 * Bisection rather than Newton-Raphson deliberately: Newton converges faster
 * but can diverge or jump outside the domain on the irregular cashflows a
 * real project produces, and a silently wrong IRR is the failure mode this
 * whole module exists to avoid. Bisection cannot diverge once a sign change
 * is bracketed.
 *
 * With more than one sign change the polynomial may have several real roots.
 * Bisection would return whichever the bracket happens to contain, so the
 * result is reported as ambiguous instead: "this project has an IRR of 18%"
 * is a much stronger claim than the arithmetic supports.
 */
export function internalRateOfReturn(
  periods: readonly CashflowPeriod[],
): FinanceResult<IrrOutcome> {
  const resolved = resolveCashflows(periods);
  if (!resolved.ok) return refuse(resolved.refusal);
  const series = resolved.value;

  const signChanges = countSignChanges(series);
  if (signChanges === 0) {
    return {
      ok: true,
      value: {
        kind: "none",
        detail:
          "The cashflows never change sign, so no rate makes their present value zero. " +
          "A project that is never positive has no internal rate of return.",
      },
    };
  }
  if (signChanges > 1) {
    return {
      ok: true,
      value: {
        kind: "ambiguous",
        signChanges,
        detail:
          `The cashflows change sign ${signChanges} times, so more than one real IRR may exist. ` +
          "Reporting a single rate here would be arbitrary; compare the scenarios on NPV instead.",
      },
    };
  }

  let low = IRR_LOWER_BOUND;
  let high = IRR_UPPER_BOUND;
  let npvLow = npvOf(series, low);
  let npvHigh = npvOf(series, high);

  if (npvLow === 0) return { ok: true, value: { kind: "unique", rate: low, iterations: 0 } };
  if (npvHigh === 0) return { ok: true, value: { kind: "unique", rate: high, iterations: 0 } };

  if (npvLow > 0 === npvHigh > 0) {
    return {
      ok: true,
      value: {
        kind: "none",
        detail:
          `No IRR lies between ${formatPercent(IRR_LOWER_BOUND)} and ${formatPercent(IRR_UPPER_BOUND)}. ` +
          "A rate outside that range is not a meaningful return on a development project.",
      },
    };
  }

  let iterations = 0;
  let mid = low;
  while (iterations < IRR_MAX_ITERATIONS) {
    mid = (low + high) / 2;
    const npvMid = npvOf(series, mid);

    if (Math.abs(npvMid) < IRR_TOLERANCE || (high - low) / 2 < IRR_TOLERANCE) break;

    if (npvMid > 0 === npvLow > 0) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
      npvHigh = npvMid;
    }
    iterations += 1;
  }

  return {
    ok: true,
    value: { kind: "unique", rate: Math.round(mid * 1e6) / 1e6, iterations },
  };
}

// ===========================================================================
// Payback
// ===========================================================================

export type PaybackOutcome =
  | { readonly kind: "recovered"; readonly periods: number }
  | { readonly kind: "never"; readonly shortfall: number; readonly detail: string };

/**
 * Periods until cumulative cashflow first turns non-negative.
 *
 * Interpolated within the crossing period, which assumes the period's flow
 * arrives evenly. That assumption is stated because it is not always true —
 * a single milestone payment does not arrive evenly — and a reader comparing
 * 2.5 with 2.8 periods should know the precision is smaller than it looks.
 */
export function paybackPeriod(
  periods: readonly CashflowPeriod[],
): FinanceResult<PaybackOutcome> {
  const resolved = resolveCashflows(periods);
  if (!resolved.ok) return refuse(resolved.refusal);
  const series = resolved.value;

  let cumulative = 0;
  for (let period = 0; period < series.length; period += 1) {
    const amount = series[period] ?? 0;
    const previous = cumulative;
    cumulative += amount;

    if (cumulative >= 0 && previous < 0) {
      const fraction = amount === 0 ? 0 : -previous / amount;
      return {
        ok: true,
        value: { kind: "recovered", periods: round2(period - 1 + fraction) },
      };
    }
    if (cumulative >= 0 && period === 0) {
      return { ok: true, value: { kind: "recovered", periods: 0 } };
    }
  }

  return {
    ok: true,
    value: {
      kind: "never",
      shortfall: round2(cumulative),
      detail:
        "Cumulative cashflow never turns positive across the modelled periods. " +
        "That is not a long payback period; it is no payback within the model's horizon.",
    },
  };
}

// ===========================================================================
// ROI
// ===========================================================================

export interface RoiResult {
  readonly roi: number;
  readonly netBenefit: number;
  readonly totalBenefit: number;
  readonly totalCost: number;
}

/**
 * Return on investment, undiscounted.
 *
 * Refuses on zero cost rather than returning Infinity. A project with no cost
 * does not have infinite return; it has a cost model nobody filled in.
 */
export function returnOnInvestment(
  totalBenefit: MoneyAmount,
  totalCost: MoneyAmount,
): FinanceResult<RoiResult> {
  if (totalBenefit === null || totalCost === null) {
    return refuse({
      reason: "UNKNOWN_AMOUNT",
      detail: "ROI needs both a total benefit and a total cost; one of them is unknown.",
    });
  }
  if (totalCost <= 0) {
    return refuse({
      reason: "NO_INVESTMENT",
      detail:
        `A total cost of ${totalCost} gives no meaningful ROI. A project with no recorded cost has an ` +
        "incomplete cost model, not an infinite return.",
    });
  }

  const netBenefit = totalBenefit - totalCost;
  return {
    ok: true,
    value: {
      roi: Math.round((netBenefit / totalCost) * 1e4) / 1e4,
      netBenefit: round2(netBenefit),
      totalBenefit: round2(totalBenefit),
      totalCost: round2(totalCost),
    },
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}
