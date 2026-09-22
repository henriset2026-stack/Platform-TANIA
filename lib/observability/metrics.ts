/**
 * Observability aggregation. PURE.
 *
 * Latency, failures, authorization denials, tool execution, approvals.
 *
 * Percentiles rather than a mean, because a mean latency hides the shape that
 * matters: an assistant that answers in 400ms nineteen times out of twenty
 * and hangs for forty seconds on the twentieth has a good mean and an
 * unusable feel. p95 is the number a person actually experiences complaining
 * about.
 *
 * Every rate returns null on an empty set rather than 0. A 0% failure rate
 * across no calls is not a good result, it is no result, and a dashboard that
 * cannot tell the difference reports health for a system nobody used.
 */

export interface ToolCallRecord {
  readonly toolName: string;
  readonly status: "proposed" | "authorized" | "denied" | "completed" | "failed";
  readonly authorizationDecision: string | null;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH" | null;
  readonly durationMs: number | null;
  readonly audited: boolean;
  readonly createdAt: string;
}

export interface RunRecord {
  readonly agentName: string;
  readonly status: "started" | "running" | "awaiting_approval" | "completed" | "failed";
  readonly latencyMs: number | null;
  readonly humanApprovalRequired: boolean;
  readonly humanApproved: boolean;
}

export interface LatencySummary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

/**
 * Nearest-rank percentile over the recorded durations.
 *
 * Calls with no recorded duration are excluded rather than counted as zero:
 * a denied call never ran, and folding it in as 0ms would make the service
 * look faster the more requests it refused.
 */
export function summarizeLatency(
  durations: readonly (number | null)[],
): LatencySummary | null {
  const values = durations
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values[values.length - 1] ?? 0,
  };
}

export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index] ?? 0;
}

export interface ToolMetrics {
  readonly totalCalls: number;
  readonly completed: number;
  readonly failed: number;
  readonly denied: number;
  readonly awaitingConfirmation: number;
  /** Null when there were no calls. */
  readonly failureRate: number | null;
  readonly denialRate: number | null;
  readonly latency: LatencySummary | null;
  /** Calls that ran but were not recorded. Should be zero; visible if not. */
  readonly unauditedCalls: number;
  readonly denialsByReason: Readonly<Record<string, number>>;
  readonly callsByTool: Readonly<Record<string, number>>;
  readonly callsByRisk: Readonly<Record<string, number>>;
}

export function summarizeToolCalls(
  calls: readonly ToolCallRecord[],
): ToolMetrics {
  const denialsByReason: Record<string, number> = {};
  const callsByTool: Record<string, number> = {};
  const callsByRisk: Record<string, number> = {};

  let completed = 0;
  let failed = 0;
  let denied = 0;
  let awaiting = 0;
  let unaudited = 0;

  for (const call of calls) {
    callsByTool[call.toolName] = (callsByTool[call.toolName] ?? 0) + 1;
    const risk = call.riskLevel ?? "unclassified";
    callsByRisk[risk] = (callsByRisk[risk] ?? 0) + 1;

    if (!call.audited) unaudited += 1;

    switch (call.status) {
      case "completed":
        completed += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "denied": {
        denied += 1;
        const reason = call.authorizationDecision ?? "unspecified";
        denialsByReason[reason] = (denialsByReason[reason] ?? 0) + 1;
        if (reason === "awaiting_confirmation") awaiting += 1;
        break;
      }
      default:
        break;
    }
  }

  const total = calls.length;

  return {
    totalCalls: total,
    completed,
    failed,
    denied,
    awaitingConfirmation: awaiting,
    failureRate: total === 0 ? null : round4(failed / total),
    denialRate: total === 0 ? null : round4(denied / total),
    latency: summarizeLatency(calls.map((call) => call.durationMs)),
    unauditedCalls: unaudited,
    denialsByReason,
    callsByTool,
    callsByRisk,
  };
}

export interface RunMetrics {
  readonly totalRuns: number;
  readonly completed: number;
  readonly failed: number;
  readonly awaitingApproval: number;
  readonly failureRate: number | null;
  readonly latency: LatencySummary | null;
  readonly runsByAgent: Readonly<Record<string, number>>;
  /**
   * Runs that required approval and completed without it.
   *
   * Should be structurally impossible — agent_runs has a CHECK forbidding it
   * — so a non-zero value here means the constraint is missing from the live
   * database, which is worth knowing loudly.
   */
  readonly completedWithoutRequiredApproval: number;
}

export function summarizeRuns(runs: readonly RunRecord[]): RunMetrics {
  const runsByAgent: Record<string, number> = {};
  let completed = 0;
  let failed = 0;
  let awaiting = 0;
  let violations = 0;

  for (const run of runs) {
    runsByAgent[run.agentName] = (runsByAgent[run.agentName] ?? 0) + 1;
    if (run.status === "completed") completed += 1;
    if (run.status === "failed") failed += 1;
    if (run.status === "awaiting_approval") awaiting += 1;
    if (run.status === "completed" && run.humanApprovalRequired && !run.humanApproved) {
      violations += 1;
    }
  }

  return {
    totalRuns: runs.length,
    completed,
    failed,
    awaitingApproval: awaiting,
    failureRate: runs.length === 0 ? null : round4(failed / runs.length),
    latency: summarizeLatency(runs.map((run) => run.latencyMs)),
    runsByAgent,
    completedWithoutRequiredApproval: violations,
  };
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
