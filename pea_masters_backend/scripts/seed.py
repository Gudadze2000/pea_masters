"""Creates an organization and its verified email domain, and registers a person who can sign in.
Safe to run again: existing rows are reused.

    uv run python -m scripts.seed --email name.surname@iliauni.edu.ge --name "Name Surname"               # Admin
    uv run python -m scripts.seed --email classmate@iliauni.edu.ge --name "Name Surname" --role member
    uv run python -m scripts.seed --email dev.name@iliauni.edu.ge --name "Dev Name" --root          # developer
    uv run python -m scripts.seed --self-signup      # anyone in the domain may sign in (development only)

Roles: root = the application's developers (every organization); admin = the organization's responsible person;
coordinator = head of a department; member = Researcher. Coordinators are best set up in the app, where you choose
their department.
"""

import argparse

from sqlalchemy import func, select

from app import audit
from app.db import SessionLocal
from app.models import Organization, OrganizationDomain, OrganizationMembership, RoleAssignment, User
from app.names import name_from_email


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--org-slug", default="iliauni")
    parser.add_argument("--org-name-ka", default="ილიას სახელმწიფო უნივერსიტეტი")
    parser.add_argument("--org-name-en", default="Ilia State University")
    parser.add_argument("--domain", default="iliauni.edu.ge")
    parser.add_argument("--email", "--admin-email", dest="email", help="Google Workspace email to register")
    parser.add_argument("--name", "--admin-name", dest="name",
                        help="Display name (default: guessed from name.surname.N@; "
                             "replaced by the Google name at sign-in)")
    parser.add_argument("--role", choices=["admin", "coordinator", "member"], default="admin",
                        help="Role in the organization (default: admin). Everyone also gets member (Researcher).")
    parser.add_argument("--root", action="store_true",
                        help="Also make this person Root: a developer with access to every organization")
    parser.add_argument("--self-signup", action=argparse.BooleanOptionalAction, default=None,
                        help="Let anyone in the domain sign in and become a Member")
    args = parser.parse_args()

    with SessionLocal() as db:
        org = db.scalar(select(Organization).where(Organization.slug == args.org_slug))
        if org is None:
            org = Organization(slug=args.org_slug, name={"ka": args.org_name_ka, "en": args.org_name_en},
                               kind="university")
            db.add(org)
            db.flush()
            audit.record(db, "organization.created", entity_type="organization", entity_id=org.id,
                         actor_kind="system", organization_id=org.id, after={"slug": org.slug})
            print(f"created organization {org.slug}")

        domain = db.scalar(select(OrganizationDomain).where(
            func.lower(OrganizationDomain.domain) == args.domain.lower()))
        if domain is None:
            domain = OrganizationDomain(organization_id=org.id, domain=args.domain.lower(), verified_at=func.now())
            db.add(domain)
            print(f"added verified domain {args.domain}")
        elif domain.organization_id != org.id:
            raise SystemExit(f"{args.domain} already belongs to another organization")
        if args.self_signup is not None:
            domain.allow_self_signup = args.self_signup
            print(f"self-signup {'on' if args.self_signup else 'off'} for {args.domain}")

        if args.email:
            email = args.email.strip().lower()
            if not email.endswith("@" + domain.domain.lower()):
                raise SystemExit(f"{email} is not in the {domain.domain} domain")
            user = db.scalar(select(User).where(func.lower(User.email) == email, User.deleted_at.is_(None)))
            if user is None:
                name = args.name or name_from_email(email) or email.split("@")[0]
                user = User(email=email, display_name=name, status="invited")
                db.add(user)
                db.flush()
                print(f"registered {email}")
            membership = db.scalar(select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id, OrganizationMembership.organization_id == org.id))
            if membership is None:
                db.add(OrganizationMembership(user_id=user.id, organization_id=org.id))
            for role in dict.fromkeys((args.role, "member")):
                if db.scalar(select(RoleAssignment).where(
                        RoleAssignment.user_id == user.id, RoleAssignment.organization_id == org.id,
                        RoleAssignment.role == role, RoleAssignment.revoked_at.is_(None))) is None:
                    db.add(RoleAssignment(user_id=user.id, organization_id=org.id, role=role))
                    audit.record(db, "role.granted", entity_type="user", entity_id=user.id, actor_kind="system",
                                 organization_id=org.id, after={"role": role})
                    print(f"granted {role} to {email}")
            if args.root and db.scalar(select(RoleAssignment).where(
                    RoleAssignment.user_id == user.id, RoleAssignment.organization_id.is_(None),
                    RoleAssignment.role == "root", RoleAssignment.revoked_at.is_(None))) is None:
                db.add(RoleAssignment(user_id=user.id, organization_id=None, role="root"))
                audit.record(db, "role.granted", entity_type="user", entity_id=user.id, actor_kind="system",
                             after={"role": "root"})
                print(f"granted root to {email}")
        elif args.root:
            raise SystemExit("--root needs --email")

        db.commit()
    print("done")


if __name__ == "__main__":
    main()
