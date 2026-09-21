import { describe, expect, it } from "vitest";

import {
  UTILIZATION_BANDS,
  calculateUtilization,
  classifyUtilization,
  forecastCommittedCapacity,
  summarizeCapacity,
  type AllocationInput,
} from "@/lib/calculations/workload";
import {
  DEFAULT_MATCH_WEIGHTS,
  MATCH_DIMENSIONS,
  MIN_COVERAGE_TO_RECOMMEND,
  matchCandidate,
  rankCandidates,
  type CandidateProfile,
  type StaffingRequirement,
} from "@/lib/calculations/matching";

function allocation(o: Partial<AllocationInput> & { assignmentId: string }): AllocationInput {
  return {
    projectId: "p1",
    projectName: "Project One",
    allocationPct: 50,
    startDate: null,
    endDate: null,
    status: "active",
    ...o,
  };
}

// ===========================================================================
// Workload
// ===========================================================================
describe("utilization", () => {
  it("sums active allocations", () => {
    const result = calculateUtilization("u1", [
      allocation({ assignmentId: "a", allocationPct: 60 }),
      allocation({ assignmentId: "b", allocationPct: 30, projectName: "Two" }),
    ]);
    expect(result.utilizationPct).toBe(90);
    expect(result.band).toBe("healthy");
    expect(result.spareCapacityPct).toBe(10);
    expect(result.projects).toEqual(["Project One", "Two"]);
  });

  // A proposal is not a commitment.
  it("keeps proposed allocation out of the headline figure", () => {
    const result = calculateUtilization("u1", [
      allocation({ assignmentId: "a", allocationPct: 80 }),
      allocation({ assignmentId: "b", allocationPct: 50, status: "proposed" }),
    ]);
    expect(result.utilizationPct).toBe(80);
    expect(result.proposedPct).toBe(50);
    expect(result.band).toBe("healthy");
  });

  it("ignores completed and cancelled assignments", () => {
    const result = calculateUtilization("u1", [
      allocation({ assignmentId: "a", allocationPct: 100, status: "completed" }),
      allocation({ assignmentId: "b", allocationPct: 100, status: "cancelled" }),
    ]);
    expect(result.utilizationPct).toBe(0);
    expect(result.band).toBe("unassigned");
  });

  it("excludes assignments outside the as-of window", () => {
    const result = calculateUtilization(
      "u1",
      [
        allocation({ assignmentId: "past", allocationPct: 50, endDate: "2026-01-31" }),
        allocation({ assignmentId: "future", allocationPct: 50, startDate: "2027-01-01" }),
        allocation({ assignmentId: "now", allocationPct: 40 }),
      ],
      { asOf: "2026-06-15" },
    );
    expect(result.utilizationPct).toBe(40);
  });

  it("surfaces overload rather than clamping it", () => {
    const result = calculateUtilization("u1", [
      allocation({ assignmentId: "a", allocationPct: 100 }),
      allocation({ assignmentId: "b", allocationPct: 60 }),
    ]);
    expect(result.utilizationPct).toBe(160);
    expect(result.band).toBe("severely_overloaded");
    expect(result.spareCapacityPct).toBe(0);
  });

  it("classifies the bands", () => {
    expect(classifyUtilization(0)).toBe("unassigned");
    expect(classifyUtilization(30)).toBe("underloaded");
    expect(classifyUtilization(UTILIZATION_BANDS.healthyMin)).toBe("healthy");
    expect(classifyUtilization(100)).toBe("healthy");
    expect(classifyUtilization(110)).toBe("overloaded");
    expect(classifyUtilization(130)).toBe("severely_overloaded");
  });
});

describe("capacity summary", () => {
  it("reports spare capacity in FTE", () => {
    const summary = summarizeCapacity([
      calculateUtilization("a", [allocation({ assignmentId: "1", allocationPct: 50 })]),
      calculateUtilization("b", [allocation({ assignmentId: "2", allocationPct: 50 })]),
    ]);
    // Two people at 50% leaves one FTE of capacity.
    expect(summary.spareCapacityFte).toBe(1);
    expect(summary.headcount).toBe(2);
  });

  // You cannot borrow capacity from someone already over-allocated.
  it("does not let an overloaded person create negative spare capacity", () => {
    const summary = summarizeCapacity([
      calculateUtilization("a", [allocation({ assignmentId: "1", allocationPct: 100 }), allocation({ assignmentId: "2", allocationPct: 80 })]),
      calculateUtilization("b", [allocation({ assignmentId: "3", allocationPct: 50 })]),
    ]);
    expect(summary.spareCapacityFte).toBe(0.5);
    expect(summary.overloadedCount).toBe(1);
  });

  it("handles an empty population", () => {
    expect(summarizeCapacity([]).headcount).toBe(0);
  });
});

describe("committed capacity forecast", () => {
  it("projects only what is already committed", () => {
    const points = forecastCommittedCapacity(
      [allocation({ assignmentId: "a", allocationPct: 60, startDate: "2026-01-01", endDate: "2026-03-31" })],
      { from: "2026-01-01", months: 4 },
    );
    expect(points).toHaveLength(4);
    expect(points[0]?.committedPct).toBe(60);
    expect(points[3]?.committedPct).toBe(0);
  });

  it("returns nothing for an invalid start date", () => {
    expect(forecastCommittedCapacity([], { from: "not-a-date", months: 3 })).toEqual([]);
  });
});

// ===========================================================================
// Matching
// ===========================================================================
const requirement: StaffingRequirement = {
  projectId: "p1",
  projectName: "Platform",
  roleName: "Solution Architect",
  capabilityId: "cap-1",
  capabilityName: "Solution Architecture",
  requiredLevel: 4,
  requiredAllocationPct: 50,
  startDate: "2026-10-01",
  endDate: "2027-03-31",
  location: "Jakarta",
  priority: "high",
  minYearsExperience: 5,
};

function candidate(o: Partial<CandidateProfile> & { profileId: string }): CandidateProfile {
  return {
    fullName: "Candidate",
    jobTitle: "Solution Architect",
    location: "Jakarta",
    yearsExperience: 8,
    provenLevel: 4,
    levelProven: true,
    currentUtilizationPct: 20,
    capabilityIds: ["cap-1"],
    developmentCapabilityIds: [],
    availableFrom: "2026-09-01",
    ...o,
  };
}

describe("match weights", () => {
  it("covers every dimension and sums to one", () => {
    for (const dimension of MATCH_DIMENSIONS) {
      expect(DEFAULT_MATCH_WEIGHTS[dimension]).toBeGreaterThan(0);
    }
    const total = Object.values(DEFAULT_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.0001);
  });
});

describe("matchCandidate", () => {
  it("produces the five required outputs", () => {
    const result = matchCandidate(requirement, candidate({ profileId: "u1" }));
    expect(result.match).not.toBeNull();
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.recommendedAction).toBeTruthy();
    expect(result.claimKind).toBe("RECOMMENDATION");
  });

  it("never decides — approval is always required", () => {
    const result = matchCandidate(requirement, candidate({ profileId: "u1" }));
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("recommends a strong, well-covered candidate", () => {
    const result = matchCandidate(requirement, candidate({ profileId: "u1" }));
    expect(result.recommendedAction).toBe("PROPOSE_ASSIGNMENT");
    // 95, not 100: this candidate has no recorded development objectives, so
    // that dimension is genuinely unknown rather than neutral. Absence of
    // data is not evidence of a neutral fit.
    expect(result.coverage).toBe(95);
  });

  it("reaches full coverage when every dimension has data", () => {
    const result = matchCandidate(
      requirement,
      candidate({ profileId: "u1", developmentCapabilityIds: ["cap-1"] }),
    );
    expect(result.coverage).toBe(100);
  });

  // The central safeguard: a high score on thin data is not a recommendation.
  it("refuses to recommend when data coverage is too low", () => {
    const sparse = candidate({
      profileId: "u2",
      jobTitle: null,
      location: null,
      yearsExperience: null,
      provenLevel: null,
      currentUtilizationPct: null,
      availableFrom: null,
      capabilityIds: ["cap-1"],
    });
    const result = matchCandidate(requirement, sparse);
    expect(result.recommendedAction).toBe("INSUFFICIENT_DATA");
    expect(result.coverage).toBeLessThan(MIN_COVERAGE_TO_RECOMMEND * 100);
  });

  it("lowers confidence with coverage, independently of fit", () => {
    const full = matchCandidate(requirement, candidate({ profileId: "a" }));
    const partial = matchCandidate(
      requirement,
      candidate({
        profileId: "b",
        location: null,
        yearsExperience: null,
        availableFrom: null,
      }),
    );
    expect(partial.confidence).toBeLessThan(full.confidence);
  });

  it("never reports full certainty", () => {
    const result = matchCandidate(requirement, candidate({ profileId: "u1" }));
    expect(result.confidence).toBeLessThanOrEqual(95);
  });

  it("reports a capability level shortfall as a gap", () => {
    const result = matchCandidate(
      requirement,
      candidate({ profileId: "u3", provenLevel: 2 }),
    );
    expect(result.gaps.some((g) => /2 level\(s\) short/.test(g))).toBe(true);
  });

  it("flags a level that is claimed but not evidence-backed", () => {
    const result = matchCandidate(
      requirement,
      candidate({ profileId: "u4", levelProven: false }),
    );
    expect(result.gaps.some((g) => /not backed by validated applied evidence/.test(g))).toBe(true);
  });

  it("penalises a candidate the assignment would overload", () => {
    const busy = matchCandidate(
      requirement,
      candidate({ profileId: "u5", currentUtilizationPct: 90 }),
    );
    const free = matchCandidate(requirement, candidate({ profileId: "u6" }));
    expect(busy.match!).toBeLessThan(free.match!);
    expect(busy.gaps.some((g) => /over-allocated/.test(g))).toBe(true);
  });

  it("credits a project that advances a development objective", () => {
    const developing = matchCandidate(
      requirement,
      candidate({ profileId: "u7", developmentCapabilityIds: ["cap-1"] }),
    );
    expect(
      developing.evidence.some((e) => /development objective/.test(e)),
    ).toBe(true);
  });

  it("excludes a missing dimension rather than scoring it zero", () => {
    const withoutLocation = matchCandidate(
      requirement,
      candidate({ profileId: "b", location: null }),
    );
    // Scoring the unknown as 0 would cost ~2 points of weighted mean and drag
    // this well below 90. Excluding it leaves the score essentially intact and
    // reduces coverage instead — which is where uncertainty belongs.
    expect(withoutLocation.match!).toBeGreaterThan(95);
    expect(withoutLocation.coverage).toBeLessThan(
      matchCandidate(requirement, candidate({ profileId: "a" })).coverage,
    );
  });
});

describe("rankCandidates", () => {
  it("orders by match and is stable", () => {
    const candidates = [
      candidate({ profileId: "weak", fullName: "Weak", provenLevel: 1 }),
      candidate({ profileId: "strong", fullName: "Strong" }),
    ];
    const ranked = rankCandidates(requirement, candidates);
    expect(ranked[0]?.profileId).toBe("strong");
    expect(rankCandidates(requirement, [...candidates].reverse())).toEqual(ranked);
  });

  it("sorts insufficient-data candidates last whatever their score", () => {
    const ranked = rankCandidates(requirement, [
      candidate({
        profileId: "sparse",
        fullName: "Sparse",
        jobTitle: null,
        location: null,
        yearsExperience: null,
        provenLevel: null,
        currentUtilizationPct: null,
        availableFrom: null,
      }),
      candidate({ profileId: "known", fullName: "Known", provenLevel: 3 }),
    ]);
    expect(ranked.at(-1)?.profileId).toBe("sparse");
  });
});
