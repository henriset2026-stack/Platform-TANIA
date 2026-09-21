import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LEVELS,
  CERTIFICATION_ONLY_CEILING,
  MAX_GAP_PRIORITY,
  buildCapabilityMatrix,
  calculateCapabilityCoverage,
  calculateCapabilityGap,
  calculateGapPriority,
  calculateProvenLevel,
  clampLevel,
  classifyGap,
  gapPriorityIndex,
  isValidLevel,
  levelName,
  rankCriticalGaps,
} from "@/lib/calculations/capability";

/**
 * Capability engine.
 *
 * These drive development spend and staffing, so the tests are about
 * correctness of the domain rules, not just code coverage.
 */

describe("levels", () => {
  it("defines exactly L1-L5 with the PRD names", () => {
    expect(CAPABILITY_LEVELS.map((l) => l.name)).toEqual([
      "Awareness",
      "Foundation",
      "Practitioner",
      "Advanced",
      "Expert / Mentor",
    ]);
  });

  it("validates the scale", () => {
    expect(isValidLevel(1)).toBe(true);
    expect(isValidLevel(5)).toBe(true);
    expect(isValidLevel(0)).toBe(false);
    expect(isValidLevel(6)).toBe(false);
    expect(isValidLevel(2.5)).toBe(false);
  });

  it("clamps out-of-range input rather than propagating it", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(9)).toBe(5);
    expect(clampLevel(3.4)).toBe(3);
    expect(clampLevel(Number.NaN)).toBe(1);
    expect(clampLevel(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("names levels", () => {
    expect(levelName(3)).toBe("Practitioner");
    expect(levelName(99)).toBe("Unknown");
  });
});

// ===========================================================================
// The rule the product exists to enforce.
// ===========================================================================
describe("certification is not capability (PRD §7.1)", () => {
  const certificate = {
    sourceType: "certification",
    validationStatus: "validated" as const,
  };
  const applied = {
    sourceType: "project_deliverable",
    validationStatus: "validated" as const,
  };

  it("does not prove L5 from a validated certificate alone", () => {
    const result = calculateProvenLevel({
      claimedLevel: 5,
      assessmentStatus: "evidence_validated",
      evidence: [certificate],
    });
    expect(result.provenLevel).toBe(CERTIFICATION_ONLY_CEILING);
    expect(result.proven).toBe(false);
    expect(result.claimedLevel).toBe(5);
    expect(result.reason).toMatch(/certification is not capability/i);
  });

  it("caps any certification-only claim at Foundation", () => {
    for (const claimed of [3, 4, 5]) {
      const result = calculateProvenLevel({
        claimedLevel: claimed,
        assessmentStatus: "manager_assessed",
        evidence: [certificate, certificate],
      });
      expect(result.provenLevel).toBe(CERTIFICATION_ONLY_CEILING);
    }
  });

  it("allows a low claim supported by certification", () => {
    const result = calculateProvenLevel({
      claimedLevel: 2,
      assessmentStatus: "manager_assessed",
      evidence: [certificate],
    });
    expect(result.provenLevel).toBe(2);
    expect(result.proven).toBe(true);
  });

  it("proves a high level when applied evidence exists", () => {
    const result = calculateProvenLevel({
      claimedLevel: 4,
      assessmentStatus: "evidence_validated",
      evidence: [certificate, applied],
    });
    expect(result.provenLevel).toBe(4);
    expect(result.proven).toBe(true);
  });
});

describe("proven level without validated evidence", () => {
  it("falls to L1 when there is no evidence at all", () => {
    const result = calculateProvenLevel({
      claimedLevel: 4,
      assessmentStatus: "self_assessed",
      evidence: [],
    });
    expect(result.provenLevel).toBe(1);
    expect(result.proven).toBe(false);
    expect(result.reason).toMatch(/no evidence/i);
  });

  it("ignores pending, rejected and withdrawn evidence", () => {
    for (const status of ["pending", "rejected", "withdrawn"] as const) {
      const result = calculateProvenLevel({
        claimedLevel: 4,
        assessmentStatus: "manager_assessed",
        evidence: [{ sourceType: "project_deliverable", validationStatus: status }],
      });
      expect(result.provenLevel, status).toBe(1);
      expect(result.proven, status).toBe(false);
    }
  });

  it("never reports a proven level above the claim", () => {
    const result = calculateProvenLevel({
      claimedLevel: 2,
      assessmentStatus: "evidence_validated",
      evidence: [{ sourceType: "project_deliverable", validationStatus: "validated" }],
    });
    expect(result.provenLevel).toBeLessThanOrEqual(result.claimedLevel);
  });
});

// ===========================================================================
// Gap
// ===========================================================================
describe("capability gap", () => {
  it("computes Required minus Current", () => {
    expect(calculateCapabilityGap(4, 2).gap).toBe(2);
    expect(calculateCapabilityGap(3, 3).gap).toBe(0);
  });

  it("keeps a negative gap, because exceeding a requirement is information", () => {
    const result = calculateCapabilityGap(2, 5);
    expect(result.gap).toBe(-3);
    expect(result.magnitude).toBe(0);
    expect(result.status).toBe("strong");
  });

  it("classifies magnitude onto the heatmap scale", () => {
    expect(classifyGap(0)).toBe("strong");
    expect(classifyGap(1)).toBe("on_track");
    expect(classifyGap(2)).toBe("needs_attention");
    expect(classifyGap(3)).toBe("critical_gap");
    expect(classifyGap(4)).toBe("critical_gap");
  });

  it("clamps malformed levels before computing", () => {
    expect(calculateCapabilityGap(99, -5)).toMatchObject({
      requiredLevel: 5,
      currentLevel: 1,
      gap: 4,
    });
  });
});

// ===========================================================================
// Priority
// ===========================================================================
describe("gap priority", () => {
  it("is criticality x magnitude x urgency", () => {
    expect(
      calculateGapPriority({ magnitude: 2, criticality: "high", urgency: "high" }),
    ).toBe(2 * 3 * 3);
  });

  it("is zero when the requirement is already met, however critical", () => {
    expect(
      calculateGapPriority({
        magnitude: 0,
        criticality: "critical",
        urgency: "immediate",
      }),
    ).toBe(0);
  });

  it("peaks at the declared maximum", () => {
    expect(
      calculateGapPriority({
        magnitude: 4,
        criticality: "critical",
        urgency: "immediate",
      }),
    ).toBe(MAX_GAP_PRIORITY);
    expect(gapPriorityIndex(MAX_GAP_PRIORITY)).toBe(100);
  });

  it("ranks a critical urgent gap above a larger but unimportant one", () => {
    const urgent = calculateGapPriority({
      magnitude: 1,
      criticality: "critical",
      urgency: "immediate",
    });
    const large = calculateGapPriority({
      magnitude: 3,
      criticality: "low",
      urgency: "low",
    });
    expect(urgent).toBeGreaterThan(large);
  });

  it("indexes to 0-100", () => {
    expect(gapPriorityIndex(0)).toBe(0);
    expect(gapPriorityIndex(9999)).toBe(100);
  });
});

// ===========================================================================
// Coverage
// ===========================================================================
describe("capability coverage", () => {
  it("returns null for no requirements, not zero", () => {
    // "No requirements defined" and "nothing is met" are different facts.
    expect(calculateCapabilityCoverage([])).toBeNull();
  });

  it("counts requirements met at or above target", () => {
    expect(
      calculateCapabilityCoverage([
        { requiredLevel: 3, currentLevel: 3 },
        { requiredLevel: 3, currentLevel: 4 },
        { requiredLevel: 4, currentLevel: 2 },
        { requiredLevel: 2, currentLevel: 1 },
      ]),
    ).toBe(50);
  });

  it("uses headcount when every requirement specifies it", () => {
    expect(
      calculateCapabilityCoverage([
        { requiredLevel: 3, currentLevel: 3, headcountRequired: 10, headcountMeeting: 5 },
        { requiredLevel: 4, currentLevel: 4, headcountRequired: 10, headcountMeeting: 10 },
      ]),
    ).toBe(75);
  });

  it("does not let surplus headcount inflate coverage past 100", () => {
    expect(
      calculateCapabilityCoverage([
        { requiredLevel: 3, currentLevel: 3, headcountRequired: 5, headcountMeeting: 50 },
      ]),
    ).toBe(100);
  });
});

// ===========================================================================
// Matrix and ranking — determinism matters
// ===========================================================================
describe("capability matrix", () => {
  it("is deterministic for the same input in any order", () => {
    const rows = [
      { groupId: "squad-b", capabilityId: "cap-2", requiredLevel: 4, currentLevel: 2 },
      { groupId: "squad-a", capabilityId: "cap-1", requiredLevel: 3, currentLevel: 3 },
      { groupId: "squad-a", capabilityId: "cap-2", requiredLevel: 5, currentLevel: 1 },
    ];
    const a = buildCapabilityMatrix(rows);
    const b = buildCapabilityMatrix([...rows].reverse());
    expect(a).toEqual(b);
    expect(a.map((c) => `${c.groupId}/${c.capabilityId}`)).toEqual([
      "squad-a/cap-1",
      "squad-a/cap-2",
      "squad-b/cap-2",
    ]);
  });
});

describe("critical gap ranking", () => {
  const rows = [
    {
      capabilityId: "c1",
      capabilityName: "Agent Design",
      requiredLevel: 4,
      currentLevel: 1,
      criticality: "critical" as const,
      urgency: "immediate" as const,
    },
    {
      capabilityId: "c2",
      capabilityName: "Data Modelling",
      requiredLevel: 3,
      currentLevel: 2,
      criticality: "low" as const,
      urgency: "low" as const,
    },
    {
      capabilityId: "c3",
      capabilityName: "Met Requirement",
      requiredLevel: 2,
      currentLevel: 4,
      criticality: "critical" as const,
      urgency: "immediate" as const,
    },
  ];

  it("excludes capabilities with no gap", () => {
    const ranked = rankCriticalGaps(rows);
    expect(ranked.map((r) => r.capabilityId)).not.toContain("c3");
  });

  it("orders by priority", () => {
    const ranked = rankCriticalGaps(rows);
    expect(ranked[0]?.capabilityId).toBe("c1");
    expect(ranked[0]?.priority).toBeGreaterThan(ranked[1]?.priority ?? 0);
  });

  it("is stable — ties break on name, so the top N does not reshuffle", () => {
    const tied = [
      { ...rows[1]!, capabilityId: "z", capabilityName: "Zulu" },
      { ...rows[1]!, capabilityId: "a", capabilityName: "Alpha" },
    ];
    const ranked = rankCriticalGaps(tied);
    expect(ranked.map((r) => r.capabilityName)).toEqual(["Alpha", "Zulu"]);
    expect(rankCriticalGaps([...tied].reverse())).toEqual(ranked);
  });

  it("returns an empty list when nothing has a gap", () => {
    expect(rankCriticalGaps([rows[2]!])).toEqual([]);
  });
});
