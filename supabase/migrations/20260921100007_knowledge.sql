-- 20260921100007_knowledge.sql
-- RAG knowledge corpus (TANIA_PRD_v2.0.md §42).
--
-- CLOSES TANIA_IMPLEMENTATION_BASELINE.md §7.2.
--
-- TANIA_SUPABASE_RLS.sql never mentions knowledge_documents. Combined with its
-- blanket grant, every authenticated user could read the entire corpus —
-- bypassing access_scope — and WRITE to it. Write access to a corpus the
-- assistant later retrieves is a knowledge-poisoning and indirect
-- prompt-injection path into every agent. RLS is applied in the domain RLS
-- migration; ingestion is restricted there to admin.integrations.
--
-- Embedding dimension: PRD §42.2 shows vector(1536) but states the dimension
-- must match the selected embedding model. No model has been selected
-- (EMBEDDING_MODEL is unset), so 1536 is carried forward as the PRD's value
-- and MUST be revisited in Phase 14 before any ingestion.

create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  source_type text not null check (length(trim(source_type)) > 0),
  source_uri text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536),
  -- Row-level retrieval scope. Shape: {"organization_ids": [...],
  -- "roles": [...], "sensitivity": "INTERNAL"}. Enforced by RLS, not by the
  -- retrieval code: a retrieval path is not an authorization boundary.
  access_scope jsonb not null default '{}'::jsonb,
  sensitivity text not null default 'INTERNAL'
    check (sensitivity in ('INTERNAL', 'CONFIDENTIAL', 'SENSITIVE', 'RESTRICTED')),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.knowledge_documents is
  'RAG corpus. RLS-protected: unrestricted write access here is a prompt-injection path into every agent.';
comment on column public.knowledge_documents.access_scope is
  'Retrieval scope enforced by RLS. Retrieval code must never be the only filter.';

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();
