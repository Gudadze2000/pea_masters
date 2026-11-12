-- Organization structure: unit types, units (departments), positions, people's affiliations to units,
-- and which units/members each Coordinator handles. Copied from the full PEA schema (PostgreSQL 16).

create type assignment_target as enum ('member', 'unit');

create table unit_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  parent_id uuid,
  unit_type_id uuid not null,
  name jsonb not null,
  code text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text,
  constraint organization_units_check_1 check (parent_id <> id)
);
create table positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name jsonb not null,
  category text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table affiliations (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null,
  unit_id uuid not null,
  position_id uuid,
  is_primary boolean not null default false,
  starts_on date not null,
  ends_on date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliations_check_1 check (ends_on is null or ends_on >= starts_on)
);
create table coordinator_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  coordinator_user_id uuid not null,
  target assignment_target not null,
  member_user_id uuid,
  unit_id uuid,
  include_subunits boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  assigned_by uuid not null,
  created_at timestamptz not null default now(),
  constraint coordinator_assignments_check_1 check ((target = 'member' and member_user_id is not null and unit_id is null) or (target = 'unit' and unit_id is not null and member_user_id is null)),
  constraint coordinator_assignments_check_2 check (ends_on is null or ends_on >= starts_on)
);

alter table unit_types add constraint unit_types_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table organization_units add constraint organization_units_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table organization_units add constraint organization_units_parent_id_fkey foreign key (parent_id) references organization_units (id) on delete restrict;
alter table organization_units add constraint organization_units_unit_type_id_fkey foreign key (unit_type_id) references unit_types (id) on delete restrict;
alter table organization_units add constraint organization_units_deleted_by_fkey foreign key (deleted_by) references users (id) on delete restrict;
alter table positions add constraint positions_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table affiliations add constraint affiliations_membership_id_fkey foreign key (membership_id) references organization_memberships (id) on delete restrict;
alter table affiliations add constraint affiliations_unit_id_fkey foreign key (unit_id) references organization_units (id) on delete restrict;
alter table affiliations add constraint affiliations_position_id_fkey foreign key (position_id) references positions (id) on delete restrict;
alter table affiliations add constraint affiliations_created_by_fkey foreign key (created_by) references users (id) on delete restrict;
alter table coordinator_assignments add constraint coordinator_assignments_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table coordinator_assignments add constraint coordinator_assignments_coordinator_user_id_fkey foreign key (coordinator_user_id) references users (id) on delete restrict;
alter table coordinator_assignments add constraint coordinator_assignments_member_user_id_fkey foreign key (member_user_id) references users (id) on delete restrict;
alter table coordinator_assignments add constraint coordinator_assignments_unit_id_fkey foreign key (unit_id) references organization_units (id) on delete restrict;
alter table coordinator_assignments add constraint coordinator_assignments_assigned_by_fkey foreign key (assigned_by) references users (id) on delete restrict;

create index unit_types_organization_id_idx on unit_types (organization_id);
create index organization_units_parent_id_idx on organization_units (parent_id);
create index organization_units_unit_type_id_idx on organization_units (unit_type_id);
create index organization_units_deleted_by_idx on organization_units (deleted_by);
create unique index organization_units_organization_id_code_key on organization_units (organization_id, code) where code is not null and deleted_at is null;
create index positions_organization_id_idx on positions (organization_id);
create index affiliations_membership_id_idx on affiliations (membership_id);
create index affiliations_unit_id_idx on affiliations (unit_id);
create index affiliations_position_id_idx on affiliations (position_id);
create index affiliations_created_by_idx on affiliations (created_by);
create index coordinator_assignments_organization_id_idx on coordinator_assignments (organization_id);
create index coordinator_assignments_coordinator_user_id_idx on coordinator_assignments (coordinator_user_id);
create index coordinator_assignments_member_user_id_idx on coordinator_assignments (member_user_id);
create index coordinator_assignments_unit_id_idx on coordinator_assignments (unit_id);
create index coordinator_assignments_assigned_by_idx on coordinator_assignments (assigned_by);

-- PEA rules on top of the base schema. A row is current while ends_on is null; ending it sets ends_on, keeping history.
-- One current Coordinator per department:
create unique index coordinator_assignments_one_per_unit on coordinator_assignments (unit_id)
  where target = 'unit' and ends_on is null;
-- One current home department per person in an organization:
create unique index affiliations_one_primary on affiliations (membership_id)
  where is_primary and ends_on is null;
