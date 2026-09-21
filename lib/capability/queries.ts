import "server-only";

/**
 * Capability data access.
 *
 * Reads run under the caller's RLS context. All arithmetic is delegated to
 * lib/calculations/capability.ts — this file fetches and shapes, it never
 * computes a gap inline, so the formula has exactly one home.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import {
  calculateCapabilityGap,
  calculateProvenLevel,
  rankCriticalGaps,
  type AssessmentStatus,
  type CriticalGap,
  type Criticality,
  type EvidenceInput,
  type RequirementScope,
  type Urgency,
} from "@/lib/calculations/capability";
import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";
import type { CapabilityStatus } from "@/types/status";

const NOT_PROVISIONED_PHASE = 2;

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function failed(reason: string): Failed {
  return { state: "failed", reason };
}

function provenance(source: string, validated = false) {
  return { source, asOf: new Date().toISOString(), validated };
}

async function guarded<T>(
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  if (!supabaseConfigured()) return notConnected(NOT_PROVISIONED_PHASE, requires);
  try {
    return await run();
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Unknown error");
  }
}

// ===========================================================================
// Catalog
// ===========================================================================

export interface CapabilityCatalogRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly domainId: string;
  readonly domainName: string;
  readonly criticality: string;
  readonly active: boolean;
}

export async function listCapabilities(options: {
  domainId?: string;
  search?: string;
} = {}): Promise<DataPoint<readonly CapabilityCatalogRow[]>> {
  return guarded("capabilities + capability_domains", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("capabilities")
      .select("id, code, name, description, criticality, active, domain_id, capability_domains(id, name)")
      .eq("active", true)
      .order("name");

    if (options.domainId) q = q.eq("domain_id", options.domainId);
    if (options.search) q = q.ilike("name", `%${options.search}%`);

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((c) => {
        const domain = (c as { capability_domains?: { id?: string; name?: string } })
          .capability_domains;
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description,
          domainId: c.domain_id,
          domainName: domain?.name ?? "—",
          criticality: c.criticality,
          active: c.active,
        };
      }),
      provenance: provenance("supabase:capabilities"),
    };
  });
}

export interface CapabilityDomainRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
}

export async function listCapabilityDomains(): Promise<
  DataPoint<readonly CapabilityDomainRow[]>
> {
  return guarded("capability_domains", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("capability_domains")
      .select("id, code, name, sort_order")
      .order("sort_order");

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        sortOrder: d.sort_order,
      })),
      provenance: provenance("supabase:capability_domains"),
    };
  });
}

// ===========================================================================
// Critical gaps
// ===========================================================================

/**
 * Chapter-level critical gaps.
 *
 * Joins requirements to the best proven level across the population. The
 * ranking is produced by rankCriticalGaps, so priority is computed by the
 * engine rather than by SQL ordering — SQL cannot express the
 * criticality × magnitude × urgency product without duplicating the formula.
 */
export async function getCriticalGaps(): Promise<
  DataPoint<readonly CriticalGap[]>
> {
  return guarded("capability_requirements + talent_capabilities", async () => {
    const supabase = await createClient();

    const [requirements, current] = await Promise.all([
      supabase
        .from("capability_requirements")
        .select("capability_id, required_level, business_criticality, time_urgency, capabilities(name)"),
      supabase.from("talent_capabilities").select("capability_id, current_level"),
    ]);

    if (requirements.error) return failed(requirements.error.message);
    if (current.error) return failed(current.error.message);
    if (!requirements.data || requirements.data.length === 0) {
      return { state: "empty" };
    }

    // Highest current level per capability across the visible population.
    const best = new Map<string, number>();
    for (const row of current.data ?? []) {
      const previous = best.get(row.capability_id) ?? 0;
      best.set(row.capability_id, Math.max(previous, row.current_level));
    }

    const ranked = rankCriticalGaps(
      requirements.data.map((r) => ({
        capabilityId: r.capability_id,
        capabilityName:
          (r as { capabilities?: { name?: string } }).capabilities?.name ??
          "Unknown capability",
        requiredLevel: r.required_level,
        currentLevel: best.get(r.capability_id) ?? 1,
        criticality: r.business_criticality as Criticality,
        urgency: r.time_urgency as Urgency,
      })),
    );

    if (ranked.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: ranked,
      provenance: provenance("supabase:capability_requirements"),
    };
  });
}

// ===========================================================================
// Talent capability detail
// ===========================================================================

export interface TalentCapabilityDetail {
  readonly id: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly domainName: string;
  readonly claimedLevel: number;
  readonly provenLevel: number;
  readonly proven: boolean;
  readonly provenReason: string;
  readonly targetLevel: number | null;
  readonly requiredLevel: number | null;
  readonly gap: number | null;
  readonly status: CapabilityStatus | null;
  readonly assessmentStatus: string;
  readonly evidenceCount: number;
  readonly validatedEvidenceCount: number;
}

/**
 * A person's capability profile, with proven level derived from evidence.
 *
 * The distinction between claimed and proven is the product: a self-assessed
 * L4 with no applied evidence is reported as L1 proven, and the UI shows both
 * so the difference is visible rather than quietly resolved.
 */
export async function getTalentCapabilityDetail(
  talentId: string,
): Promise<DataPoint<readonly TalentCapabilityDetail[]>> {
  const decision = await canAccessTalent(talentId, "CONFIDENTIAL");
  if (!decision.allowed) {
    return { state: "restricted", reason: decision.detail };
  }

  return guarded("talent_capabilities + capability_evidence", async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("talent_capabilities")
      .select(
        "id, capability_id, current_level, target_level, assessment_status, capabilities(name, capability_domains(name))",
      )
      .eq("profile_id", talentId);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    const { data: evidence, error: evidenceError } = await supabase
      .from("capability_evidence")
      .select("talent_capability_id, source_type, validation_status")
      .in("talent_capability_id", data.map((r) => r.id))
      .is("deleted_at", null);

    if (evidenceError) return failed(evidenceError.message);

    const byCapability = new Map<string, EvidenceInput[]>();
    for (const e of evidence ?? []) {
      const list = byCapability.get(e.talent_capability_id) ?? [];
      list.push({
        sourceType: e.source_type,
        validationStatus: e.validation_status as EvidenceInput["validationStatus"],
      });
      byCapability.set(e.talent_capability_id, list);
    }

    const rows = data.map((row) => {
      const evidenceForRow = byCapability.get(row.id) ?? [];
      const proven = calculateProvenLevel({
        claimedLevel: row.current_level,
        assessmentStatus: row.assessment_status as AssessmentStatus,
        evidence: evidenceForRow,
      });

      const gap =
        row.target_level === null
          ? null
          : calculateCapabilityGap(row.target_level, proven.provenLevel);

      const cap = (
        row as { capabilities?: { name?: string; capability_domains?: { name?: string } } }
      ).capabilities;

      return {
        id: row.id,
        capabilityId: row.capability_id,
        capabilityName: cap?.name ?? "Unknown capability",
        domainName: cap?.capability_domains?.name ?? "—",
        claimedLevel: proven.claimedLevel,
        provenLevel: proven.provenLevel,
        proven: proven.proven,
        provenReason: proven.reason,
        targetLevel: row.target_level,
        requiredLevel: row.target_level,
        gap: gap?.gap ?? null,
        status: gap?.status ?? null,
        assessmentStatus: row.assessment_status,
        evidenceCount: evidenceForRow.length,
        validatedEvidenceCount: evidenceForRow.filter(
          (e) => e.validationStatus === "validated",
        ).length,
      };
    });

    return {
      state: "live",
      value: rows.sort((a, b) => a.capabilityName.localeCompare(b.capabilityName)),
      provenance: provenance("supabase:talent_capabilities"),
    };
  });
}

/** Single capability, for /capability/[id]. */
export async function getCapability(
  capabilityId: string,
): Promise<DataPoint<CapabilityCatalogRow>> {
  return guarded("capabilities", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("capabilities")
      .select("id, code, name, description, criticality, active, domain_id, capability_domains(id, name)")
      .eq("id", capabilityId)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!data) return { state: "empty" };

    const domain = (data as { capability_domains?: { name?: string } }).capability_domains;
    return {
      state: "live",
      value: {
        id: data.id,
        code: data.code,
        name: data.name,
        description: data.description,
        domainId: data.domain_id,
        domainName: domain?.name ?? "—",
        criticality: data.criticality,
        active: data.active,
      },
      provenance: provenance("supabase:capabilities"),
    };
  });
}

// ===========================================================================
// Requirements and holders — inputs to the Capability Agent
// ===========================================================================

export interface CapabilityRequirementRow {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requiredLevel: number;
  readonly criticality: Criticality;
  readonly urgency: Urgency;
  readonly scope: RequirementScope;
  readonly headcountRequired: number | null;
}

/**
 * Capability requirements visible to the caller.
 *
 * A scope filter narrows the read; it never widens it. Passing a projectId
 * the caller cannot see returns nothing, because RLS filters the rows before
 * this function ever sees them — the filter is a convenience for the reader,
 * not a control.
 */
export async function listCapabilityRequirements(
  options: {
    organizationId?: string;
    squadId?: string;
    projectId?: string;
    roleName?: string;
  } = {},
): Promise<DataPoint<readonly CapabilityRequirementRow[]>> {
  return guarded("capability_requirements + capabilities", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("capability_requirements")
      .select(
        "id, capability_id, required_level, business_criticality, time_urgency, headcount_required, organization_id, squad_id, project_id, role_name, capabilities(name)",
      );

    if (options.organizationId) q = q.eq("organization_id", options.organizationId);
    if (options.squadId) q = q.eq("squad_id", options.squadId);
    if (options.projectId) q = q.eq("project_id", options.projectId);
    if (options.roleName) q = q.eq("role_name", options.roleName);

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((r) => ({
        requirementId: r.id,
        capabilityId: r.capability_id,
        capabilityName:
          (r as { capabilities?: { name?: string } }).capabilities?.name ??
          "Unknown capability",
        requiredLevel: r.required_level,
        criticality: r.business_criticality as Criticality,
        urgency: r.time_urgency as Urgency,
        scope: toRequirementScope(r),
        headcountRequired: r.headcount_required,
      })),
      provenance: provenance("supabase:capability_requirements"),
    };
  });
}

/**
 * Maps the four nullable scope columns onto the discriminated union.
 *
 * The database CHECK guarantees exactly one is set, but this runs against a
 * database that has never been provisioned (CLAUDE.md §2c), so the fallback
 * is explicit rather than a non-null assertion: an unscoped row is reported
 * as an organization scope of "unknown" instead of crashing a read.
 */
function toRequirementScope(row: {
  organization_id: string | null;
  squad_id: string | null;
  project_id: string | null;
  role_name: string | null;
}): RequirementScope {
  if (row.project_id) return { kind: "project", id: row.project_id };
  if (row.squad_id) return { kind: "squad", id: row.squad_id };
  if (row.organization_id) return { kind: "organization", id: row.organization_id };
  if (row.role_name) return { kind: "role", roleName: row.role_name };
  return { kind: "organization", id: "unknown" };
}

export interface CapabilityHolderRow {
  readonly talentCapabilityId: string;
  readonly talentId: string;
  readonly displayName: string;
  readonly capabilityId: string;
  readonly claimedLevel: number;
  readonly assessmentStatus: AssessmentStatus;
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly sourceType: string;
    readonly validationStatus: "pending" | "validated" | "rejected" | "withdrawn";
    readonly occurredAt: string | null;
  }[];
}

/**
 * People holding the given capabilities, with their evidence.
 *
 * Three separate reads joined in TypeScript rather than one nested select:
 * types/database.ts is hand-written with empty Relationships, so a nested
 * embed across talent_capabilities → profiles resolves to `never`. Each read
 * is independently RLS-scoped, so a person the caller cannot see drops out at
 * the profiles read and their capability row is discarded here — the join
 * cannot reintroduce someone the database hid.
 */
export async function getCapabilityHolders(
  capabilityIds: readonly string[],
): Promise<DataPoint<readonly CapabilityHolderRow[]>> {
  if (capabilityIds.length === 0) return { state: "empty" };

  return guarded("talent_capabilities + profiles + capability_evidence", async () => {
    const supabase = await createClient();

    const { data: held, error: heldError } = await supabase
      .from("talent_capabilities")
      .select("id, profile_id, capability_id, current_level, assessment_status")
      .in("capability_id", [...capabilityIds]);

    if (heldError) return failed(heldError.message);
    if (!held || held.length === 0) return { state: "empty" };

    const [people, evidence] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", held.map((h) => h.profile_id)),
      supabase
        .from("capability_evidence")
        .select("id, talent_capability_id, source_type, validation_status, occurred_at")
        .in("talent_capability_id", held.map((h) => h.id))
        .is("deleted_at", null),
    ]);

    if (people.error) return failed(people.error.message);
    if (evidence.error) return failed(evidence.error.message);

    const nameById = new Map((people.data ?? []).map((p) => [p.id, p.full_name]));

    const evidenceByCapability = new Map<
      string,
      CapabilityHolderRow["evidence"][number][]
    >();
    for (const row of evidence.data ?? []) {
      const list = evidenceByCapability.get(row.talent_capability_id) ?? [];
      list.push({
        evidenceId: row.id,
        sourceType: row.source_type,
        validationStatus:
          row.validation_status as CapabilityHolderRow["evidence"][number]["validationStatus"],
        occurredAt: row.occurred_at,
      });
      evidenceByCapability.set(row.talent_capability_id, list);
    }

    const rows = held
      // A capability row whose profile RLS hid is dropped, not rendered
      // anonymously: naming a gap against someone the caller may not see
      // would leak the fact of their existence.
      .filter((h) => nameById.has(h.profile_id))
      .map((h) => ({
        talentCapabilityId: h.id,
        talentId: h.profile_id,
        displayName: nameById.get(h.profile_id) ?? "",
        capabilityId: h.capability_id,
        claimedLevel: h.current_level,
        assessmentStatus: h.assessment_status as AssessmentStatus,
        evidence: evidenceByCapability.get(h.id) ?? [],
      }));

    if (rows.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: rows,
      provenance: provenance("supabase:talent_capabilities"),
    };
  });
}
