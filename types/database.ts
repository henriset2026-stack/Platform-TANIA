/**
 * Database types for the Phase 2 base schema.
 *
 * HAND-WRITTEN, NOT GENERATED. No TANIA Supabase project exists yet, so
 * `supabase gen types` could not be run. These types mirror
 * supabase/migrations/2026092012000{1..8}.sql by hand and are therefore
 * unverified against a real database.
 *
 * Replace this file wholesale with generated output as soon as a project
 * exists:
 *     supabase gen types typescript --project-id <ref> > types/database.ts
 *
 * Only Phase 2 tables appear here. Domain tables arrive in Phase 4+.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          code: string;
          type: string;
          parent_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          type?: string;
          parent_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          type?: string;
          parent_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          employee_id: string | null;
          full_name: string;
          email: string;
          job_title: string | null;
          grade: string | null;
          department: string | null;
          chapter_id: string | null;
          squad_id: string | null;
          manager_id: string | null;
          status: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          employee_id?: string | null;
          full_name: string;
          email: string;
          job_title?: string | null;
          grade?: string | null;
          department?: string | null;
          chapter_id?: string | null;
          squad_id?: string | null;
          manager_id?: string | null;
          status?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string | null;
          full_name?: string;
          email?: string;
          job_title?: string | null;
          grade?: string | null;
          department?: string | null;
          chapter_id?: string | null;
          squad_id?: string | null;
          manager_id?: string | null;
          status?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      squads: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          manager_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          manager_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string;
          manager_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          code: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
          created_at?: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role_id: string;
          is_primary: boolean;
          granted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role_id: string;
          is_primary?: boolean;
          granted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role_id?: string;
          is_primary?: boolean;
          granted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          ip_hash: string | null;
          user_agent: string | null;
          request_id: string | null;
          created_at: string;
        };
        // audit_logs is append-only: INSERT/UPDATE/DELETE are revoked and rows
        // are written only through record_audit_event(). `never` makes a direct
        // write a type error as well as a runtime denial.
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      has_role: {
        Args: { required_role: string };
        Returns: boolean;
      };
      has_permission: {
        Args: { required_permission: string };
        Returns: boolean;
      };
      user_org_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      user_squad_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      can_access_profile: {
        Args: { target_id: string };
        Returns: boolean;
      };
      current_user_roles: {
        Args: Record<string, never>;
        Returns: string[];
      };
      current_user_permissions: {
        Args: Record<string, never>;
        Returns: string[];
      };
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
