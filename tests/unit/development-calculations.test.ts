import { describe, expect, it } from "vitest";

import {
  APPLIED_ACTIVITY_TYPES,
  DEVELOPMENT_LOOP,
  SPRINT_PHASES,
  calculateDevelopmentProgress,
  describeBlockers,
  evaluateCapabilityUpgrade,
  hoursByPhase,
  validateTemplate,
  type DevelopmentTemplate,
  type PlanActivity,
} from "@/lib/calculations/development";

function activity(
  overrides: Partial<PlanActivity> & { id: string },
): PlanActivity {
  return {
    activityType: "learn",
    estimatedHours: 1,
    status: "completed",
    hasValidatedEvidence: false,
    ...overrides,
  };
}

describe("framework vocabulary", () => {
  it("matches the PRD §8.1 development loop, in order", () => {
    expect([...DEVELOPMENT_LOOP]).toEqual([
      "capability_gap",
      "development_plan",
      "learn",
      "practice",
      "ai_coaching",
      "project_assignment",
      "evidence",
      "assessment",
      "capability_update",
      "business_impact",
    ]);
  });

  it("puts evidence and assessment before capability update", () => {
    const evidence = DEVELOPMENT_LOOP.indexOf("evidence");
    const assessment = DEVELOPMENT_LOOP.indexOf("assessment");
    const update = DEVELOPMENT_LOOP.indexOf("capability_update");
    expect(evidence).toBeLessThan(assessment);
    expect(assessment).toBeLessThan(update);
  });

  it("matches the PRD §8.2 sprint phases", () => {
    expect([...SPRINT_PHASES]).toEqual([
      "define",
      "deconstruct",
      "learn",
      "practice",
      "feedback",
      "build",
      "assess",
      "deploy",
    ]);
  });

  it("treats learning alone as not applied", () => {
    expect(APPLIED_ACTIVITY_TYPES).not.toContain("learn");
    expect(APPLIED_ACTIVITY_TYPES).toContain("practice");
    expect(APPLIED_ACTIVITY_TYPES).toContain("assessment");
  });
});

describe("template validation", () => {
  const base: DevelopmentTemplate = {
    capabilityId: null,
    targetLevel: null,
    id: "t1",
    code: "sprint",
    name: "Sprint",
    methodology: "dps_20_hour_sprint",
    totalHours: 4,
    approved: true,
    activities: [
      {
        sequenceNo: 1,
        phase: "learn",
        title: "Read",
        activityType: "learn",
        estimatedHours: 2,
        requiresEvidence: false,
      },
      {
        sequenceNo: 2,
        phase: "assess",
        title: "Assessment",
        activityType: "assessment",
        estimatedHours: 2,
        requiresEvidence: true,
      },
    ],
  };

  it("accepts a well-formed template", () => {
    expect(validateTemplate(base)).toEqual([]);
  });

  it("rejects an empty template", () => {
    expect(validateTemplate({ ...base, activities: [] })).toEqual([
      { kind: "NO_ACTIVITIES" },
    ]);
  });

  // A "20-hour sprint" whose activities total 14 hours is broken.
  it("rejects hours that do not match the declared total", () => {
    const problems = validateTemplate({ ...base, totalHours: 20 });
    expect(problems).toContainEqual({
      kind: "HOURS_MISMATCH",
      declared: 20,
      actual: 4,
    });
  });

  it("rejects duplicate sequence numbers", () => {
    const problems = validateTemplate({
      ...base,
      activities: [base.activities[0]!, { ...base.activities[1]!, sequenceNo: 1 }],
    });
    expect(problems).toContainEqual({ kind: "DUPLICATE_SEQUENCE", sequenceNo: 1 });
  });

  // Knowledge-only curricula can never raise a capability.
  it("rejects a template with no applied activity", () => {
    const problems = validateTemplate({
      ...base,
      totalHours: 2,
      activities: [base.activities[0]!],
    });
    expect(problems).toContainEqual({ kind: "NO_APPLIED_ACTIVITY" });
    expect(problems).toContainEqual({ kind: "NO_ASSESSMENT" });
  });

  it("groups hours by phase in framework order", () => {
    expect(hoursByPhase(base)).toEqual([
      { phase: "learn", hours: 2 },
      { phase: "assess", hours: 2 },
    ]);
  });
});

describe("development progress", () => {
  it("weights progress by hours, not activity count", () => {
    const result = calculateDevelopmentProgress([
      activity({ id: "a", estimatedHours: 9, status: "completed" }),
      activity({ id: "b", estimatedHours: 1, status: "planned" }),
    ]);
    expect(result.percent).toBe(90);
  });

  it("excludes skipped activities from the denominator", () => {
    const result = calculateDevelopmentProgress([
      activity({ id: "a", estimatedHours: 5, status: "completed" }),
      activity({ id: "b", estimatedHours: 5, status: "skipped" }),
    ]);
    // Without exclusion this would cap at 50% forever.
    expect(result.percent).toBe(100);
    expect(result.totalCount).toBe(1);
  });

  it("falls back to activity count when no hours are estimated", () => {
    const result = calculateDevelopmentProgress([
      activity({ id: "a", estimatedHours: 0, status: "completed" }),
      activity({ id: "b", estimatedHours: 0, status: "planned" }),
    ]);
    expect(result.percent).toBe(50);
  });

  it("returns zero for an empty plan", () => {
    expect(calculateDevelopmentProgress([]).percent).toBe(0);
  });
});

// ===========================================================================
// The safeguard: completing a plan must never raise a capability by itself.
// ===========================================================================
describe("capability upgrade evaluation", () => {
  const completePlan: PlanActivity[] = [
    activity({ id: "a", activityType: "learn", estimatedHours: 2 }),
    activity({ id: "b", activityType: "practice", estimatedHours: 3 }),
    activity({ id: "c", activityType: "assessment", estimatedHours: 2 }),
  ];

  const eligible = {
    planApproved: true,
    activities: completePlan,
    currentLevel: 2,
    targetLevel: 3,
    validatedEvidenceIds: ["ev-1"],
  };

  it("always requires human approval, and says so as a literal", () => {
    const result = evaluateCapabilityUpgrade(eligible);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.claimKind).toBe("RECOMMENDATION");
  });

  it("permits a proposal when every condition is met", () => {
    const result = evaluateCapabilityUpgrade(eligible);
    expect(result.eligibleToPropose).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.proposedLevel).toBe(3);
  });

  it("blocks when the plan was never approved", () => {
    const result = evaluateCapabilityUpgrade({ ...eligible, planApproved: false });
    expect(result.eligibleToPropose).toBe(false);
    expect(result.blockers).toContain("PLAN_NOT_APPROVED");
  });

  // Completing a course is not proof of capability.
  it("blocks when no validated evidence exists, even on a finished plan", () => {
    const result = evaluateCapabilityUpgrade({
      ...eligible,
      validatedEvidenceIds: [],
    });
    expect(result.eligibleToPropose).toBe(false);
    expect(result.blockers).toContain("NO_VALIDATED_EVIDENCE");
    expect(result.proposedLevel).toBeNull();
  });

  it("blocks a knowledge-only plan with no applied activity", () => {
    const result = evaluateCapabilityUpgrade({
      ...eligible,
      activities: [activity({ id: "a", activityType: "learn" })],
    });
    expect(result.blockers).toContain("NO_APPLIED_ACTIVITY_COMPLETED");
    expect(result.blockers).toContain("NO_ASSESSMENT_COMPLETED");
  });

  it("blocks when activities remain incomplete", () => {
    const result = evaluateCapabilityUpgrade({
      ...eligible,
      activities: [
        ...completePlan,
        activity({ id: "d", activityType: "practice", status: "in_progress" }),
      ],
    });
    expect(result.blockers).toContain("PLAN_NOT_COMPLETE");
  });

  it("blocks a proposal that does not raise the level", () => {
    expect(
      evaluateCapabilityUpgrade({ ...eligible, targetLevel: 2 }).blockers,
    ).toContain("TARGET_NOT_ABOVE_CURRENT");
    expect(
      evaluateCapabilityUpgrade({ ...eligible, targetLevel: 1 }).blockers,
    ).toContain("TARGET_NOT_ABOVE_CURRENT");
  });

  it("blocks a level outside the scale", () => {
    expect(
      evaluateCapabilityUpgrade({ ...eligible, targetLevel: 6 }).blockers,
    ).toContain("TARGET_EXCEEDS_SCALE");
  });

  it("returns every blocker, not just the first", () => {
    const result = evaluateCapabilityUpgrade({
      planApproved: false,
      activities: [],
      currentLevel: 3,
      targetLevel: 3,
      validatedEvidenceIds: [],
    });
    expect(result.blockers.length).toBeGreaterThanOrEqual(4);
    expect(describeBlockers(result.blockers).every((r) => r.length > 0)).toBe(true);
  });

  it("never returns a level to apply when ineligible", () => {
    const result = evaluateCapabilityUpgrade({
      ...eligible,
      planApproved: false,
    });
    expect(result.proposedLevel).toBeNull();
  });
});
