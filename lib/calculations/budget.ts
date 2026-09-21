/**
 * Budget engine — TANIA_PRD_v2.0.md §35, §61.
 *
 * Deterministic and pure, and deliberately unwilling to guess.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE
 * A financial figure is either known, with a stated source, or it is unknown.
 * There is no third case. Every amount is `number | null`, and null propagates
 * rather than defaulting to zero: unknown spend and zero spend are different
 * facts, and treating the first as the second understates commitment and
 * overstates remaining budget — the direction that causes overspend.
 */

export type MoneyAmount = number | null;

export interface BudgetLine {
  readonly projectId: string;
  readonly projectName: string;
  readonly fiscalYear: number;
  readonly currency: string;
  /** Planned internally by TANIA. */
  readonly planned: MoneyAmount;
  /** Sourced from the external finance system. */
  readonly committed: MoneyAmount;
  readonly realized: MoneyAmount;
  /** Name of the system the external figures came from, if any. */
  readonly externalSource: string | null;
  readonly externalSyncedAt: string | null;
}

export type BudgetFigureState = "known" | "unknown" | "not-integrated";

export interface BudgetFigure {
  readonly amount: MoneyAmount;
  readonly state: BudgetFigureState;
  readonly source: string | null;
  readonly syncedAt: string | null;
}

/**
 * Classifies a figure.
 *
 * Distinguishes "the external system is not integrated" from "it is
 * integrated but has no figure for this line". Both yield no number, but the
 * first is an infrastructure gap and the second may be genuine.
 */
export function classifyFigure(
  amount: MoneyAmount,
  externalSource: string | null,
  syncedAt: string | null,
  options: { externalOwned: boolean } = { externalOwned: false },
): BudgetFigure {
  if (amount !== null) {
    return { amount, state: "known", source: externalSource, syncedAt };
  }
  if (options.externalOwned && externalSource === null) {
    return { amount: null, state: "not-integrated", source: null, syncedAt: null };
  }
  return { amount: null, state: "unknown", source: externalSource, syncedAt };
}

export interface BudgetPosition {
  readonly planned: BudgetFigure;
  readonly committed: BudgetFigure;
  readonly realized: BudgetFigure;
  /** planned − committed. Null when either side is unknown. */
  readonly uncommitted: MoneyAmount;
  /** committed − realized. Null when either side is unknown. */
  readonly outstanding: MoneyAmount;
  /** realized ÷ planned, as a percentage. Null when either side is unknown. */
  readonly realizationPct: number | null;
  /** committed ÷ planned, as a percentage. Null when either side is unknown. */
  readonly commitmentPct: number | null;
}

/**
 * Derives a budget position.
 *
 * Every derived value is null unless BOTH inputs are known. A partially known
 * position yields partial answers rather than a complete-looking picture built
 * on an assumed zero.
 */
export function calculateBudgetPosition(line: BudgetLine): BudgetPosition {
  const planned = classifyFigure(line.planned, null, null);
  const committed = classifyFigure(line.committed, line.externalSource, line.externalSyncedAt, {
    externalOwned: true,
  });
  const realized = classifyFigure(line.realized, line.externalSource, line.externalSyncedAt, {
    externalOwned: true,
  });

  const subtract = (a: MoneyAmount, b: MoneyAmount): MoneyAmount =>
    a === null || b === null ? null : round2(a - b);

  const ratio = (a: MoneyAmount, b: MoneyAmount): number | null => {
    if (a === null || b === null) return null;
    // Dividing by a zero plan is undefined, not infinite.
    if (b === 0) return null;
    return Math.round((a / b) * 1000) / 10;
  };

  return {
    planned,
    committed,
    realized,
    uncommitted: subtract(line.planned, line.committed),
    outstanding: subtract(line.committed, line.realized),
    realizationPct: ratio(line.realized, line.planned),
    commitmentPct: ratio(line.committed, line.planned),
  };
}

// ===========================================================================
// Thresholds
// ===========================================================================

export interface BudgetThreshold {
  readonly code: string;
  readonly name: string;
  /** Percentage of plan at which this fires. */
  readonly thresholdPct: number;
  readonly severity: "info" | "warning" | "critical";
}

export interface BudgetAlert {
  readonly projectId: string;
  readonly projectName: string;
  readonly thresholdCode: string;
  readonly thresholdName: string;
  readonly severity: "info" | "warning" | "critical";
  readonly observedPct: number;
  readonly basis: "commitment" | "realization";
}

/**
 * Evaluates thresholds against a position.
 *
 * Fires ONLY on known figures. An unknown realization cannot breach a
 * threshold, and inventing a breach — or suppressing a real one by assuming
 * zero — are both worse than saying nothing. Unknown figures are surfaced
 * separately by the UI as an integration gap, not as a budget alert.
 *
 * Only the most severe breached threshold per basis is returned, so one
 * overspending project does not generate four alerts saying the same thing.
 */
export function evaluateBudgetAlerts(
  line: BudgetLine,
  position: BudgetPosition,
  thresholds: readonly BudgetThreshold[],
): readonly BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const severityRank = { info: 0, warning: 1, critical: 2 } as const;

  const evaluate = (pct: number | null, basis: "commitment" | "realization") => {
    if (pct === null) return;
    const breached = thresholds
      .filter((t) => pct >= t.thresholdPct)
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.thresholdPct - a.thresholdPct);

    const worst = breached[0];
    if (!worst) return;

    alerts.push({
      projectId: line.projectId,
      projectName: line.projectName,
      thresholdCode: worst.code,
      thresholdName: worst.name,
      severity: worst.severity,
      observedPct: pct,
      basis,
    });
  };

  evaluate(position.commitmentPct, "commitment");
  evaluate(position.realizationPct, "realization");

  return alerts;
}

// ===========================================================================
// Portfolio roll-up
// ===========================================================================

export interface PortfolioSummary {
  readonly currency: string;
  readonly lineCount: number;
  /** Totals over KNOWN figures only. */
  readonly totalPlanned: MoneyAmount;
  readonly totalCommitted: MoneyAmount;
  readonly totalRealized: MoneyAmount;
  /** How many lines contributed to each total. */
  readonly plannedKnownCount: number;
  readonly committedKnownCount: number;
  readonly realizedKnownCount: number;
  /** True when any figure was unknown, so the totals are partial. */
  readonly partial: boolean;
}

/**
 * Rolls up a portfolio.
 *
 * Sums only known figures and reports how many lines contributed, so a total
 * is never mistaken for a complete picture. `partial` is the flag the UI uses
 * to state plainly that the number is incomplete — a budget total that
 * silently omits unknown lines is the most dangerous figure in the product.
 *
 * Mixed currencies are refused rather than summed.
 */
export function summarizePortfolio(
  lines: readonly BudgetLine[],
): PortfolioSummary | { readonly error: "MIXED_CURRENCY" } {
  if (lines.length === 0) {
    return {
      currency: "",
      lineCount: 0,
      totalPlanned: null,
      totalCommitted: null,
      totalRealized: null,
      plannedKnownCount: 0,
      committedKnownCount: 0,
      realizedKnownCount: 0,
      partial: false,
    };
  }

  const currencies = new Set(lines.map((l) => l.currency));
  if (currencies.size > 1) return { error: "MIXED_CURRENCY" };

  let planned = 0;
  let committed = 0;
  let realized = 0;
  let plannedCount = 0;
  let committedCount = 0;
  let realizedCount = 0;

  for (const line of lines) {
    if (line.planned !== null) {
      planned += line.planned;
      plannedCount += 1;
    }
    if (line.committed !== null) {
      committed += line.committed;
      committedCount += 1;
    }
    if (line.realized !== null) {
      realized += line.realized;
      realizedCount += 1;
    }
  }

  return {
    currency: [...currencies][0] ?? "",
    lineCount: lines.length,
    totalPlanned: plannedCount > 0 ? round2(planned) : null,
    totalCommitted: committedCount > 0 ? round2(committed) : null,
    totalRealized: realizedCount > 0 ? round2(realized) : null,
    plannedKnownCount: plannedCount,
    committedKnownCount: committedCount,
    realizedKnownCount: realizedCount,
    partial:
      plannedCount < lines.length ||
      committedCount < lines.length ||
      realizedCount < lines.length,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
