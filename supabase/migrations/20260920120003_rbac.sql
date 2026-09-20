-- 20260920120003_rbac.sql
-- RBAC catalog (TANIA_PRD_v2.0.md §11.4-§11.5, TANIA_SUPABASE_RLS.sql §1).
--
-- `permissions` and `role_permissions` are specified only in
-- TANIA_SUPABASE_RLS.sql, not in PRD §11. They are created here so the schema
-- lives in one place (recorded in TANIA_IMPLEMENTATION_BASELINE.md §5.3).

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code = upper(code)),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text,
  created_at timestamptz not null default now()
);

comment on column public.permissions.code is
  'Dotted permission, e.g. talent.read (CLAUDE.md §9). Read and write are always separate.';

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- --------------------------------------------------------------------------
-- organization_memberships
--
-- SECURITY-CRITICAL. This table is the authorization root: has_role(),
-- has_permission() and user_org_ids() all resolve through it. A user who can
-- insert here can grant themselves SUPER_ADMIN.
--
-- TANIA_SUPABASE_RLS.sql ships it with NO row level security at all while
-- granting INSERT on every public table to `authenticated`, which is a full
-- privilege-escalation path (TANIA_IMPLEMENTATION_BASELINE.md §7.1). RLS and
-- write restrictions are applied in 20260920120006_rls_core.sql.
-- --------------------------------------------------------------------------
create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_primary boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id, role_id)
);

comment on table public.organization_memberships is
  'Authorization root: binds a person to a role within an organization. Writes are restricted to SUPER_ADMIN / admin.users.';
comment on column public.organization_memberships.granted_by is
  'Who granted this membership. Provenance for privilege changes (AGENTS.md §10).';

-- At most one primary membership per user.
create unique index if not exists organization_memberships_one_primary
  on public.organization_memberships (user_id)
  where is_primary;

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();
