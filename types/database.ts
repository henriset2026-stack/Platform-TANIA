/**
 * Database types — GENERATED from project hcyaqbgbwfxzutamceoq after all 28
 * migrations were applied (2026-09-24). Do not edit by hand; regenerate:
 *     supabase gen types typescript --linked --schema public > types/database.ts
 * then re-append the named aliases at the bottom of this file.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_name: string
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          confidence: number | null
          correlation_id: string | null
          error_detail: string | null
          evidence_refs: Json
          human_approval_required: boolean
          human_approved: boolean
          id: string
          input: Json | null
          latency_ms: number | null
          output: Json | null
          request_id: string | null
          session_id: string | null
          started_at: string
          status: string
          task_type: string
          user_id: string | null
        }
        Insert: {
          agent_name: string
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          confidence?: number | null
          correlation_id?: string | null
          error_detail?: string | null
          evidence_refs?: Json
          human_approval_required?: boolean
          human_approved?: boolean
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          request_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          task_type: string
          user_id?: string | null
        }
        Update: {
          agent_name?: string
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          confidence?: number | null
          correlation_id?: string | null
          error_detail?: string | null
          evidence_refs?: Json
          human_approval_required?: boolean
          human_approved?: boolean
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          request_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          task_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_calls: {
        Row: {
          agent_name: string | null
          agent_run_id: string | null
          arguments: Json | null
          audited: boolean
          authorization_decision: string | null
          correlation_id: string | null
          created_at: string
          denial_reason: string | null
          duration_ms: number | null
          error_detail: string | null
          evidence_refs: Json
          id: string
          result: Json | null
          risk_level: string | null
          session_id: string | null
          status: string
          tool_name: string
          user_id: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_run_id?: string | null
          arguments?: Json | null
          audited?: boolean
          authorization_decision?: string | null
          correlation_id?: string | null
          created_at?: string
          denial_reason?: string | null
          duration_ms?: number | null
          error_detail?: string | null
          evidence_refs?: Json
          id?: string
          result?: Json | null
          risk_level?: string | null
          session_id?: string | null
          status?: string
          tool_name: string
          user_id?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_run_id?: string | null
          arguments?: Json | null
          audited?: boolean
          authorization_decision?: string | null
          correlation_id?: string | null
          created_at?: string
          denial_reason?: string | null
          duration_ms?: number | null
          error_detail?: string | null
          evidence_refs?: Json
          id?: string
          result?: Json | null
          risk_level?: string | null
          session_id?: string | null
          status?: string
          tool_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_calls_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assessments: {
        Row: {
          assessment_type: string
          capability_id: string | null
          created_at: string
          evaluator_type: string
          evidence: string | null
          id: string
          profile_id: string
          score: number | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_status: string
        }
        Insert: {
          assessment_type: string
          capability_id?: string | null
          created_at?: string
          evaluator_type?: string
          evidence?: string | null
          id?: string
          profile_id: string
          score?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Update: {
          assessment_type?: string
          capability_id?: string | null
          created_at?: string
          evaluator_type?: string
          evidence?: string | null
          id?: string
          profile_id?: string
          score?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_assessments_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_assessments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_assessments_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_augmentation: {
        Row: {
          analysis_score: number | null
          automation_score: number | null
          created_at: string
          evidence_count: number
          id: string
          overall_score: number | null
          period_id: string | null
          product_score: number | null
          profile_id: string
          research_score: number | null
          solution_score: number | null
          updated_at: string
          writing_score: number | null
        }
        Insert: {
          analysis_score?: number | null
          automation_score?: number | null
          created_at?: string
          evidence_count?: number
          id?: string
          overall_score?: number | null
          period_id?: string | null
          product_score?: number | null
          profile_id: string
          research_score?: number | null
          solution_score?: number | null
          updated_at?: string
          writing_score?: number | null
        }
        Update: {
          analysis_score?: number | null
          automation_score?: number | null
          created_at?: string
          evidence_count?: number
          id?: string
          overall_score?: number | null
          period_id?: string | null
          product_score?: number | null
          profile_id?: string
          research_score?: number | null
          solution_score?: number | null
          updated_at?: string
          writing_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_augmentation_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "performance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_augmentation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interactions: {
        Row: {
          assistant: string
          citations: Json
          created_at: string
          feedback: string | null
          id: string
          intent: string | null
          latency_ms: number | null
          request_id: string | null
          response_summary: string | null
          session_id: string | null
          tools_used: Json
          user_id: string
          user_message: string | null
        }
        Insert: {
          assistant?: string
          citations?: Json
          created_at?: string
          feedback?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          request_id?: string | null
          response_summary?: string | null
          session_id?: string | null
          tools_used?: Json
          user_id: string
          user_message?: string | null
        }
        Update: {
          assistant?: string
          citations?: Json
          created_at?: string
          feedback?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          request_id?: string | null
          response_summary?: string | null
          session_id?: string | null
          tools_used?: Json
          user_id?: string
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          approved_tool: boolean
          completed_at: string | null
          created_at: string
          id: string
          output_reference: string | null
          productivity_delta: number | null
          profile_id: string
          quality_score: number | null
          started_at: string | null
          task_type: string | null
          tool_name: string
          updated_at: string
          use_case: string
        }
        Insert: {
          approved_tool?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          output_reference?: string | null
          productivity_delta?: number | null
          profile_id: string
          quality_score?: number | null
          started_at?: string | null
          task_type?: string | null
          tool_name: string
          updated_at?: string
          use_case: string
        }
        Update: {
          approved_tool?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          output_reference?: string | null
          productivity_delta?: number | null
          profile_id?: string
          quality_score?: number | null
          started_at?: string | null
          task_type?: string | null
          tool_name?: string
          updated_at?: string
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          allocation_pct: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          profile_id: string
          project_id: string
          role_name: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allocation_pct?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          profile_id: string
          project_id: string
          role_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allocation_pct?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          profile_id?: string
          project_id?: string
          role_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: number
          ip_hash: string | null
          request_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: never
          ip_hash?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: never
          ip_hash?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_reallocations: {
        Row: {
          amount: number
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          fiscal_year: number
          from_project_id: string
          id: string
          rationale: string | null
          requested_by: string | null
          status: string
          to_project_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          fiscal_year: number
          from_project_id: string
          id?: string
          rationale?: string | null
          requested_by?: string | null
          status?: string
          to_project_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          fiscal_year?: number
          from_project_id?: string
          id?: string
          rationale?: string | null
          requested_by?: string | null
          status?: string
          to_project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_reallocations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reallocations_from_project_id_fkey"
            columns: ["from_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reallocations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_reallocations_to_project_id_fkey"
            columns: ["to_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_thresholds: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string | null
          severity: string
          threshold_pct: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          severity?: string
          threshold_pct: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          severity?: string
          threshold_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_thresholds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_impacts: {
        Row: {
          actual: number | null
          baseline: number | null
          capability_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          deleted_by: string | null
          evidence_url: string | null
          id: string
          impact_type: string
          metric_name: string
          monetary_value: number | null
          profile_id: string | null
          project_id: string | null
          target: number | null
          unit: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_status: string
        }
        Insert: {
          actual?: number | null
          baseline?: number | null
          capability_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evidence_url?: string | null
          id?: string
          impact_type: string
          metric_name: string
          monetary_value?: number | null
          profile_id?: string | null
          project_id?: string | null
          target?: number | null
          unit?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Update: {
          actual?: number | null
          baseline?: number | null
          capability_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evidence_url?: string | null
          id?: string
          impact_type?: string
          metric_name?: string
          monetary_value?: number | null
          profile_id?: string | null
          project_id?: string | null
          target?: number | null
          unit?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_impacts_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_impacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_impacts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_impacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_impacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_impacts_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          criticality: string
          description: string | null
          domain_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          criticality?: string
          description?: string | null
          domain_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          criticality?: string
          description?: string | null
          domain_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capabilities_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "capability_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_domains: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      capability_evidence: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          evidence_score: number | null
          evidence_url: string | null
          id: string
          occurred_at: string | null
          source_reference: string | null
          source_type: string
          talent_capability_id: string
          title: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          evidence_score?: number | null
          evidence_url?: string | null
          id?: string
          occurred_at?: string | null
          source_reference?: string | null
          source_type: string
          talent_capability_id: string
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          evidence_score?: number | null
          evidence_url?: string | null
          id?: string
          occurred_at?: string | null
          source_reference?: string | null
          source_type?: string
          talent_capability_id?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_evidence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_evidence_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_evidence_talent_capability_id_fkey"
            columns: ["talent_capability_id"]
            isOneToOne: false
            referencedRelation: "talent_capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_evidence_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_levels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          level: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          level: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      capability_requirements: {
        Row: {
          business_criticality: string
          capability_id: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          headcount_required: number | null
          id: string
          organization_id: string | null
          project_id: string | null
          required_level: number
          role_name: string | null
          squad_id: string | null
          time_urgency: string
          updated_at: string
        }
        Insert: {
          business_criticality?: string
          capability_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          headcount_required?: number | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          required_level: number
          role_name?: string | null
          squad_id?: string | null
          time_urgency?: string
          updated_at?: string
        }
        Update: {
          business_criticality?: string
          capability_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          headcount_required?: number | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          required_level?: number
          role_name?: string | null
          squad_id?: string | null
          time_urgency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_requirements_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_requirements_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_upgrade_proposals: {
        Row: {
          capability_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          development_plan_id: string | null
          evidence_ids: Json
          from_level: number
          id: string
          profile_id: string
          proposed_by: string | null
          proposed_by_agent: string | null
          rationale: string | null
          status: string
          to_level: number
          updated_at: string
        }
        Insert: {
          capability_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          development_plan_id?: string | null
          evidence_ids?: Json
          from_level: number
          id?: string
          profile_id: string
          proposed_by?: string | null
          proposed_by_agent?: string | null
          rationale?: string | null
          status?: string
          to_level: number
          updated_at?: string
        }
        Update: {
          capability_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          development_plan_id?: string | null
          evidence_ids?: Json
          from_level?: number
          id?: string
          profile_id?: string
          proposed_by?: string | null
          proposed_by_agent?: string | null
          rationale?: string | null
          status?: string
          to_level?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_upgrade_proposals_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_upgrade_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_upgrade_proposals_development_plan_id_fkey"
            columns: ["development_plan_id"]
            isOneToOne: false
            referencedRelation: "development_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_upgrade_proposals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_upgrade_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_score: number | null
          due_date: string | null
          evidence_url: string | null
          id: string
          owner_id: string | null
          project_id: string
          quality_score: number | null
          status: string
          title: string
          type: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_score?: number | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          owner_id?: string | null
          project_id: string
          quality_score?: number | null
          status?: string
          title: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_score?: number | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          owner_id?: string | null
          project_id?: string
          quality_score?: number | null
          status?: string
          title?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      development_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          capability_id: string | null
          capability_requirement_id: string | null
          completion_pct: number
          created_at: string
          created_by: string | null
          id: string
          objective: string | null
          owner_id: string | null
          profile_id: string
          source_capability_gap: string | null
          start_date: string | null
          status: string
          target_date: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          capability_id?: string | null
          capability_requirement_id?: string | null
          completion_pct?: number
          created_at?: string
          created_by?: string | null
          id?: string
          objective?: string | null
          owner_id?: string | null
          profile_id: string
          source_capability_gap?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          capability_id?: string | null
          capability_requirement_id?: string | null
          completion_pct?: number
          created_at?: string
          created_by?: string | null
          id?: string
          objective?: string | null
          owner_id?: string | null
          profile_id?: string
          source_capability_gap?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_capability_requirement_id_fkey"
            columns: ["capability_requirement_id"]
            isOneToOne: false
            referencedRelation: "capability_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "development_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      development_template_activities: {
        Row: {
          activity_type: string
          created_at: string
          estimated_hours: number
          id: string
          phase: string
          requires_evidence: boolean
          sequence_no: number
          template_id: string
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          estimated_hours: number
          id?: string
          phase: string
          requires_evidence?: boolean
          sequence_no: number
          template_id: string
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          estimated_hours?: number
          id?: string
          phase?: string
          requires_evidence?: boolean
          sequence_no?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_template_activities_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "development_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      development_templates: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          capability_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          methodology: string
          name: string
          organization_id: string | null
          role_name: string | null
          target_level: number | null
          total_hours: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          capability_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          methodology?: string
          name: string
          organization_id?: string | null
          role_name?: string | null
          target_level?: number | null
          total_hours: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          capability_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          methodology?: string
          name?: string
          organization_id?: string | null
          role_name?: string | null
          target_level?: number | null
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_templates_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_assessments: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          organization_id: string
          project_id: string | null
          requester_id: string | null
          score_coverage: number | null
          scored_at: string | null
          stage: string
          summary: string | null
          title: string
          total_score: number | null
          updated_at: string
          weight_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id: string
          project_id?: string | null
          requester_id?: string | null
          score_coverage?: number | null
          scored_at?: string | null
          stage?: string
          summary?: string | null
          title: string
          total_score?: number | null
          updated_at?: string
          weight_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id?: string
          project_id?: string | null
          requester_id?: string | null
          score_coverage?: number | null
          scored_at?: string | null
          stage?: string
          summary?: string | null
          title?: string
          total_score?: number | null
          updated_at?: string
          weight_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_assessments_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_assessments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_assessments_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_assessments_weight_profile_id_fkey"
            columns: ["weight_profile_id"]
            isOneToOne: false
            referencedRelation: "feasibility_weight_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_criteria: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          higher_is_better: boolean
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feasibility_reviews: {
        Row: {
          actual_outcome: string | null
          assessment_id: string
          created_at: string
          delivered_in_budget: boolean | null
          delivered_on_time: boolean | null
          id: string
          lessons: string | null
          predicted_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          actual_outcome?: string | null
          assessment_id: string
          created_at?: string
          delivered_in_budget?: boolean | null
          delivered_on_time?: boolean | null
          id?: string
          lessons?: string | null
          predicted_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          actual_outcome?: string | null
          assessment_id?: string
          created_at?: string
          delivered_in_budget?: boolean | null
          delivered_on_time?: boolean | null
          id?: string
          lessons?: string | null
          predicted_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_reviews_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "feasibility_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_scores: {
        Row: {
          assessment_id: string
          created_at: string
          criterion_id: string
          id: string
          rationale: string | null
          score: number | null
          scored_by: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          criterion_id: string
          id?: string
          rationale?: string | null
          score?: number | null
          scored_by?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          criterion_id?: string
          id?: string
          rationale?: string | null
          score?: number | null
          scored_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "feasibility_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "feasibility_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_scores_scored_by_fkey"
            columns: ["scored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_weight_profile_criteria: {
        Row: {
          created_at: string
          criterion_id: string
          profile_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          criterion_id: string
          profile_id: string
          weight: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_weight_profile_criteria_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "feasibility_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_weight_profile_criteria_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "feasibility_weight_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_weight_profiles: {
        Row: {
          active: boolean
          approve_threshold: number
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string | null
          review_threshold: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          approve_threshold?: number
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          review_threshold?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          approve_threshold?: number
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          review_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_weight_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_weight_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feasibility_weight_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          deleted_at: string | null
          document_id: string
          embedding: string | null
          end_offset: number | null
          id: string
          metadata: Json
          organization_id: string | null
          sensitivity: string
          start_offset: number | null
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          deleted_at?: string | null
          document_id: string
          embedding?: string | null
          end_offset?: number | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          sensitivity?: string
          start_offset?: number | null
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          document_id?: string
          embedding?: string | null
          end_offset?: number | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          sensitivity?: string
          start_offset?: number | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          access_scope: Json
          content: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          embedding: string | null
          id: string
          metadata: Json
          organization_id: string | null
          sensitivity: string
          source_type: string
          source_uri: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_scope?: Json
          content: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          sensitivity?: string
          source_type: string
          source_uri?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_scope?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          sensitivity?: string
          source_type?: string
          source_uri?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_activities: {
        Row: {
          activity_type: string
          completed_at: string | null
          created_at: string
          estimated_hours: number | null
          id: string
          learning_path_id: string
          sequence_no: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type: string
          completed_at?: string | null
          created_at?: string
          estimated_hours?: number | null
          id?: string
          learning_path_id: string
          sequence_no: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          completed_at?: string | null
          created_at?: string
          estimated_hours?: number | null
          id?: string
          learning_path_id?: string
          sequence_no?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_activities_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_evidence: {
        Row: {
          activity_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          evaluated_at: string | null
          evaluator_id: string | null
          evidence_type: string
          evidence_url: string | null
          id: string
          profile_id: string
          score: number | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          evaluated_at?: string | null
          evaluator_id?: string | null
          evidence_type: string
          evidence_url?: string | null
          id?: string
          profile_id: string
          score?: number | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          evaluated_at?: string | null
          evaluator_id?: string | null
          evidence_type?: string
          evidence_url?: string | null
          id?: string
          profile_id?: string
          score?: number | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_evidence_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "learning_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_evidence_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_evidence_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_evidence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          created_at: string
          created_by: string | null
          development_plan_id: string
          id: string
          methodology: string | null
          title: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          development_plan_id: string
          id?: string
          methodology?: string | null
          title: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          development_plan_id?: string
          id?: string
          methodology?: string | null
          title?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_paths_development_plan_id_fkey"
            columns: ["development_plan_id"]
            isOneToOne: false
            referencedRelation: "development_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          is_primary: boolean
          organization_id: string
          role_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          is_primary?: boolean
          organization_id: string
          role_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          is_primary?: boolean
          organization_id?: string
          role_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_dimensions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      performance_evidence: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          dimension: string
          evidence_text: string | null
          id: string
          metric: string | null
          occurred_at: string | null
          origin: string
          period_id: string | null
          profile_id: string
          source_reference: string | null
          source_type: string
          unit: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_status: string
          value: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dimension: string
          evidence_text?: string | null
          id?: string
          metric?: string | null
          occurred_at?: string | null
          origin?: string
          period_id?: string | null
          profile_id: string
          source_reference?: string | null
          source_type: string
          unit?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          value?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dimension?: string
          evidence_text?: string | null
          id?: string
          metric?: string | null
          occurred_at?: string | null
          origin?: string
          period_id?: string | null
          profile_id?: string
          source_reference?: string | null
          source_type?: string
          unit?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_evidence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "performance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          created_at: string
          id: string
          metric_code: string
          metric_name: string
          period_id: string
          profile_id: string
          score: number | null
          source: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_code: string
          metric_name: string
          period_id: string
          profile_id: string
          score?: number | null
          source?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_code?: string
          metric_name?: string
          period_id?: string
          profile_id?: string
          score?: number | null
          source?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_metrics_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "performance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_periods: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          name: string
          period_type: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          name: string
          period_type: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          name?: string
          period_type?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          development_areas: string | null
          id: string
          manager_comment: string | null
          overall_score: number | null
          period_id: string
          profile_id: string
          reviewer_id: string
          status: string
          strengths: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          development_areas?: string | null
          id?: string
          manager_comment?: string | null
          overall_score?: number | null
          period_id: string
          profile_id: string
          reviewer_id: string
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          development_areas?: string | null
          id?: string
          manager_comment?: string | null
          overall_score?: number | null
          period_id?: string
          profile_id?: string
          reviewer_id?: string
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "performance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_weight_profile_dimensions: {
        Row: {
          created_at: string
          dimension_id: string
          profile_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          dimension_id: string
          profile_id: string
          weight: number
        }
        Update: {
          created_at?: string
          dimension_id?: string
          profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_weight_profile_dimensions_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "performance_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_weight_profile_dimensions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "performance_weight_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_weight_profiles: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string | null
          period_id: string | null
          role_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          period_id?: string | null
          role_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          period_id?: string | null
          role_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_weight_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_weight_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_weight_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_weight_profiles_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "performance_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          chapter_id: string | null
          created_at: string
          department: string | null
          email: string
          employee_id: string | null
          full_name: string
          grade: string | null
          id: string
          job_title: string | null
          manager_id: string | null
          squad_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          chapter_id?: string | null
          created_at?: string
          department?: string | null
          email: string
          employee_id?: string | null
          full_name: string
          grade?: string | null
          id: string
          job_title?: string | null
          manager_id?: string | null
          squad_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          chapter_id?: string | null
          created_at?: string
          department?: string | null
          email?: string
          employee_id?: string | null
          full_name?: string
          grade?: string | null
          id?: string
          job_title?: string | null
          manager_id?: string | null
          squad_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budgets: {
        Row: {
          committed_amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          external_reference: string | null
          external_source: string | null
          external_synced_at: string | null
          fiscal_year: number
          id: string
          planned_amount: number | null
          project_id: string
          realized_amount: number | null
          updated_at: string
        }
        Insert: {
          committed_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_reference?: string | null
          external_source?: string | null
          external_synced_at?: string | null
          fiscal_year: number
          id?: string
          planned_amount?: number | null
          project_id: string
          realized_amount?: number | null
          updated_at?: string
        }
        Update: {
          committed_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          external_reference?: string | null
          external_source?: string | null
          external_synced_at?: string | null
          fiscal_year?: number
          id?: string
          planned_amount?: number | null
          project_id?: string
          realized_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          code: string
          created_at: string
          created_by: string | null
          customer_name: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          organization_id: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organization_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organization_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_retrievals: {
        Row: {
          correlation_id: string | null
          created_at: string
          document_ids: Json
          id: string
          injection_signal_count: number
          latency_ms: number | null
          min_similarity: number | null
          query_hash: string
          query_length: number
          requested_match_count: number
          returned_chunk_count: number
          session_id: string | null
          top_similarity: number | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          document_ids?: Json
          id?: string
          injection_signal_count?: number
          latency_ms?: number | null
          min_similarity?: number | null
          query_hash: string
          query_length: number
          requested_match_count: number
          returned_chunk_count: number
          session_id?: string | null
          top_similarity?: number | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          document_ids?: Json
          id?: string
          injection_signal_count?: number
          latency_ms?: number | null
          min_similarity?: number | null
          query_hash?: string
          query_length?: number
          requested_match_count?: number
          returned_chunk_count?: number
          session_id?: string | null
          top_similarity?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_retrievals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          agent_run_id: string | null
          confidence: number | null
          created_at: string
          created_by_agent: string | null
          evidence: Json
          id: string
          priority: string | null
          profile_id: string | null
          rationale: string | null
          recommendation_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_run_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by_agent?: string | null
          evidence?: Json
          id?: string
          priority?: string | null
          profile_id?: string | null
          rationale?: string | null
          recommendation_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_run_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by_agent?: string | null
          evidence?: Json
          id?: string
          priority?: string | null
          profile_id?: string | null
          rationale?: string | null
          recommendation_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      squads: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          manager_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_capabilities: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          assessment_status: string
          capability_id: string
          confidence: number | null
          created_at: string
          current_level: number
          id: string
          profile_id: string
          target_level: number | null
          updated_at: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessment_status?: string
          capability_id: string
          confidence?: number | null
          created_at?: string
          current_level?: number
          id?: string
          profile_id: string
          target_level?: number | null
          updated_at?: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessment_status?: string
          capability_id?: string
          confidence?: number | null
          created_at?: string
          current_level?: number
          id?: string
          profile_id?: string
          target_level?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_capabilities_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_capabilities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profiles: {
        Row: {
          career_level: string | null
          created_at: string
          id: string
          last_assessed_at: string | null
          potential_flag: boolean
          profile_id: string
          summary: string | null
          talent_status: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          career_level?: string | null
          created_at?: string
          id?: string
          last_assessed_at?: string | null
          potential_flag?: boolean
          profile_id: string
          summary?: string | null
          talent_status?: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          career_level?: string | null
          created_at?: string
          id?: string
          last_assessed_at?: string | null
          potential_flag?: boolean
          profile_id?: string
          summary?: string | null
          talent_status?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_profile: { Args: { target_id: string }; Returns: boolean }
      can_access_project: { Args: { target_id: string }; Returns: boolean }
      chapter_capability_summary: {
        Args: never
        Returns: {
          average_level: number
          below_target: number
          capability_id: string
          capability_name: string
          organization_id: string
          suppressed: boolean
          talents_assessed: number
        }[]
      }
      chapter_summary: {
        Args: never
        Returns: {
          active_assignments: number
          active_headcount: number
          active_projects: number
          organization_id: string
          organization_name: string
          overallocated_people: number
          suppressed: boolean
          talents_assessed: number
        }[]
      }
      current_user_permissions: { Args: never; Returns: string[] }
      current_user_roles: { Args: never; Returns: string[] }
      has_permission: {
        Args: { required_permission: string }
        Returns: boolean
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      is_ai_service: { Args: never; Returns: boolean }
      is_protected_role: { Args: { target_role: string }; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          filter_organization_id?: string
          filter_source_type?: string
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          document_title: string
          similarity: number
          source_type: string
          source_uri: string
        }[]
      }
      record_audit_event: {
        Args: {
          p_action: string
          p_after_data?: Json
          p_before_data?: Json
          p_request_id?: string
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: number
      }
      user_admin_org_ids: { Args: never; Returns: string[] }
      user_org_ids: { Args: never; Returns: string[] }
      user_squad_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Named aliases used across the codebase.
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
export type KnowledgeChunk = Tables<"knowledge_chunks">;
