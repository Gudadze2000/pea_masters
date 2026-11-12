drop table if exists audit_log, role_assignments, organization_memberships, sessions, password_credentials,
  auth_identities, identity_providers, organization_domains, organizations, users cascade;
drop function if exists forbid_change();
drop type if exists actor_kind, auth_provider, membership_status, org_status, account_status, role_kind;
