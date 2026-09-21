-- 20260921140001_knowledge_chunks.sql
-- Phase 14 — RAG chunk store and authorized vector search.
--
-- THE CENTRAL SECURITY DECISION
-- match_knowledge_chunks() is SECURITY INVOKER, not SECURITY DEFINER.
--
-- Almost every pgvector example in circulation uses SECURITY DEFINER so the
-- function can read the whole table, then filters results afterwards. That is
-- precisely the pattern forbidden here: it retrieves unauthorized documents
-- and removes them later, which means the rows were read, ranked, and had
-- their similarity computed before anyone checked entitlement. Any bug,
-- ordering change or limit interaction leaks them.
--
-- SECURITY INVOKER means the RLS policies on knowledge_chunks and
-- knowledge_documents apply DURING the index scan. An unauthorized chunk is
-- never a candidate, never ranked, and cannot occupy one of the top-k slots
-- that an authorized chunk should have taken.
--
-- The cost is real and accepted: RLS predicates run inside the scan, so the
-- policy-path columns must be indexed (they are, below).

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.knowledge_documents(id) on delete cascade,
  -- Position within the document, for citation and for reassembling context.
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(trim(content)) > 0),
  /* Character offsets into the source document, so a citation can point at a
     location rather than only at a document. */
  start_offset integer check (start_offset is null or start_offset >= 0),
  end_offset integer check (end_offset is null or end_offset >= 0),
  token_count integer check (token_count is null or token_count > 0),
  /* Dimension must match the selected embedding model. EMBEDDING_MODEL is
     still unset (open since Phase 0), so 1536 is carried forward from
     PRD §42.2 and MUST be revisited before any ingestion. A mismatch here is
     not a subtle bug: inserts fail outright, which is the safe direction. */
  embedding extensions.vector(1536),
  /* Denormalized from the parent document PURELY so RLS can be evaluated on
     the chunk row without a join during the vector scan. A join inside a
     policy predicate on every candidate row is what makes authorized vector
     search too slow to use. Kept in step by trigger below — this is the one
     place duplication is justified (CLAUDE.md §21). */
  organization_id uuid,
  sensitivity text not null default 'INTERNAL'
    check (sensitivity in ('INTERNAL', 'CONFIDENTIAL', 'SENSITIVE', 'RESTRICTED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (document_id, chunk_index),
  constraint chunk_offsets_ordered check (
    end_offset is null or start_offset is null or end_offset >= start_offset
  )
);

comment on table public.knowledge_chunks is
  'RAG chunks. organization_id and sensitivity are denormalized from the parent document so RLS can filter during the vector index scan without a join.';

-- --------------------------------------------------------------------------
-- Keep the denormalized ACL columns truthful.
--
-- Without this a document could be reclassified to RESTRICTED while its
-- chunks kept an INTERNAL copy, and the chunk-level policy would keep serving
-- them. The trigger makes the parent the single source of truth.
-- --------------------------------------------------------------------------
create or replace function public.sync_chunk_acl()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select d.organization_id, d.sensitivity
    into new.organization_id, new.sensitivity
  from public.knowledge_documents d
  where d.id = new.document_id;
  return new;
end;
$$;

drop trigger if exists knowledge_chunks_sync_acl on public.knowledge_chunks;
create trigger knowledge_chunks_sync_acl
  before insert or update of document_id on public.knowledge_chunks
  for each row execute function public.sync_chunk_acl();

-- When a document is reclassified, propagate to its chunks immediately.
create or replace function public.propagate_document_acl()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.sensitivity is distinct from old.sensitivity
     or new.deleted_at is distinct from old.deleted_at then
    update public.knowledge_chunks
       set organization_id = new.organization_id,
           sensitivity = new.sensitivity,
           deleted_at = new.deleted_at
     where document_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists knowledge_documents_propagate_acl on public.knowledge_documents;
create trigger knowledge_documents_propagate_acl
  after update on public.knowledge_documents
  for each row execute function public.propagate_document_acl();

-- --------------------------------------------------------------------------
-- RLS on chunks. Mirrors the document policy so the two cannot diverge.
-- --------------------------------------------------------------------------
alter table public.knowledge_chunks enable row level security;
grant select on public.knowledge_chunks to authenticated;
grant insert, update, delete on public.knowledge_chunks to authenticated;

drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select on public.knowledge_chunks
  for select to authenticated
  using (
    deleted_at is null
    and (
      organization_id is null
      or organization_id in (select public.user_org_ids())
      or public.has_role('SUPER_ADMIN')
    )
    and (
      sensitivity = 'INTERNAL'
      or (sensitivity = 'CONFIDENTIAL' and public.has_permission('capability.read'))
      or public.has_role('SUPER_ADMIN')
    )
  );

-- Ingestion is restricted, as for documents: write access to a corpus the
-- assistant retrieves from is a prompt-injection path into every agent.
drop policy if exists knowledge_chunks_write on public.knowledge_chunks;
create policy knowledge_chunks_write on public.knowledge_chunks
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.integrations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.integrations'));

-- AI identities may never write to the corpus they read from.
drop policy if exists ai_no_insert_knowledge_chunks on public.knowledge_chunks;
create policy ai_no_insert_knowledge_chunks on public.knowledge_chunks
  as restrictive for insert to authenticated
  with check (not public.is_ai_service());
drop policy if exists ai_no_update_knowledge_chunks on public.knowledge_chunks;
create policy ai_no_update_knowledge_chunks on public.knowledge_chunks
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());
drop policy if exists ai_no_delete_knowledge_chunks on public.knowledge_chunks;
create policy ai_no_delete_knowledge_chunks on public.knowledge_chunks
  as restrictive for delete to authenticated
  using (not public.is_ai_service());

-- --------------------------------------------------------------------------
-- Authorized vector search.
--
-- SECURITY INVOKER: RLS applies during the scan. See the header.
-- STABLE, so the planner may still use the vector index.
-- --------------------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 8,
  min_similarity double precision default 0.0,
  filter_organization_id uuid default null,
  filter_source_type text default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  source_type text,
  source_uri text,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.document_id,
    d.title,
    d.source_type,
    d.source_uri,
    c.chunk_index,
    c.content,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
    and c.deleted_at is null
    and (filter_organization_id is null or c.organization_id = filter_organization_id)
    and (filter_source_type is null or d.source_type = filter_source_type)
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

comment on function public.match_knowledge_chunks is
  'Authorized vector search. SECURITY INVOKER so RLS filters during the index scan: an unauthorized chunk is never a candidate and never occupies a top-k slot. Never change this to SECURITY DEFINER.';

revoke all on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid, text) from public, anon;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid, text) to authenticated;

-- --------------------------------------------------------------------------
-- Indexes
--
-- Policy-path columns first: these predicates run inside the scan, so leaving
-- them unindexed is what makes authorized vector search slow enough that
-- somebody "fixes" it by switching to SECURITY DEFINER.
-- --------------------------------------------------------------------------
create index if not exists knowledge_chunks_document_id_idx
  on public.knowledge_chunks (document_id) where deleted_at is null;
create index if not exists knowledge_chunks_organization_id_idx
  on public.knowledge_chunks (organization_id) where deleted_at is null;
create index if not exists knowledge_chunks_sensitivity_idx
  on public.knowledge_chunks (sensitivity) where deleted_at is null;

-- NOTE: no HNSW or IVFFlat index is created here.
--
-- Both require tuning against real data volume and a chosen embedding model,
-- and IVFFlat built on an empty table produces a useless index with poor
-- recall that looks like it is working. Create it during ingestion, once the
-- model is selected and the corpus has volume:
--
--   create index knowledge_chunks_embedding_hnsw
--     on public.knowledge_chunks
--     using hnsw (embedding extensions.vector_cosine_ops);
--
-- Until then the search is an exact scan: correct, and honest about being
-- slow, rather than fast and subtly wrong.
