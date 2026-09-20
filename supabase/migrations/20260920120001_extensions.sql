-- 20260920120001_extensions.sql
-- Phase 2 — Supabase foundation.
--
-- pgcrypto supplies gen_random_uuid() for uuid primary keys.
-- pgvector is NOT enabled here: it is only needed by the RAG corpus in
-- Phase 14, and enabling extensions before they are used widens the surface
-- for no benefit.

create extension if not exists pgcrypto with schema extensions;

-- Shared updated_at trigger function.
-- SECURITY INVOKER: it touches only the row being written and must not run
-- with elevated rights.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function: stamps updated_at on UPDATE.';
