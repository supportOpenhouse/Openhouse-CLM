-- ============================================================================
-- OPENHOUSE CLM — initial database schema
-- Run this in Supabase SQL editor, or via `supabase db push` if using CLI.
-- ============================================================================

-- ---------- USERS (profile mirror of auth.users with role + display_name) ----
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  first_login timestamptz not null default now(),
  last_login timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

-- ---------- AGREEMENTS ------------------------------------------------------
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Agreement',
  template_id text not null default 'standard_with_loan',
  form jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected')),
  creator uuid references public.users(id),
  creator_email text,
  updated_by uuid references public.users(id),
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agreements_updated_idx on public.agreements (updated_at desc);
create index if not exists agreements_status_idx on public.agreements (status);

-- ---------- VERSIONS --------------------------------------------------------
create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  name text not null,
  form jsonb not null,
  template_id text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'rejected')),
  created_by uuid references public.users(id),
  created_by_email text,
  submitted_by_email text,
  submitted_at timestamptz,
  approved_by_email text,
  approved_at timestamptz,
  rejected_by_email text,
  rejected_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists versions_agreement_idx on public.versions (agreement_id, created_at desc);
create index if not exists versions_pending_idx on public.versions (status) where status = 'pending_review';

-- ---------- AUDIT LOG -------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  user_id uuid references public.users(id),
  user_email text not null,
  action text not null,
  details text,
  version_id uuid references public.versions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists audit_agreement_idx on public.audit_log (agreement_id, created_at desc);

-- ---------- PRESENCE (lightweight, ephemeral) -------------------------------
create table if not exists public.presence (
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  user_email text not null,
  last_seen timestamptz not null default now(),
  primary key (agreement_id, user_email)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Only authenticated users with @openhouse.in emails can do anything.
-- Admins can manage roles.
-- ============================================================================

alter table public.users enable row level security;
alter table public.agreements enable row level security;
alter table public.versions enable row level security;
alter table public.audit_log enable row level security;
alter table public.presence enable row level security;

-- Helper: check whether current user is @openhouse.in
create or replace function public.is_openhouse_user()
returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') ilike '%@openhouse.in',
    false
  );
$$;

-- Helper: check whether current user is an admin
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- USERS policies ----
drop policy if exists "users_select_all_openhouse" on public.users;
create policy "users_select_all_openhouse" on public.users
  for select using (public.is_openhouse_user());

drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self" on public.users
  for insert with check (auth.uid() = id and public.is_openhouse_user());

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin" on public.users
  for update using (
    public.is_openhouse_user() and (auth.uid() = id or public.is_admin())
  );

-- ---- AGREEMENTS policies: everyone @openhouse.in can CRUD ----
drop policy if exists "agreements_all_openhouse" on public.agreements;
create policy "agreements_all_openhouse" on public.agreements
  for all using (public.is_openhouse_user())
  with check (public.is_openhouse_user());

-- ---- VERSIONS: same ----
drop policy if exists "versions_all_openhouse" on public.versions;
create policy "versions_all_openhouse" on public.versions
  for all using (public.is_openhouse_user())
  with check (public.is_openhouse_user());

-- ---- AUDIT LOG: insert + read allowed to @openhouse.in; no updates/deletes ----
drop policy if exists "audit_select_openhouse" on public.audit_log;
create policy "audit_select_openhouse" on public.audit_log
  for select using (public.is_openhouse_user());

drop policy if exists "audit_insert_openhouse" on public.audit_log;
create policy "audit_insert_openhouse" on public.audit_log
  for insert with check (public.is_openhouse_user());

-- ---- PRESENCE: full access for @openhouse.in ----
drop policy if exists "presence_all_openhouse" on public.presence;
create policy "presence_all_openhouse" on public.presence
  for all using (public.is_openhouse_user())
  with check (public.is_openhouse_user());

-- ============================================================================
-- AUTOMATIC PROFILE CREATION + DOMAIN GATE
-- When a user signs in via Google SSO, create their profile row.
-- First person to sign in becomes admin; everyone else becomes editor.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  derived_name text;
begin
  -- Domain gate (belt-and-suspenders; Google SSO hd claim should catch this first)
  if new.email is null or new.email not ilike '%@openhouse.in' then
    raise exception 'Only @openhouse.in email addresses are permitted.';
  end if;

  select count(*) into admin_count from public.users where role = 'admin';
  derived_name := initcap(replace(split_part(new.email, '@', 1), '.', ' '));

  insert into public.users (id, email, display_name, role, first_login, last_login)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', derived_name),
    case when admin_count = 0 then 'admin' else 'editor' end,
    now(),
    now()
  )
  on conflict (id) do update
    set last_login = now(),
        email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also refresh last_login on subsequent sign-ins
create or replace function public.handle_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set last_login = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of last_sign_in_at on auth.users
  for each row when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function public.handle_user_login();

-- ============================================================================
-- updated_at auto-touch for agreements
-- ============================================================================
create or replace function public.touch_agreement_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agreements_touch on public.agreements;
create trigger agreements_touch
  before update on public.agreements
  for each row execute function public.touch_agreement_updated_at();
