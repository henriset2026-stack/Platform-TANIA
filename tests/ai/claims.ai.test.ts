import { describe, expect, it } from "vitest";

import { CLAIM_KINDS, SCOREABLE_KINDS, isScoreable } from "@/types/claim";
import { analyzePerformance } from "@/agents/performance/analysis";
import { analyzeCapability } from "@/agents/capability/analysis";
import { draftDevelopmentPlan } from "@/agents/development/planning";
import { buildBusinessCase } from "@/agents/business-case/model";
import { analyzeProduct } from "@/agents/product/analysis";
import { basisReferences } from "@/agents/capability/contract";
import { FACT_ORIGIN_KINDS } from "@/agents/core/sourcing";

/**
 * Unsupported claims and missing evidence.
 *
 * The product's core risk is that a model's interpretation quietly becomes a
 * person's record. These check the seams where that would happen: a finding
 * without evidence, a figure without a source, a conclusion drawn over a hole.
 */

// ===========================================================================
// Missing evidence
// ===========================================================================
describe("AI: missing evidence", () => {
  it("cannot emit a performance finding without evidence references", () => {
    const analysis = analyzePerformance({
      evidence: [
        {
          id: "e1",
          dimension: "Delivery",
          metric: "stories",
          value: 10,
          unit: null,
          sourceType: "project_deliverable",
          occurredAt: "2026-06-01T00:00:00.000Z",
          validationStatus: "pending",
          claimKind: "FACT",
          periodName: "Q2",
        },
      ],
    });

    for (const finding of analysis.findings) {
      expect(finding.evidenceRefs.length, finding.id).toBeGreaterThan(0);
    }
    for (const recommendation of analysis.recommendations) {
      expect(recommendation.evidenceRefs.length, recommendation.id).toBeGreaterThan(0);
    }
  });

  it("reports absent performance evidence as an uncertainty, not as no problem", () => {
    const analysis = analyzePerformance({ evidence: [] });
    expect(analysis.findings).toEqual([]);
    expect(analysis.uncertainties.length).toBeGreaterThan(0);
    expect(analysis.summary).toMatch(/no performance evidence/i);
  });

  // For capability the ABSENCE of evidence is the finding, so the guarantee is
  // that every gap still resolves to a record — the requirement, if not
  // evidence.
  it("gives an unevidenced capability gap a traceable basis", () => {
    const analysis = analyzeCapability({
      requirements: [
        {
          requirementId: "req-1",
          capabilityId: "cap-1",
          capabilityName: "Cloud",
          requiredLevel: 4,
          criticality: "high",
          urgency: "high",
          scope: { kind: "squad", id: "squad-1" },
        },
      ],
      talent: [],
    });

    expect(analysis.gaps.length).toBe(1);
    for (const gap of analysis.gaps) {
      expect(basisReferences(gap.basis).length, gap.id).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// Unsupported claims
// ===========================================================================
describe("AI: unsupported claims", () => {
  it("offers no origin for a figure the model merely remembers", () => {
    for (const forbidden of ["model_knowledge", "estimate", "assumption", "industry_standard"]) {
      expect(FACT_ORIGIN_KINDS as readonly string[], forbidden).not.toContain(forbidden);
    }
  });

  it("withholds a product conclusion rather than filling the market evidence", () => {
    const result = analyzeProduct({
      productName: "X",
      problemStatement: { available: true, fact: { value: "p", origin: { kind: "user_supplied", statedBy: "s", statedAt: "2026-01-01", verbatim: "p" }, claimKind: "FACT", statedAs: "p" } },
      targetSegments: [],
      differentiator: null,
      closestAlternative: null,
      primaryNeed: null,
      categoryDescription: "c",
      valueDelivered: "v",
      marketFindings: [],
      candidateRequirements: [],
    });

    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toBeTruthy();
    expect(result.missingFacts.length).toBeGreaterThan(0);
  });

  it("refuses a business case with no discount rate rather than assuming one", () => {
    const result = buildBusinessCase({
      subject: "X",
      currency: "IDR",
      discountRate: null,
      revenueAssumptions: [],
      costAssumptions: [],
      scenarios: [],
      risks: [],
    });
    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toMatch(/discount rate/i);
  });

  it("separates what may be scored from what may not", () => {
    expect(CLAIM_KINDS).toContain("INFERENCE");
    expect(SCOREABLE_KINDS).not.toContain("INFERENCE");
    expect(SCOREABLE_KINDS).not.toContain("RECOMMENDATION");
    expect(isScoreable("FACT")).toBe(true);
    expect(isScoreable("INFERENCE")).toBe(false);
  });
});

// ===========================================================================
// No agent output is a decision
// ===========================================================================
describe("AI: no output is a decision", () => {
  it("never produces a final performance rating", () => {
    const analysis = analyzePerformance({ evidence: [] });
    expect(analysis.isFinalRating).toBe(false);
  });

  it("never changes a capability level", () => {
    const analysis = analyzeCapability({ requirements: [], talent: [] });
    expect(analysis.upgradesCapability).toBe(false);
    expect(analysis.isCapabilityAssessment).toBe(false);
  });

  it("never persists a development plan, and always requires approval", () => {
    const response = draftDevelopmentPlan({
      talentDisplayName: "Ayu",
      gap: {
        capabilityId: "cap-1",
        capabilityName: "Cloud",
        requiredLevel: 3,
        sourceRequirementId: "req-1",
        currentProvenLevel: 1,
        claimedLevel: 1,
      },
      templates: [],
      existingPlans: [],
    });
    expect(response.persisted).toBe(false);
    expect(response.plan?.persisted).toBe(false);
    expect(response.approvalRequired.required).toBe(true);
  });
});
