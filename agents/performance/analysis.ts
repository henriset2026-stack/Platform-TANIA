/**
 * Performance Agent analysis.
 *
 * PURE. Takes evidence in, produces the output contract out. No I/O, no model
 * call, no randomness.
 *
 * That separation is deliberate: the agent's reasoning is the part that makes
 * claims about a person, so it is the part that must be reproducible and
 * testable. The LLM's role in this agent is to phrase a summary, never to
 * decide what the findings are.
 */

import {
  detectAnomalies,
  summarizeDistribution,
  type Observation,
} from "@/lib/calculations/anomaly";
import { calculateTrend, type TrendPoint } from "@/lib/calculations/performance";
import { PERFORMANCE_DIMENSIONS } from "@/lib/calculations/performance";
import {
  toNonEmpty,
  type EvidenceRef,
  type Finding,
  type PerformanceAnalysis,
  type Recommendation,
  type Uncertainty,
} from "@/agents/performance/contract";
import type { ClaimKind } from "@/types/claim";

export interface AnalysisInput {
  readonly evidence: readonly {
    readonly id: string;
    readonly dimension: string;
    readonly metric: string | null;
    readonly value: number | null;
    readonly unit: string | null;
    readonly sourceType: string;
    readonly occurredAt: string | null;
    readonly validationStatus: string;
    readonly claimKind: ClaimKind;
    readonly periodName: string | null;
  }[];
  readonly trendPoints?: readonly TrendPoint[];
  readonly periodName?: string | null;
}

/**
 * Minimum validated share before the analysis is treated as well-grounded.
 *
 * Below this, findings are still produced but an uncertainty is raised, and
 * severity is capped — see capSeverity. A confident-sounding concern built
 * mostly on unvalidated claims is worse than a hedged one.
 */
export const MIN_VALIDATED_SHARE = 0.5;

function toRef(row: AnalysisInput["evidence"][number]): EvidenceRef {
  return {
    evidenceId: row.id,
    dimension: row.dimension,
    occurredAt: row.occurredAt,
    sourceType: row.sourceType,
    validationStatus: row.validationStatus,
    claimKind: row.claimKind,
  };
}

/**
 * Produces the analysis.
 *
 * Returns an honest empty analysis rather than throwing when there is no
 * evidence: "nothing to say, and here is why" is a valid and useful result.
 */
export function analyzePerformance(input: AnalysisInput): PerformanceAnalysis {
  const generatedAt = new Date().toISOString();
  const evidence = input.evidence;
  const refs = evidence.map(toRef);

  const validatedCount = evidence.filter(
    (e) => e.validationStatus === "validated" && e.claimKind === "FACT",
  ).length;
  const validatedShare =
    evidence.length === 0 ? 0 : Math.round((validatedCount / evidence.length) * 100) / 100;

  const uncertainties: Uncertainty[] = [];
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];

  if (evidence.length === 0) {
    return {
      summary:
        "No performance evidence is available within your authorized scope, so no analysis can be made.",
      findings: [],
      evidence: [],
      uncertainties: [
        {
          topic: "Performance evidence",
          reason: "No evidence records were returned.",
          resolvedBy:
            "Record performance evidence for this period, or confirm your scope includes this person.",
        },
      ],
      recommendations: [],
      periodName: input.periodName ?? null,
      evidenceCount: 0,
      validatedShare: 0,
      generatedAt,
      isFinalRating: false,
    };
  }

  // --- Evidence quality -------------------------------------------------
  if (validatedShare < MIN_VALIDATED_SHARE) {
    uncertainties.push({
      topic: "Evidence validation",
      reason: `Only ${Math.round(validatedShare * 100)}% of evidence is validated fact; the rest is unvalidated or AI-generated.`,
      resolvedBy: "Validate the outstanding evidence before relying on these findings.",
    });
  }

  const aiGenerated = evidence.filter((e) => e.claimKind === "INFERENCE").length;
  if (aiGenerated > 0) {
    uncertainties.push({
      topic: "AI-generated evidence",
      reason: `${aiGenerated} record(s) are AI-generated or unvalidated and are not measured facts.`,
      resolvedBy: "A human should validate them before they inform a decision.",
    });
  }

  // --- Coverage ---------------------------------------------------------
  const covered = new Set(evidence.map((e) => e.dimension));
  const missing = PERFORMANCE_DIMENSIONS.filter((d) => !covered.has(d.code) && !covered.has(d.name));
  if (missing.length > 0) {
    uncertainties.push({
      topic: "Dimension coverage",
      reason: `No evidence for: ${missing.map((d) => d.name).join(", ")}.`,
      resolvedBy: "Record evidence for those dimensions, or confirm they do not apply to this role.",
    });
  }

  // --- Anomalies --------------------------------------------------------
  const observations: Observation[] = evidence
    .filter((e) => e.value !== null && e.occurredAt !== null)
    .map((e) => ({
      id: e.id,
      value: e.value!,
      occurredAt: e.occurredAt!,
      dimension: e.dimension,
    }));

  const byId = new Map(evidence.map((e) => [e.id, e] as const));

  for (const anomaly of detectAnomalies(observations)) {
    const row = byId.get(anomaly.observationId);
    if (!row) continue;
    const anomalyRefs = toNonEmpty([toRef(row)]);
    if (!anomalyRefs) continue;

    findings.push({
      id: `anomaly:${anomaly.observationId}:${anomaly.kind}`,
      title:
        anomaly.kind === "sudden_change"
          ? `Sudden change in ${anomaly.dimension}`
          : anomaly.kind === "high_outlier"
            ? `Unusually high ${anomaly.dimension} result`
            : `Unusually low ${anomaly.dimension} result`,
      detail: anomaly.explanation,
      severity: capSeverity(
        anomaly.kind === "low_outlier" ? "concern" : "attention",
        validatedShare,
      ),
      dimension: anomaly.dimension,
      evidenceRefs: anomalyRefs,
      claimKind: "ANALYSIS",
    });
  }

  // --- Trend ------------------------------------------------------------
  if (input.trendPoints && input.trendPoints.length > 0) {
    const trend = calculateTrend(input.trendPoints);
    if (trend.direction === "unknown") {
      uncertainties.push({
        topic: "Trend",
        reason: "Fewer than two periods of data; a single measurement is not a trend.",
        resolvedBy: "Record evidence across at least two performance periods.",
      });
    } else {
      const trendRefs = toNonEmpty(refs.slice(0, 3));
      if (trendRefs) {
        findings.push({
          id: `trend:${trend.direction}`,
          title: `Performance is ${trend.direction}`,
          detail:
            trend.change === null
              ? "Direction determined across the available periods."
              : `Change of ${trend.change > 0 ? "+" : ""}${trend.change} across ${trend.points.length} periods.`,
          severity: capSeverity(
            trend.direction === "declining" ? "concern" : "info",
            validatedShare,
          ),
          dimension: null,
          evidenceRefs: trendRefs,
          claimKind: "ANALYSIS",
        });
      }
    }
  } else {
    uncertainties.push({
      topic: "Trend",
      reason: "No period metrics were supplied, so no trend could be calculated.",
      resolvedBy: "Record performance metrics against performance periods.",
    });
  }

  // --- Evidence gaps ----------------------------------------------------
  const pending = evidence.filter((e) => e.validationStatus === "pending");
  const pendingRefs = toNonEmpty(pending.map(toRef));
  if (pendingRefs) {
    findings.push({
      id: "evidence_gap:pending_validation",
      title: `${pending.length} evidence record(s) await validation`,
      detail:
        "Unvalidated evidence does not count towards a performance result and should be reviewed.",
      severity: "attention",
      dimension: null,
      evidenceRefs: pendingRefs,
      claimKind: "ANALYSIS",
    });

    recommendations.push({
      id: "recommend:validate_pending",
      title: "Validate outstanding performance evidence",
      rationale: `${pending.length} record(s) are pending. Validating them improves the basis for any review conversation.`,
      priority: pending.length > 3 ? "high" : "medium",
      evidenceRefs: pendingRefs,
      claimKind: "RECOMMENDATION",
      requiresHumanDecision: true,
    });
  }

  // --- Recommendation from concerns -------------------------------------
  const concerns = findings.filter((f) => f.severity === "concern");
  const concernRefs = toNonEmpty(concerns.flatMap((f) => [...f.evidenceRefs]));
  if (concernRefs) {
    recommendations.push({
      id: "recommend:review_conversation",
      title: "Hold a review conversation about the flagged results",
      rationale:
        "One or more results fall outside the typical range. A conversation establishes context that the data cannot.",
      priority: "high",
      evidenceRefs: concernRefs,
      claimKind: "RECOMMENDATION",
      requiresHumanDecision: true,
    });
  }

  const distribution = summarizeDistribution(
    evidence.map((e) => e.value).filter((v): v is number => v !== null),
  );

  return {
    summary: buildSummary({
      evidenceCount: evidence.length,
      validatedShare,
      findingCount: findings.length,
      median: distribution?.median ?? null,
      periodName: input.periodName ?? null,
    }),
    findings,
    evidence: refs,
    uncertainties,
    recommendations,
    periodName: input.periodName ?? null,
    evidenceCount: evidence.length,
    validatedShare,
    generatedAt,
    isFinalRating: false,
  };
}

/**
 * Caps severity when the evidence base is weak.
 *
 * A "concern" raised mostly on unvalidated claims overstates what is known.
 * Downgrading to "attention" keeps the signal without the false confidence.
 */
function capSeverity(
  severity: Finding["severity"],
  validatedShare: number,
): Finding["severity"] {
  if (severity === "concern" && validatedShare < MIN_VALIDATED_SHARE) {
    return "attention";
  }
  return severity;
}

function buildSummary(input: {
  evidenceCount: number;
  validatedShare: number;
  findingCount: number;
  median: number | null;
  periodName: string | null;
}): string {
  const parts = [
    `Analysed ${input.evidenceCount} performance evidence record(s)`,
    input.periodName ? ` for ${input.periodName}` : "",
    `. ${Math.round(input.validatedShare * 100)}% is validated fact.`,
    input.findingCount === 0
      ? " No findings were raised."
      : ` ${input.findingCount} finding(s) were raised, each linked to the evidence supporting it.`,
    " This is an analysis, not a rating: no performance rating is produced here and none follows from it.",
  ];
  return parts.join("");
}
