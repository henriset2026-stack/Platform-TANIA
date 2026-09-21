/**
 * Database types.
 *
 * HAND-WRITTEN, NOT GENERATED. No TANIA Supabase project exists, so
 * `supabase gen types` cannot be run. These mirror supabase/migrations/ by
 * hand and are therefore unverified against a real database.
 *
 * Replace this file wholesale as soon as a project exists:
 *     supabase gen types typescript --project-id <ref> > types/database.ts
 *
 * Insert and Update are DERIVED from Row rather than spelled out three times
 * per table. Supabase's generator triplicates every column; doing that by
 * hand across 33 tables would be ~1,500 lines in which a single mismatched
 * optional marker could go unnoticed. `Table<Row, RequiredKeys>` states the
 * columns once and names only those a caller must supply.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Declared with `type` rather than `interface` deliberately: interfaces do not
 * receive an implicit index signature, so they fail supabase-js's
 * `Record<string, unknown>` constraint and every insert resolves to `never`.
 *
 * @template Row          the selected row shape
 * @template RequiredKeys columns with no default that an insert must provide
 */
type Table<Row, RequiredKeys extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredKeys>;
  Update: Partial<Row>;
  Relationships: [];
}

/** A table that cannot be written through PostgREST at all. */
type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
}

type Timestamp = string;
type DateOnly = string;
type UUID = string;

// ===========================================================================
// Identity (Phase 2)
// ===========================================================================

type OrganizationRow = {
  id: UUID;
  name: string;
  code: string;
  type: string;
  parent_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type ProfileRow = {
  id: UUID;
  employee_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  grade: string | null;
  department: string | null;
  chapter_id: UUID | null;
  squad_id: UUID | null;
  manager_id: UUID | null;
  status: string;
  avatar_url: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type SquadRow = {
  id: UUID;
  organization_id: UUID;
  name: string;
  code: string;
  manager_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type RoleRow = {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type PermissionRow = {
  id: UUID;
  code: string;
  description: string | null;
  created_at: Timestamp;
}

type RolePermissionRow = {
  role_id: UUID;
  permission_id: UUID;
  created_at: Timestamp;
}

type OrganizationMembershipRow = {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  role_id: UUID;
  is_primary: boolean;
  granted_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type AuditLogRow = {
  id: number;
  user_id: UUID | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  ip_hash: string | null;
  user_agent: string | null;
  request_id: UUID | null;
  created_at: Timestamp;
}

// ===========================================================================
// Talent & work (Phase 4)
// ===========================================================================

type TalentProfileRow = {
  id: UUID;
  profile_id: UUID;
  summary: string | null;
  years_experience: number | null;
  career_level: string | null;
  talent_status: string;
  potential_flag: boolean;
  last_assessed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type ProjectRow = {
  id: UUID;
  organization_id: UUID;
  code: string;
  name: string;
  description: string | null;
  status: string;
  customer_name: string | null;
  start_date: DateOnly | null;
  end_date: DateOnly | null;
  budget: number | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type AssignmentRow = {
  id: UUID;
  project_id: UUID;
  profile_id: UUID;
  role_name: string | null;
  allocation_pct: number;
  start_date: DateOnly | null;
  end_date: DateOnly | null;
  status: string;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type DeliverableRow = {
  id: UUID;
  project_id: UUID;
  owner_id: UUID | null;
  title: string;
  type: string | null;
  status: string;
  quality_score: number | null;
  customer_score: number | null;
  due_date: DateOnly | null;
  completed_at: Timestamp | null;
  evidence_url: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ===========================================================================
// Capability (Phase 4)
// ===========================================================================

type CapabilityDomainRow = {
  id: UUID;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type CapabilityRow = {
  id: UUID;
  domain_id: UUID;
  code: string;
  name: string;
  description: string | null;
  criticality: string;
  active: boolean;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type CapabilityLevelRow = {
  id: UUID;
  level: number;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type CapabilityRequirementRow = {
  id: UUID;
  capability_id: UUID;
  organization_id: UUID | null;
  squad_id: UUID | null;
  project_id: UUID | null;
  role_name: string | null;
  required_level: number;
  headcount_required: number | null;
  business_criticality: string;
  time_urgency: string;
  effective_from: DateOnly | null;
  effective_to: DateOnly | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type TalentCapabilityRow = {
  id: UUID;
  profile_id: UUID;
  capability_id: UUID;
  current_level: number;
  target_level: number | null;
  confidence: number | null;
  assessment_status: string;
  assessed_at: Timestamp | null;
  assessed_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type CapabilityEvidenceRow = {
  id: UUID;
  talent_capability_id: UUID;
  source_type: string;
  source_reference: string | null;
  title: string;
  description: string | null;
  evidence_url: string | null;
  evidence_score: number | null;
  validation_status: string;
  validated_by: UUID | null;
  validated_at: Timestamp | null;
  occurred_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
}

// ===========================================================================
// Performance (Phase 4)
// ===========================================================================

type PerformancePeriodRow = {
  id: UUID;
  name: string;
  period_type: string;
  start_date: DateOnly;
  end_date: DateOnly;
  status: string;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type PerformanceMetricRow = {
  id: UUID;
  profile_id: UUID;
  period_id: UUID;
  metric_code: string;
  metric_name: string;
  score: number | null;
  weight: number | null;
  source: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type PerformanceEvidenceRow = {
  id: UUID;
  profile_id: UUID;
  period_id: UUID | null;
  dimension: string;
  metric: string | null;
  value: number | null;
  unit: string | null;
  source_type: string;
  source_reference: string | null;
  evidence_text: string | null;
  confidence: number | null;
  validation_status: string;
  validated_by: UUID | null;
  validated_at: Timestamp | null;
  occurred_at: Timestamp | null;
  origin: string;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
}

type PerformanceReviewRow = {
  id: UUID;
  profile_id: UUID;
  period_id: UUID;
  reviewer_id: UUID;
  overall_score: number | null;
  strengths: string | null;
  development_areas: string | null;
  manager_comment: string | null;
  status: string;
  submitted_at: Timestamp | null;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type PerformanceDimensionRow = {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type PerformanceWeightProfileRow = {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  organization_id: UUID | null;
  role_name: string | null;
  period_id: UUID | null;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  active: boolean;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type PerformanceWeightProfileDimensionRow = {
  profile_id: UUID;
  dimension_id: UUID;
  weight: number;
  created_at: Timestamp;
};

// ===========================================================================
// Development (Phase 4)
// ===========================================================================

type DevelopmentPlanRow = {
  id: UUID;
  profile_id: UUID;
  title: string;
  objective: string | null;
  capability_id: UUID | null;
  capability_requirement_id: UUID | null;
  template_id: UUID | null;
  source_capability_gap: string | null;
  status: string;
  start_date: DateOnly | null;
  target_date: DateOnly | null;
  completion_pct: number;
  owner_id: UUID | null;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type LearningPathRow = {
  id: UUID;
  development_plan_id: UUID;
  title: string;
  total_hours: number | null;
  methodology: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type LearningActivityRow = {
  id: UUID;
  learning_path_id: UUID;
  title: string;
  activity_type: string;
  sequence_no: number;
  estimated_hours: number | null;
  status: string;
  completed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type LearningEvidenceRow = {
  id: UUID;
  activity_id: UUID;
  profile_id: UUID;
  evidence_type: string;
  evidence_url: string | null;
  score: number | null;
  evaluator_id: UUID | null;
  evaluated_at: Timestamp | null;
  submitted_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
}

type DevelopmentTemplateRow = {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  methodology: string;
  total_hours: number;
  capability_id: UUID | null;
  target_level: number | null;
  role_name: string | null;
  organization_id: UUID | null;
  active: boolean;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type DevelopmentTemplateActivityRow = {
  id: UUID;
  template_id: UUID;
  sequence_no: number;
  phase: string;
  title: string;
  activity_type: string;
  estimated_hours: number;
  requires_evidence: boolean;
  created_at: Timestamp;
};

type CapabilityUpgradeProposalRow = {
  id: UUID;
  profile_id: UUID;
  capability_id: UUID;
  development_plan_id: UUID | null;
  from_level: number;
  to_level: number;
  rationale: string | null;
  evidence_ids: Json;
  proposed_by: UUID | null;
  proposed_by_agent: string | null;
  status: string;
  decided_by: UUID | null;
  decided_at: Timestamp | null;
  decision_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type FeasibilityAssessmentRow = {
  id: UUID;
  project_id: UUID | null;
  organization_id: UUID;
  title: string;
  summary: string | null;
  requester_id: UUID | null;
  customer_name: string | null;
  weight_profile_id: UUID | null;
  stage: string;
  total_score: number | null;
  score_coverage: number | null;
  scored_at: Timestamp | null;
  decided_by: UUID | null;
  decided_at: Timestamp | null;
  decision_note: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ProjectBudgetRow = {
  id: UUID;
  project_id: UUID;
  fiscal_year: number;
  currency: string;
  planned_amount: number | null;
  committed_amount: number | null;
  realized_amount: number | null;
  external_source: string | null;
  external_reference: string | null;
  external_synced_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

// ===========================================================================
// AI & agents (Phase 4)
// ===========================================================================

type AiUsageRow = {
  id: UUID;
  profile_id: UUID;
  tool_name: string;
  use_case: string;
  task_type: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  output_reference: string | null;
  productivity_delta: number | null;
  quality_score: number | null;
  approved_tool: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type AiAssessmentRow = {
  id: UUID;
  profile_id: UUID;
  capability_id: UUID | null;
  assessment_type: string;
  score: number | null;
  evidence: string | null;
  evaluator_type: string;
  validation_status: string;
  validated_by: UUID | null;
  validated_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type AiAugmentationRow = {
  id: UUID;
  profile_id: UUID;
  period_id: UUID | null;
  research_score: number | null;
  analysis_score: number | null;
  writing_score: number | null;
  product_score: number | null;
  solution_score: number | null;
  automation_score: number | null;
  overall_score: number | null;
  evidence_count: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

type AiInteractionRow = {
  id: UUID;
  user_id: UUID;
  session_id: UUID | null;
  assistant: string;
  intent: string | null;
  user_message: string | null;
  response_summary: string | null;
  citations: Json;
  tools_used: Json;
  latency_ms: number | null;
  feedback: string | null;
  request_id: UUID | null;
  created_at: Timestamp;
}

type AgentRunRow = {
  id: UUID;
  user_id: UUID | null;
  agent_name: string;
  task_type: string;
  status: string;
  input: Json | null;
  output: Json | null;
  confidence: number | null;
  human_approval_required: boolean;
  human_approved: boolean;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  request_id: UUID | null;
  error_detail: string | null;
  started_at: Timestamp;
  completed_at: Timestamp | null;
}

type AgentToolCallRow = {
  id: UUID;
  agent_run_id: UUID;
  tool_name: string;
  arguments: Json | null;
  result: Json | null;
  status: string;
  error_detail: string | null;
  duration_ms: number | null;
  created_at: Timestamp;
}

type RecommendationRow = {
  id: UUID;
  profile_id: UUID | null;
  recommendation_type: string;
  title: string;
  rationale: string | null;
  priority: string | null;
  confidence: number | null;
  evidence: Json;
  status: string;
  created_by_agent: string | null;
  agent_run_id: UUID | null;
  resolved_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  resolved_at: Timestamp | null;
}

// ===========================================================================
// Business impact & knowledge (Phase 4)
// ===========================================================================

type BusinessImpactRow = {
  id: UUID;
  project_id: UUID | null;
  profile_id: UUID | null;
  capability_id: UUID | null;
  impact_type: string;
  metric_name: string;
  baseline: number | null;
  target: number | null;
  actual: number | null;
  unit: string | null;
  monetary_value: number | null;
  currency: string | null;
  evidence_url: string | null;
  validation_status: string;
  validated_by: UUID | null;
  validated_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
}

type KnowledgeDocumentRow = {
  id: UUID;
  title: string;
  source_type: string;
  source_uri: string | null;
  content: string;
  metadata: Json;
  /** pgvector column; serialized as a string over PostgREST. */
  embedding: string | null;
  access_scope: Json;
  sensitivity: string;
  organization_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

// ===========================================================================

export interface Database {
  public: {
    Tables: {
      // Identity
      organizations: Table<OrganizationRow, "name" | "code">;
      profiles: Table<ProfileRow, "id" | "full_name" | "email">;
      squads: Table<SquadRow, "organization_id" | "name" | "code">;
      roles: Table<RoleRow, "code" | "name">;
      permissions: Table<PermissionRow, "code">;
      role_permissions: Table<RolePermissionRow, "role_id" | "permission_id">;
      organization_memberships: Table<
        OrganizationMembershipRow,
        "user_id" | "organization_id" | "role_id"
      >;
      // Append-only: INSERT/UPDATE/DELETE are revoked; rows are written only
      // through record_audit_event(). `never` makes a direct write a type
      // error as well as a runtime denial.
      audit_logs: ReadOnlyTable<AuditLogRow>;

      // Talent & work
      talent_profiles: Table<TalentProfileRow, "profile_id">;
      projects: Table<ProjectRow, "organization_id" | "code" | "name">;
      assignments: Table<AssignmentRow, "project_id" | "profile_id">;
      deliverables: Table<DeliverableRow, "project_id" | "title">;

      // Capability
      capability_domains: Table<CapabilityDomainRow, "name" | "code">;
      capabilities: Table<CapabilityRow, "domain_id" | "code" | "name">;
      capability_levels: Table<CapabilityLevelRow, "level" | "name">;
      capability_requirements: Table<
        CapabilityRequirementRow,
        "capability_id" | "required_level"
      >;
      talent_capabilities: Table<
        TalentCapabilityRow,
        "profile_id" | "capability_id"
      >;
      capability_evidence: Table<
        CapabilityEvidenceRow,
        "talent_capability_id" | "source_type" | "title"
      >;

      // Performance
      performance_periods: Table<
        PerformancePeriodRow,
        "name" | "period_type" | "start_date" | "end_date"
      >;
      performance_metrics: Table<
        PerformanceMetricRow,
        "profile_id" | "period_id" | "metric_code" | "metric_name"
      >;
      performance_evidence: Table<
        PerformanceEvidenceRow,
        "profile_id" | "dimension" | "source_type"
      >;
      performance_reviews: Table<
        PerformanceReviewRow,
        "profile_id" | "period_id" | "reviewer_id"
      >;

      // Configurable weighting (Phase 9). PRD §6.1 makes weights
      // configuration, so they live in data rather than in a constant.
      performance_dimensions: Table<PerformanceDimensionRow, "code" | "name">;
      performance_weight_profiles: Table<
        PerformanceWeightProfileRow,
        "code" | "name"
      >;
      performance_weight_profile_dimensions: Table<
        PerformanceWeightProfileDimensionRow,
        "profile_id" | "dimension_id" | "weight"
      >;

      // Development
      development_plans: Table<DevelopmentPlanRow, "profile_id" | "title">;
      learning_paths: Table<LearningPathRow, "development_plan_id" | "title">;
      learning_activities: Table<
        LearningActivityRow,
        "learning_path_id" | "title" | "activity_type" | "sequence_no"
      >;
      learning_evidence: Table<
        LearningEvidenceRow,
        "activity_id" | "profile_id" | "evidence_type"
      >;

      // Configurable development curricula (Phase 10).
      development_templates: Table<
        DevelopmentTemplateRow,
        "code" | "name" | "total_hours"
      >;
      development_template_activities: Table<
        DevelopmentTemplateActivityRow,
        "template_id" | "sequence_no" | "phase" | "title" | "activity_type" | "estimated_hours"
      >;
      capability_upgrade_proposals: Table<
        CapabilityUpgradeProposalRow,
        "profile_id" | "capability_id" | "from_level" | "to_level" | "evidence_ids"
      >;

      // Feasibility and budget (Phase 12).
      feasibility_assessments: Table<
        FeasibilityAssessmentRow,
        "organization_id" | "title"
      >;
      project_budgets: Table<ProjectBudgetRow, "project_id" | "fiscal_year">;

      // AI & agents
      ai_usage: Table<AiUsageRow, "profile_id" | "tool_name" | "use_case">;
      ai_assessments: Table<
        AiAssessmentRow,
        "profile_id" | "assessment_type"
      >;
      ai_augmentation: Table<AiAugmentationRow, "profile_id">;
      ai_interactions: Table<AiInteractionRow, "user_id">;
      agent_runs: Table<AgentRunRow, "agent_name" | "task_type">;
      agent_tool_calls: Table<AgentToolCallRow, "agent_run_id" | "tool_name">;
      recommendations: Table<
        RecommendationRow,
        "recommendation_type" | "title"
      >;

      // Business impact & knowledge
      business_impacts: Table<
        BusinessImpactRow,
        "impact_type" | "metric_name"
      >;
      knowledge_documents: Table<
        KnowledgeDocumentRow,
        "title" | "source_type" | "content"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      has_role: { Args: { required_role: string }; Returns: boolean };
      has_permission: { Args: { required_permission: string }; Returns: boolean };
      is_ai_service: { Args: Record<string, never>; Returns: boolean };
      user_org_ids: { Args: Record<string, never>; Returns: string[] };
      user_squad_ids: { Args: Record<string, never>; Returns: string[] };
      can_access_profile: { Args: { target_id: string }; Returns: boolean };
      can_access_project: { Args: { target_id: string }; Returns: boolean };
      current_user_roles: { Args: Record<string, never>; Returns: string[] };
      current_user_permissions: { Args: Record<string, never>; Returns: string[] };
      record_audit_event: {
        Args: {
          p_action: string;
          p_resource_type: string;
          p_resource_id?: string | null;
          p_before_data?: Json | null;
          p_after_data?: Json | null;
          p_request_id?: string | null;
        };
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Organization = Tables<"organizations">;
export type Profile = Tables<"profiles">;
export type Squad = Tables<"squads">;
export type Role = Tables<"roles">;
export type Permission = Tables<"permissions">;
export type OrganizationMembership = Tables<"organization_memberships">;
export type AuditLog = Tables<"audit_logs">;
export type TalentProfile = Tables<"talent_profiles">;
export type Project = Tables<"projects">;
export type Assignment = Tables<"assignments">;
export type Deliverable = Tables<"deliverables">;
export type CapabilityDomain = Tables<"capability_domains">;
export type Capability = Tables<"capabilities">;
export type CapabilityLevel = Tables<"capability_levels">;
export type CapabilityRequirement = Tables<"capability_requirements">;
export type TalentCapability = Tables<"talent_capabilities">;
export type CapabilityEvidence = Tables<"capability_evidence">;
export type PerformancePeriod = Tables<"performance_periods">;
export type PerformanceMetric = Tables<"performance_metrics">;
export type PerformanceEvidence = Tables<"performance_evidence">;
export type PerformanceReview = Tables<"performance_reviews">;
export type PerformanceDimension = Tables<"performance_dimensions">;
export type PerformanceWeightProfile = Tables<"performance_weight_profiles">;
export type DevelopmentPlan = Tables<"development_plans">;
export type LearningPath = Tables<"learning_paths">;
export type LearningActivity = Tables<"learning_activities">;
export type LearningEvidence = Tables<"learning_evidence">;
export type DevelopmentTemplateRecord = Tables<"development_templates">;
export type CapabilityUpgradeProposal = Tables<"capability_upgrade_proposals">;
export type AiUsage = Tables<"ai_usage">;
export type AiAssessment = Tables<"ai_assessments">;
export type AiAugmentation = Tables<"ai_augmentation">;
export type AiInteraction = Tables<"ai_interactions">;
export type AgentRun = Tables<"agent_runs">;
export type AgentToolCall = Tables<"agent_tool_calls">;
export type Recommendation = Tables<"recommendations">;
export type BusinessImpact = Tables<"business_impacts">;
export type KnowledgeDocument = Tables<"knowledge_documents">;
