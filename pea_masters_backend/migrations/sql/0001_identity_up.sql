-- Identity & access tables, copied from the full PEA schema (PostgreSQL 16).
-- Foreign keys are ON DELETE RESTRICT: deletions go through deletion requests, never cascades (P-10).

create type role_kind as enum ('root', 'admin', 'coordinator', 'member');
create type account_status as enum ('invited', 'active', 'deactivated');
create type org_status as enum ('active', 'deactivated');
create type membership_status as enum ('active', 'inactive');
create type auth_provider as enum ('password', 'google', 'microsoft', 'oidc', 'orcid');
create type actor_kind as enum ('user', 'system', 'ai_agent');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  kind text not null,
  status org_status not null default 'active',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text
);
create table organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  domain text not null,
  verified_at timestamptz,
  verified_by uuid,
  allow_self_signup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  given_name text,
  family_name text,
  preferred_locale text not null default 'ka',
  status account_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text
);
create table identity_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  kind auth_provider not null,
  display_name text not null,
  issuer text,
  client_id text,
  client_secret_ref text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider auth_provider not null,
  provider_subject text not null,
  identity_provider_id uuid,
  email text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create table password_credentials (
  user_id uuid primary key,
  password_hash text not null,
  algorithm text not null default 'argon2id',
  changed_at timestamptz not null default now()
);
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip inet,
  user_agent text
);
create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null,
  status membership_status not null default 'active',
  employee_number text,
  joined_on date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  role role_kind not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  constraint role_assignments_check_1 check ((role = 'root') = (organization_id is null))
);
create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_kind actor_kind not null,
  actor_user_id uuid,
  agent_run_id uuid,
  acting_role role_kind,
  organization_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  request_id uuid,
  ip inet,
  prev_hash text,
  row_hash text not null
);

alter table organizations add constraint organizations_deleted_by_fkey foreign key (deleted_by) references users (id) on delete restrict;
alter table organization_domains add constraint organization_domains_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table organization_domains add constraint organization_domains_verified_by_fkey foreign key (verified_by) references users (id) on delete restrict;
alter table users add constraint users_deleted_by_fkey foreign key (deleted_by) references users (id) on delete restrict;
alter table identity_providers add constraint identity_providers_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table auth_identities add constraint auth_identities_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table auth_identities add constraint auth_identities_identity_provider_id_fkey foreign key (identity_provider_id) references identity_providers (id) on delete restrict;
alter table password_credentials add constraint password_credentials_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table sessions add constraint sessions_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table organization_memberships add constraint organization_memberships_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table organization_memberships add constraint organization_memberships_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table role_assignments add constraint role_assignments_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table role_assignments add constraint role_assignments_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table role_assignments add constraint role_assignments_granted_by_fkey foreign key (granted_by) references users (id) on delete restrict;
alter table role_assignments add constraint role_assignments_revoked_by_fkey foreign key (revoked_by) references users (id) on delete restrict;

create index organizations_deleted_by_idx on organizations (deleted_by);
create index organization_domains_organization_id_idx on organization_domains (organization_id);
create index organization_domains_verified_by_idx on organization_domains (verified_by);
create unique index organization_domains_lower_domain_key on organization_domains (lower(domain));
create index users_deleted_by_idx on users (deleted_by);
create unique index users_lower_email_key on users (lower(email)) where deleted_at is null;
create index identity_providers_organization_id_idx on identity_providers (organization_id);
create index auth_identities_user_id_idx on auth_identities (user_id);
create index auth_identities_identity_provider_id_idx on auth_identities (identity_provider_id);
create unique index auth_identities_provider_provider_subject_key on auth_identities (provider, provider_subject);
create index sessions_user_id_idx on sessions (user_id);
create index organization_memberships_organization_id_idx on organization_memberships (organization_id);
create unique index organization_memberships_user_id_organization_id_key on organization_memberships (user_id, organization_id);
create index role_assignments_organization_id_idx on role_assignments (organization_id);
create index role_assignments_granted_by_idx on role_assignments (granted_by);
create index role_assignments_revoked_by_idx on role_assignments (revoked_by);
create unique index role_assignments_user_id_organization_id_role_key on role_assignments (user_id, organization_id, role) nulls not distinct where revoked_at is null;
create index audit_log_organization_id_occurred_at_idx on audit_log (organization_id, occurred_at desc);
create index audit_log_entity_type_entity_id_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_user_id_occurred_at_idx on audit_log (actor_user_id, occurred_at desc);

-- The audit log can only grow
create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger audit_log_append_only before update or delete on audit_log for each row execute function forbid_change();
