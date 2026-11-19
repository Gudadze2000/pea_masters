"""Evaluations: the periods an organization's Admins set up, and the forms researchers fill in.

    Period (Admins)   e.g. "Annual evaluation 2025-2026": start, deadline, which publication years count
    Form              parts → items → points and limits. The ISU self-assessment is built in
                      (app/evaluation_forms/isu_self_assessment.json); coordinators make their own (often a copy of
                      it), which they and the organization's Admins can see and change.

Coordinators send a form to their researchers for a period, researchers fill it in and submit it, and coordinators
review it (next steps). Deadlines are whole days, Tbilisi time: a period is open from the start of `starts_on` to the
end of `ends_on`."""

import json
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import EvaluationForm, EvaluationPeriod, User

router = APIRouter(prefix="/api/v1/orgs/{org_id}", tags=["evaluations"])

TBILISI = ZoneInfo("Asia/Tbilisi")


def today() -> date:
    return datetime.now(TBILISI).date()


# --- form structure: the same shape for the built-in form and coordinators' own forms --------------

class Localized(BaseModel):
    en: str = Field(min_length=1, max_length=300)
    ka: str = Field("", max_length=300)


class FormItem(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$")
    code: str = Field("", max_length=10)  # "2.1" on the ISU form
    name: Localized
    points: float = Field(ge=0, le=1000)  # per entry
    max_points: float | None = Field(None, ge=0, le=10000)  # most this item can add
    max_entries: int | None = Field(None, ge=1, le=100)
    variable_points: str | None = Field(None, max_length=1000)  # set when each entry states its own points: the rule
    hint: str = Field("", max_length=1000)  # what to write in the entry
    icon: str = Field("imgIconFile1", max_length=40)


class FormPart(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$")
    numeral: str = Field("", max_length=10)
    name: Localized
    rule: str = Field("", max_length=200)
    min: float | None = Field(None, ge=0)  # points needed in this part
    cap: float | None = Field(None, ge=0)  # points above this don't count
    items: list[FormItem] = Field(min_length=1, max_length=200)


class FormStructure(BaseModel):
    version: Literal[1] = 1
    total_minimum: float | None = Field(None, ge=0)
    parts: list[FormPart] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def _unique_ids(self) -> "FormStructure":
        parts = [part.id for part in self.parts]
        items = [item.id for part in self.parts for item in part.items]
        if len(set(parts)) != len(parts) or len(set(items)) != len(items):
            raise ValueError("Each part and each item needs its own id")
        return self


class BuiltInForm(FormStructure):
    key: str
    name: Localized
    description: str


def _load_built_in() -> dict[str, BuiltInForm]:
    folder = Path(__file__).parent / "evaluation_forms"
    forms = [BuiltInForm.model_validate(json.loads(path.read_text(encoding="utf-8")))
             for path in sorted(folder.glob("*.json"))]
    return {form.key: form for form in forms}


BUILT_IN_FORMS = _load_built_in()


class Owner(BaseModel):
    id: uuid.UUID
    name: str


class FormSummary(BaseModel):
    id: str  # the key of a built-in form, or a custom form's uuid
    built_in: bool
    name: Localized
    description: str
    parts: int
    items: int
    owner: Owner | None = None  # who made it (custom forms)
    updated_at: datetime | None = None
    can_edit: bool = False  # built-in forms never; custom ones by their owner and the organization's Admins


class FormOut(FormSummary):
    structure: FormStructure


class FormIn(BaseModel):
    name: Localized
    description: str = Field("", max_length=2000)
    structure: FormStructure


def summary_of(form_id: str, built_in: bool, name: Localized, description: str,
               structure: FormStructure, **extra) -> FormSummary:
    return FormSummary(id=form_id, built_in=built_in, name=name, description=description, parts=len(structure.parts),
                       items=sum(len(part.items) for part in structure.parts), **extra)


def built_in_structure(form: BuiltInForm) -> FormStructure:
    return FormStructure.model_validate(form.model_dump(include={"version", "total_minimum", "parts"}))


def sees_every_form(role: str) -> bool:
    """Admins (and Root) see and change every form in the organization; coordinators only their own."""
    return role in ("root", "admin")


def custom_summary(form: EvaluationForm, owner: User, role: str, actor: Actor) -> FormSummary:
    structure = FormStructure.model_validate(form.structure)
    return summary_of(str(form.id), False, Localized(en=form.name, ka=form.name_ka), form.description, structure,
                      owner=Owner(id=owner.id, name=owner.display_name), updated_at=form.updated_at,
                      can_edit=sees_every_form(role) or form.owner_user_id == actor.user.id)


def find_form(db: Session, org_id: uuid.UUID, form_id: str, actor: Actor, role: str) -> EvaluationForm:
    """A custom form this person may see. Someone else's form is "not found" rather than "forbidden", so its
    existence isn't revealed."""
    try:
        key = uuid.UUID(form_id)
    except ValueError:
        key = None
    form = db.get(EvaluationForm, key) if key else None
    if (form is None or form.organization_id != org_id or form.archived_at is not None
            or not (sees_every_form(role) or form.owner_user_id == actor.user.id)):
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Form not found.")
    return form


def refuse_built_in(form_id: str) -> None:
    if form_id in BUILT_IN_FORMS:
        raise problem(status.HTTP_409_CONFLICT, "built_in_form",
                      "The built-in form can't be changed. Make a copy of it and change the copy.")


def unique_form_name(db: Session, org_id: uuid.UUID, owner_id: uuid.UUID, name: str,
                     except_id: uuid.UUID | None = None) -> str:
    """Two of one person's forms can't share a name, so they can tell them apart when sending one."""
    name = " ".join(name.split())
    clash = db.scalar(select(EvaluationForm.id).where(
        EvaluationForm.organization_id == org_id, EvaluationForm.owner_user_id == owner_id,
        EvaluationForm.archived_at.is_(None), func.lower(EvaluationForm.name) == name.lower(),
        EvaluationForm.id != except_id))
    if clash:
        raise problem(status.HTTP_409_CONFLICT, "form_exists", f"You already have a form called “{name}”.")
    return name


def form_snapshot(form: EvaluationForm) -> dict:
    """What the audit log keeps about a form: enough to recognise it, not its whole structure."""
    parts = form.structure.get("parts", [])
    return {"name": form.name, "name_ka": form.name_ka, "parts": len(parts),
            "items": sum(len(part.get("items", [])) for part in parts)}


@router.get("/evaluation-forms", response_model=list[FormSummary])
def list_forms(org_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """The forms a coordinator can send: the built-in ones, then their own (Admins: everyone's), newest first."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.VIEW_EVALUATION_FORMS, org_id)
    built_in = [summary_of(key, True, form.name, form.description, form) for key, form in BUILT_IN_FORMS.items()]
    query = (select(EvaluationForm, User).join(User, User.id == EvaluationForm.owner_user_id)
             .where(EvaluationForm.organization_id == org_id, EvaluationForm.archived_at.is_(None))
             .order_by(EvaluationForm.updated_at.desc()))
    if not sees_every_form(role):
        query = query.where(EvaluationForm.owner_user_id == actor.user.id)
    return built_in + [custom_summary(form, owner, role, actor) for form, owner in db.execute(query).all()]


@router.get("/evaluation-forms/{form_id}", response_model=FormOut)
def get_form(org_id: uuid.UUID, form_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.VIEW_EVALUATION_FORMS, org_id)
    built_in = BUILT_IN_FORMS.get(form_id)
    if built_in is not None:
        structure = built_in_structure(built_in)
        summary = summary_of(form_id, True, built_in.name, built_in.description, structure)
    else:
        form = find_form(db, org_id, form_id, actor, role)
        structure = FormStructure.model_validate(form.structure)
        summary = custom_summary(form, db.get(User, form.owner_user_id), role, actor)
    return FormOut(**summary.model_dump(), structure=structure)


@router.post("/evaluation-forms", response_model=FormOut, status_code=status.HTTP_201_CREATED)
def create_form(org_id: uuid.UUID, body: FormIn, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """A new form, made from scratch or as a copy of another (the app sends the copy's structure)."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_FORMS, org_id)
    form = EvaluationForm(organization_id=org_id, owner_user_id=actor.user.id,
                          name=unique_form_name(db, org_id, actor.user.id, body.name.en), name_ka=body.name.ka.strip(),
                          description=body.description.strip(), structure=body.structure.model_dump(mode="json"))
    db.add(form)
    db.flush()
    audit.record(db, "evaluation_form.created", entity_type="evaluation_form", entity_id=form.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, after=form_snapshot(form),
                 ip=actor.ip)
    db.commit()
    db.refresh(form)
    return FormOut(**custom_summary(form, actor.user, role, actor).model_dump(), structure=body.structure)


@router.put("/evaluation-forms/{form_id}", response_model=FormOut)
def update_form(org_id: uuid.UUID, form_id: str, body: FormIn, actor: Actor = Depends(get_actor),
                db: Session = Depends(get_db)):
    """Changes a form. Forms already sent to researchers keep the version they were sent with."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_FORMS, org_id)
    refuse_built_in(form_id)
    form = find_form(db, org_id, form_id, actor, role)
    before = form_snapshot(form)
    form.name = unique_form_name(db, org_id, form.owner_user_id, body.name.en, except_id=form.id)
    form.name_ka = body.name.ka.strip()
    form.description = body.description.strip()
    form.structure = body.structure.model_dump(mode="json")
    form.updated_at = func.now()
    audit.record(db, "evaluation_form.updated", entity_type="evaluation_form", entity_id=form.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, before=before,
                 after=form_snapshot(form), ip=actor.ip)
    db.commit()
    db.refresh(form)
    owner = db.get(User, form.owner_user_id)
    return FormOut(**custom_summary(form, owner, role, actor).model_dump(), structure=body.structure)


@router.delete("/evaluation-forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_form(org_id: uuid.UUID, form_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Removes a form from the list; it's kept (archived), so evaluations sent with it are unaffected."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_FORMS, org_id)
    refuse_built_in(form_id)
    form = find_form(db, org_id, form_id, actor, role)
    form.archived_at = func.now()
    audit.record(db, "evaluation_form.archived", entity_type="evaluation_form", entity_id=form.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, before=form_snapshot(form),
                 ip=actor.ip)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- periods ---------------------------------------------------------------------------------------

PeriodStatus = Literal["upcoming", "open", "closed"]


class PeriodIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date  # the deadline (inclusive)
    publication_from: int = Field(ge=1950, le=2100)
    publication_to: int = Field(ge=1950, le=2100)

    @model_validator(mode="after")
    def _order(self) -> "PeriodIn":
        if self.ends_on < self.starts_on:
            raise ValueError("The deadline can't be before the start")
        if self.publication_to < self.publication_from:
            raise ValueError("The last publication year can't be before the first")
        return self


class PeriodOut(BaseModel):
    id: uuid.UUID
    name: str
    starts_on: date
    ends_on: date
    publication_from: int
    publication_to: int
    status: PeriodStatus


def status_of(period: EvaluationPeriod, on: date) -> PeriodStatus:
    return "upcoming" if on < period.starts_on else "closed" if on > period.ends_on else "open"


def to_out(period: EvaluationPeriod) -> PeriodOut:
    return PeriodOut(id=period.id, name=period.name, starts_on=period.starts_on, ends_on=period.ends_on,
                     publication_from=period.publication_from, publication_to=period.publication_to,
                     status=status_of(period, today()))


def find_period(db: Session, org_id: uuid.UUID, period_id: uuid.UUID) -> EvaluationPeriod:
    period = db.get(EvaluationPeriod, period_id)
    if period is None or period.organization_id != org_id or period.archived_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Evaluation period not found.")
    return period


def unique_name(db: Session, org_id: uuid.UUID, name: str, except_id: uuid.UUID | None = None) -> str:
    name = " ".join(name.split())
    clash = db.scalar(select(EvaluationPeriod.id).where(
        EvaluationPeriod.organization_id == org_id, EvaluationPeriod.archived_at.is_(None),
        func.lower(EvaluationPeriod.name) == name.lower(), EvaluationPeriod.id != except_id))
    if clash:
        raise problem(status.HTTP_409_CONFLICT, "period_exists", f"There's already a period called “{name}”.")
    return name


def snapshot(period: EvaluationPeriod) -> dict:
    return {"name": period.name, "starts_on": period.starts_on.isoformat(), "ends_on": period.ends_on.isoformat(),
            "publication_from": period.publication_from, "publication_to": period.publication_to}


@router.get("/evaluation-periods", response_model=list[PeriodOut])
def list_periods(org_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Everyone in the organization sees the periods, newest first."""
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_EVALUATION_PERIODS, org_id)
    periods = db.scalars(select(EvaluationPeriod).where(
        EvaluationPeriod.organization_id == org_id, EvaluationPeriod.archived_at.is_(None))
        .order_by(EvaluationPeriod.starts_on.desc(), EvaluationPeriod.created_at.desc())).all()
    return [to_out(period) for period in periods]


@router.post("/evaluation-periods", response_model=PeriodOut, status_code=status.HTTP_201_CREATED)
def create_period(org_id: uuid.UUID, body: PeriodIn, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_PERIODS, org_id)
    period = EvaluationPeriod(organization_id=org_id, name=unique_name(db, org_id, body.name),
                              starts_on=body.starts_on, ends_on=body.ends_on, publication_from=body.publication_from,
                              publication_to=body.publication_to, created_by=actor.user.id)
    db.add(period)
    db.flush()
    audit.record(db, "evaluation_period.created", entity_type="evaluation_period", entity_id=period.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, after=snapshot(period),
                 ip=actor.ip)
    db.commit()
    return to_out(period)


@router.put("/evaluation-periods/{period_id}", response_model=PeriodOut)
def update_period(org_id: uuid.UUID, period_id: uuid.UUID, body: PeriodIn, actor: Actor = Depends(get_actor),
                  db: Session = Depends(get_db)):
    """Renames a period or changes its dates, e.g. extends the deadline for everyone."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_PERIODS, org_id)
    period = find_period(db, org_id, period_id)
    before = snapshot(period)
    period.name = unique_name(db, org_id, body.name, except_id=period.id)
    period.starts_on, period.ends_on = body.starts_on, body.ends_on
    period.publication_from, period.publication_to = body.publication_from, body.publication_to
    period.updated_at = func.now()
    audit.record(db, "evaluation_period.updated", entity_type="evaluation_period", entity_id=period.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, before=before,
                 after=snapshot(period), ip=actor.ip)
    db.commit()
    db.refresh(period)
    return to_out(period)


@router.delete("/evaluation-periods/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_period(org_id: uuid.UUID, period_id: uuid.UUID, actor: Actor = Depends(get_actor),
                   db: Session = Depends(get_db)):
    """Removes a period from the list; it's kept in the database (archived), so nothing that refers to it breaks."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_EVALUATION_PERIODS, org_id)
    period = find_period(db, org_id, period_id)
    period.archived_at = func.now()
    audit.record(db, "evaluation_period.archived", entity_type="evaluation_period", entity_id=period.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, before=snapshot(period),
                 ip=actor.ip)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
