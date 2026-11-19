"""Evaluations sent to researchers.

Coordinators (and Admins) send a form to their researchers for a period. Each researcher gets one evaluation per
period, holding a copy of the form as it was then, so changing the form later doesn't affect it. Until the researcher
adds their first entry, the coordinator can send a different form instead or withdraw it.

Researchers fill it in while the period is open (Tbilisi dates, app/evaluations.py). Each entry is saved on its own,
with its evidence (documents uploaded through POST /api/v1/me/documents). Submitting sends the form to the
coordinator. Until the deadline the researcher can reopen it ("Update submission"), change it and resubmit, or
discard the changes; meanwhile the coordinator keeps seeing the last submission (`evaluations.submission`).
Reviewing entries comes next."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import audit
from app.auth.sessions import client_ip, current_user
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.evaluations import (
    BUILT_IN_FORMS,
    FormStructure,
    Localized,
    PeriodOut,
    built_in_structure,
    find_form,
    find_period,
    status_of,
    to_out,
    today,
)
from app.models import Evaluation, EvaluationEntry, EvaluationEntryFile, EvaluationPeriod, File, User
from app.people import PersonOut, load_people
from app.profile_entries import DocumentOut, own_documents

router = APIRouter(tags=["evaluations"])

State = Literal["draft", "submitted", "updating"]
EntryStatus = Literal["draft", "submitted", "approved", "rejected"]


# --- shapes ---------------------------------------------------------------------------------------

class EvaluationBrief(BaseModel):
    id: uuid.UUID
    form_ref: str
    form_name: Localized
    state: State
    started: bool  # the researcher has added an entry: the form can't be replaced or withdrawn any more
    sent_at: datetime
    submitted_at: datetime | None
    entries: int  # entries that will be sent (not hidden)


class RosterRow(BaseModel):
    person: PersonOut
    evaluation: EvaluationBrief | None


class SendIn(BaseModel):
    form_id: str = Field(min_length=1, max_length=64)
    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)


class SendOut(BaseModel):
    sent: int
    replaced: int  # had a form they hadn't started yet: now have this one
    unchanged: int  # already had this form
    skipped: list[str]  # already started on another form: kept as it is


class WosCheckIn(BaseModel):
    """The Web of Science check the app did for an entry's DOI (WosCheck in the app)"""
    doi: str = Field(max_length=300)
    found: bool
    checkedAt: str = Field(max_length=40)  # noqa: N815 (the app's own field names)
    title: str | None = Field(None, max_length=2000)
    source: str | None = Field(None, max_length=1000)
    year: int | None = Field(None, ge=1000, le=3000)
    timesCited: int | None = Field(None, ge=0)  # noqa: N815
    recordUrl: str | None = Field(None, max_length=2000)  # noqa: N815
    includesYou: bool | None = None  # noqa: N815
    registered: bool | None = None
    journalInWos: bool | None = None  # noqa: N815
    journal: str | None = Field(None, max_length=1000)


class EntryIn(BaseModel):
    item_id: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=2000)
    detail: str = Field("", max_length=1000)
    points: float | None = Field(None, ge=0, le=10000)  # only for items whose entries state their own points
    wos: WosCheckIn | None = None
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)


class HiddenIn(BaseModel):
    hidden: bool


class SubmitIn(BaseModel):
    confirm: Literal[True]  # "I confirm that the information I provided is accurate"


class EntryOut(BaseModel):
    id: uuid.UUID
    item_id: str
    description: str
    detail: str
    points: float | None
    hidden: bool
    status: EntryStatus
    review_comment: str | None
    wos: dict[str, Any] | None
    files: list[DocumentOut]
    updated_at: datetime


class EntryRef(BaseModel):
    item_id: str
    entry_id: uuid.UUID


class MyEvaluationBrief(BaseModel):
    id: uuid.UUID
    period: PeriodOut
    form_name: Localized
    state: State
    submitted_at: datetime | None
    entries: int
    rejected: int
    missing_files: int
    first_rejected: EntryRef | None  # for "Fix" links on the dashboard
    first_missing_file: EntryRef | None


class MyEvaluation(BaseModel):
    id: uuid.UUID
    period: PeriodOut
    form_name: Localized
    structure: FormStructure
    state: State
    can_edit: bool  # the period is open and the form isn't submitted (or is being updated)
    sent_at: datetime
    submitted_at: datetime | None
    entries: list[EntryOut]
    submission: list[dict[str, Any]] | None  # the entries as last submitted, to show what an update changes


# --- helpers --------------------------------------------------------------------------------------

def items_of(evaluation: Evaluation) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for part in evaluation.form_structure["parts"] for item in part["items"]}


def files_of(db: Session, entry_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[File]]:
    rows = db.execute(
        select(EvaluationEntryFile.entry_id, File).join(File, File.id == EvaluationEntryFile.file_id)
        .where(EvaluationEntryFile.entry_id.in_(entry_ids), File.deleted_at.is_(None))
        .order_by(EvaluationEntryFile.position)).all() if entry_ids else []
    result: dict[uuid.UUID, list[File]] = {}
    for entry_id, file in rows:
        result.setdefault(entry_id, []).append(file)
    return result


def document(file: File) -> DocumentOut:
    return DocumentOut(id=file.id, name=file.original_name, size=file.size_bytes, type=file.mime_type,
                       url=f"/api/v1/files/{file.id}")


def number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def entry_out(entry: EvaluationEntry, files: list[File]) -> EntryOut:
    return EntryOut(id=entry.id, item_id=entry.item_id, description=entry.description, detail=entry.detail,
                    points=number(entry.points), hidden=entry.hidden, status=entry.status,  # type: ignore[arg-type]
                    review_comment=entry.review_comment, wos=entry.wos, files=[document(f) for f in files],
                    updated_at=entry.updated_at)


def entries_of(db: Session, evaluation: Evaluation) -> list[EvaluationEntry]:
    return list(db.scalars(select(EvaluationEntry).where(EvaluationEntry.evaluation_id == evaluation.id)
                           .order_by(EvaluationEntry.created_at, EvaluationEntry.id)))


def snapshot_of(entry: EvaluationEntry, files: list[File]) -> dict[str, Any]:
    """An entry as it's kept in evaluations.submission"""
    return {"id": str(entry.id), "item_id": entry.item_id, "description": entry.description, "detail": entry.detail,
            "points": number(entry.points), "hidden": entry.hidden, "status": entry.status,
            "review_comment": entry.review_comment, "wos": entry.wos, "file_ids": [str(f.id) for f in files]}


def content(snapshot: dict[str, Any]) -> tuple:
    """What the researcher can change in an entry: if any of it differs, the entry has changed"""
    return (snapshot["item_id"], snapshot["description"], snapshot["detail"], snapshot["points"], snapshot["hidden"],
            tuple(snapshot["file_ids"]))


def current_snapshots(db: Session, evaluation: Evaluation) -> list[dict[str, Any]]:
    entries = entries_of(db, evaluation)
    files = files_of(db, [e.id for e in entries])
    return [snapshot_of(e, files.get(e.id, [])) for e in entries]


def has_changes(evaluation: Evaluation, snapshots: list[dict[str, Any]]) -> bool:
    before = {s["id"]: content(s) for s in evaluation.submission or []}
    now = {s["id"]: content(s) for s in snapshots}
    return before != now


def period_of(db: Session, evaluation: Evaluation) -> EvaluationPeriod:
    return db.get(EvaluationPeriod, evaluation.period_id)  # type: ignore[return-value]


def is_open(period: EvaluationPeriod) -> bool:
    return period.archived_at is None and status_of(period, today()) == "open"


def day_label(day: date) -> str:
    return f"{day.day} {day:%b %Y}"  # 1 Sep 2026


def require_open(period: EvaluationPeriod) -> None:
    on = today()
    if period.archived_at is not None or on > period.ends_on:
        raise problem(status.HTTP_409_CONFLICT, "period_closed",
                      "The deadline has passed, so the form can't be changed. Contact your coordinator if something "
                      "needs to change.")
    if on < period.starts_on:
        raise problem(status.HTTP_409_CONFLICT, "period_not_open",
                      f"This evaluation opens on {day_label(period.starts_on)}.")


def require_editable(db: Session, evaluation: Evaluation) -> None:
    require_open(period_of(db, evaluation))
    if evaluation.state == "submitted":
        raise problem(status.HTTP_409_CONFLICT, "submitted",
                      "Your form is submitted. Use “Update submission” to change it.")


def my_evaluation(db: Session, user: User, evaluation_id: uuid.UUID) -> Evaluation:
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.user_id != user.id or evaluation.withdrawn_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Evaluation not found.")
    return evaluation


def my_entry(db: Session, evaluation: Evaluation, entry_id: uuid.UUID) -> EvaluationEntry:
    entry = db.get(EvaluationEntry, entry_id)
    if entry is None or entry.evaluation_id != evaluation.id:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Entry not found.")
    return entry


def check_room(db: Session, evaluation: Evaluation, item: dict[str, Any], except_id: uuid.UUID | None = None) -> None:
    """An item counts at most max_entries entries; hidden ones don't count"""
    limit = item.get("max_entries")
    if limit is None:
        return
    used = db.scalar(select(func.count()).select_from(EvaluationEntry).where(
        EvaluationEntry.evaluation_id == evaluation.id, EvaluationEntry.item_id == item["id"],
        EvaluationEntry.hidden.is_(False), EvaluationEntry.id != except_id))
    if used >= limit:
        raise problem(status.HTTP_409_CONFLICT, "item_full", f"This item counts at most {limit} entries.")


def touch(db: Session, evaluation: Evaluation) -> None:
    if evaluation.started_at is None:
        evaluation.started_at = func.now()
    evaluation.updated_at = func.now()


def name_of(evaluation: Evaluation) -> Localized:
    return Localized(en=evaluation.form_name, ka=evaluation.form_name_ka)


def ref(entries: list[EvaluationEntry]) -> EntryRef | None:
    """The first of these entries, for a link straight to it"""
    return EntryRef(item_id=entries[0].item_id, entry_id=entries[0].id) if entries else None


def my_evaluation_out(db: Session, evaluation: Evaluation) -> MyEvaluation:
    period = period_of(db, evaluation)
    entries = entries_of(db, evaluation)
    files = files_of(db, [e.id for e in entries])
    return MyEvaluation(
        id=evaluation.id, period=to_out(period), form_name=name_of(evaluation),
        structure=FormStructure.model_validate(evaluation.form_structure),
        state=evaluation.state,  # type: ignore[arg-type]
        can_edit=is_open(period) and evaluation.state != "submitted", sent_at=evaluation.sent_at,
        submitted_at=evaluation.submitted_at, entries=[entry_out(e, files.get(e.id, [])) for e in entries],
        submission=evaluation.submission)


def record(db: Session, request: Request, user: User, action: str, evaluation: Evaluation, **details) -> None:
    audit.record(db, action, entity_type="evaluation", entity_id=evaluation.id, actor_user_id=user.id,
                 organization_id=evaluation.organization_id, ip=client_ip(request), **details)


# --- researchers: their own evaluations ----------------------------------------------------------

@router.get("/api/v1/me/evaluations", response_model=list[MyEvaluationBrief])
def my_evaluations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The forms sent to the signed-in person, newest period first"""
    rows = db.execute(select(Evaluation, EvaluationPeriod).join(EvaluationPeriod)
                      .where(Evaluation.user_id == user.id, Evaluation.withdrawn_at.is_(None),
                             EvaluationPeriod.archived_at.is_(None))
                      .order_by(EvaluationPeriod.starts_on.desc())).all()
    briefs = []
    for evaluation, period in rows:
        entries = [e for e in entries_of(db, evaluation) if not e.hidden]
        files = files_of(db, [e.id for e in entries])
        rejected = [e for e in entries if e.status == "rejected"]
        missing = [e for e in entries if not files.get(e.id) and e.status != "rejected"]
        briefs.append(MyEvaluationBrief(
            id=evaluation.id, period=to_out(period), form_name=name_of(evaluation),
            state=evaluation.state, submitted_at=evaluation.submitted_at,  # type: ignore[arg-type]
            entries=len(entries), rejected=len(rejected), missing_files=len(missing),
            first_rejected=ref(rejected), first_missing_file=ref(missing)))
    return briefs


@router.get("/api/v1/me/evaluations/{evaluation_id}", response_model=MyEvaluation)
def get_my_evaluation(evaluation_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return my_evaluation_out(db, my_evaluation(db, user, evaluation_id))


def apply_entry(db: Session, user: User, evaluation: Evaluation, entry: EvaluationEntry, body: EntryIn) -> list[File]:
    items = items_of(evaluation)
    item = items.get(body.item_id)
    if item is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_item", "This item isn't on the form.")
    if item.get("variable_points") and body.points is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "points_required", "Enter the points for this entry.")
    files = own_documents(db, user, body.file_ids)
    entry.item_id = item["id"]
    entry.description = body.description.strip()
    entry.detail = body.detail.strip()
    entry.points = Decimal(str(body.points)) if item.get("variable_points") and body.points is not None else None
    entry.wos = body.wos.model_dump(exclude_none=True) if body.wos else None
    # A changed entry goes back to draft: it's sent for review again with the next submission
    entry.status = "draft"
    entry.review_comment = None
    entry.updated_at = func.now()
    db.flush()
    db.execute(delete(EvaluationEntryFile).where(EvaluationEntryFile.entry_id == entry.id))
    for position, file in enumerate(files):
        db.add(EvaluationEntryFile(entry_id=entry.id, file_id=file.id, position=position))
    return files


@router.post("/api/v1/me/evaluations/{evaluation_id}/entries", response_model=EntryOut,
             status_code=status.HTTP_201_CREATED)
def add_entry(evaluation_id: uuid.UUID, body: EntryIn, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    evaluation = my_evaluation(db, user, evaluation_id)
    require_editable(db, evaluation)
    item = items_of(evaluation).get(body.item_id)
    if item is not None:
        check_room(db, evaluation, item)
    entry = EvaluationEntry(evaluation_id=evaluation.id, item_id=body.item_id, description="")
    db.add(entry)
    db.flush()
    files = apply_entry(db, user, evaluation, entry, body)
    touch(db, evaluation)
    db.commit()
    db.refresh(entry)
    return entry_out(entry, files)


@router.put("/api/v1/me/evaluations/{evaluation_id}/entries/{entry_id}", response_model=EntryOut)
def update_entry(evaluation_id: uuid.UUID, entry_id: uuid.UUID, body: EntryIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    evaluation = my_evaluation(db, user, evaluation_id)
    require_editable(db, evaluation)
    entry = my_entry(db, evaluation, entry_id)
    item = items_of(evaluation).get(body.item_id)
    if item is not None and body.item_id != entry.item_id and not entry.hidden:
        check_room(db, evaluation, item, except_id=entry.id)
    files = apply_entry(db, user, evaluation, entry, body)
    touch(db, evaluation)
    db.commit()
    db.refresh(entry)
    return entry_out(entry, files)


@router.put("/api/v1/me/evaluations/{evaluation_id}/entries/{entry_id}/hidden", response_model=EntryOut)
def set_hidden(evaluation_id: uuid.UUID, entry_id: uuid.UUID, body: HiddenIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Hides an entry (kept, but not sent or counted) or shows it again. Entries are never deleted."""
    evaluation = my_evaluation(db, user, evaluation_id)
    require_editable(db, evaluation)
    entry = my_entry(db, evaluation, entry_id)
    if entry.hidden and not body.hidden:
        check_room(db, evaluation, items_of(evaluation).get(entry.item_id, {"id": entry.item_id}), except_id=entry.id)
    entry.hidden = body.hidden
    entry.updated_at = func.now()
    touch(db, evaluation)
    db.commit()
    db.refresh(entry)
    return entry_out(entry, files_of(db, [entry.id]).get(entry.id, []))


@router.post("/api/v1/me/evaluations/{evaluation_id}/submit", response_model=MyEvaluation)
def submit(evaluation_id: uuid.UUID, body: SubmitIn, request: Request, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    """Sends the form to the coordinator. Entries not yet reviewed (new or changed) go for review; approved and
    rejected entries the researcher didn't change keep their status."""
    evaluation = my_evaluation(db, user, evaluation_id)
    require_editable(db, evaluation)
    resubmitting = evaluation.state == "updating"
    if resubmitting and not has_changes(evaluation, current_snapshots(db, evaluation)):
        raise problem(status.HTTP_409_CONFLICT, "no_changes", "Nothing has changed since you submitted.")
    sent = 0
    for entry in entries_of(db, evaluation):
        if not entry.hidden:
            sent += 1
            if entry.status == "draft":
                entry.status = "submitted"
    if sent == 0:
        raise problem(status.HTTP_409_CONFLICT, "no_entries", "Add at least one entry before submitting.")
    db.flush()
    evaluation.submission = current_snapshots(db, evaluation)
    evaluation.state = "submitted"
    evaluation.submitted_at = func.now()
    touch(db, evaluation)
    record(db, request, user, "evaluation.resubmitted" if resubmitting else "evaluation.submitted", evaluation,
           after={"entries": sent})
    db.commit()
    db.refresh(evaluation)
    return my_evaluation_out(db, evaluation)


@router.post("/api/v1/me/evaluations/{evaluation_id}/reopen", response_model=MyEvaluation)
def reopen(evaluation_id: uuid.UUID, request: Request, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    """"Update submission": the form can be changed again; the coordinator keeps seeing the submission until the
    researcher resubmits."""
    evaluation = my_evaluation(db, user, evaluation_id)
    require_open(period_of(db, evaluation))
    if evaluation.state != "submitted":
        raise problem(status.HTTP_409_CONFLICT, "not_submitted", "The form isn't submitted.")
    evaluation.state = "updating"
    evaluation.updated_at = func.now()
    record(db, request, user, "evaluation.reopened", evaluation)
    db.commit()
    db.refresh(evaluation)
    return my_evaluation_out(db, evaluation)


@router.post("/api/v1/me/evaluations/{evaluation_id}/discard", response_model=MyEvaluation)
def discard(evaluation_id: uuid.UUID, request: Request, user: User = Depends(current_user),
            db: Session = Depends(get_db)):
    """Throws away the changes made since submitting: the entries are put back as they were submitted."""
    evaluation = my_evaluation(db, user, evaluation_id)
    if evaluation.state != "updating" or evaluation.submission is None:
        raise problem(status.HTTP_409_CONFLICT, "not_updating", "There are no changes to discard.")
    db.execute(delete(EvaluationEntry).where(EvaluationEntry.evaluation_id == evaluation.id))
    db.flush()
    for saved in evaluation.submission:
        entry = EvaluationEntry(
            id=uuid.UUID(saved["id"]), evaluation_id=evaluation.id, item_id=saved["item_id"],
            description=saved["description"], detail=saved["detail"],
            points=None if saved["points"] is None else Decimal(str(saved["points"])), hidden=saved["hidden"],
            status=saved["status"], review_comment=saved["review_comment"], wos=saved["wos"])
        db.add(entry)
        db.flush()
        for position, file_id in enumerate(saved["file_ids"]):
            db.add(EvaluationEntryFile(entry_id=entry.id, file_id=uuid.UUID(file_id), position=position))
    evaluation.state = "submitted"
    evaluation.updated_at = func.now()
    record(db, request, user, "evaluation.changes_discarded", evaluation)
    db.commit()
    db.refresh(evaluation)
    return my_evaluation_out(db, evaluation)


# --- coordinators: sending forms -----------------------------------------------------------------

def roster(db: Session, org_id: uuid.UUID, actor: Actor, role: str) -> list[PersonOut]:
    """Who this person can send forms to: a coordinator's researchers, or everyone in the organization for Admins.
    Never themselves, nor anyone deactivated."""
    people = load_people(db, org_id, visible_to_coordinator=actor.user.id if role == "coordinator" else None)
    return [p for p in people if p.status != "deactivated" and p.id != actor.user.id and "member" in p.roles]


def brief(evaluation: Evaluation, entries: int) -> EvaluationBrief:
    return EvaluationBrief(id=evaluation.id, form_ref=evaluation.form_ref,
                           form_name=name_of(evaluation),
                           state=evaluation.state, started=evaluation.started_at is not None,  # type: ignore[arg-type]
                           sent_at=evaluation.sent_at, submitted_at=evaluation.submitted_at, entries=entries)


def active_evaluations(db: Session, period_id: uuid.UUID, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, Evaluation]:
    if not user_ids:
        return {}
    return {e.user_id: e for e in db.scalars(select(Evaluation).where(
        Evaluation.period_id == period_id, Evaluation.user_id.in_(user_ids), Evaluation.withdrawn_at.is_(None)))}


@router.get("/api/v1/orgs/{org_id}/evaluation-periods/{period_id}/evaluations", response_model=list[RosterRow])
def list_sent(org_id: uuid.UUID, period_id: uuid.UUID, actor: Actor = Depends(get_actor),
              db: Session = Depends(get_db)):
    """Everyone this person sends forms to, with the form each has for the period (or none yet)."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.SEND_EVALUATIONS, org_id)
    period = find_period(db, org_id, period_id)
    people = roster(db, org_id, actor, role)
    sent = active_evaluations(db, period.id, [p.id for p in people])
    counts = dict(db.execute(
        select(EvaluationEntry.evaluation_id, func.count()).where(
            EvaluationEntry.evaluation_id.in_([e.id for e in sent.values()]), EvaluationEntry.hidden.is_(False))
        .group_by(EvaluationEntry.evaluation_id)).all()) if sent else {}
    return [RosterRow(person=p, evaluation=brief(sent[p.id], counts.get(sent[p.id].id, 0)) if p.id in sent else None)
            for p in people]


@router.post("/api/v1/orgs/{org_id}/evaluation-periods/{period_id}/evaluations", response_model=SendOut)
def send(org_id: uuid.UUID, period_id: uuid.UUID, body: SendIn, request: Request, actor: Actor = Depends(get_actor),
         db: Session = Depends(get_db)):
    """Sends a form to researchers for a period. Someone who already has a form they haven't started gets this one
    instead; someone who has started theirs keeps it."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.SEND_EVALUATIONS, org_id)
    period = find_period(db, org_id, period_id)
    if status_of(period, today()) == "closed":
        raise problem(status.HTTP_409_CONFLICT, "period_closed", "This period's deadline has passed.")
    if body.form_id in BUILT_IN_FORMS:
        form = BUILT_IN_FORMS[body.form_id]
        ref, name, structure = body.form_id, form.name, built_in_structure(form)
    else:
        custom = find_form(db, org_id, body.form_id, actor, role)
        ref, name = str(custom.id), Localized(en=custom.name, ka=custom.name_ka)
        structure = FormStructure.model_validate(custom.structure)
    shape = structure.model_dump(mode="json")

    people = {p.id: p for p in roster(db, org_id, actor, role)}
    wanted = list(dict.fromkeys(body.user_ids))
    if any(user_id not in people for user_id in wanted):
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "not_in_scope",
                      "You can only send forms to the researchers you coordinate.")
    existing = active_evaluations(db, period.id, wanted)
    result = SendOut(sent=0, replaced=0, unchanged=0, skipped=[])
    for user_id in wanted:
        current = existing.get(user_id)
        if current is None:
            evaluation = Evaluation(organization_id=org_id, period_id=period.id, user_id=user_id, form_ref=ref,
                                    form_name=name.en, form_name_ka=name.ka, form_structure=shape,
                                    sent_by=actor.user.id)
            db.add(evaluation)
            db.flush()
            action = "evaluation.sent"
            result.sent += 1
        elif current.started_at is None and current.state == "draft":
            if current.form_ref == ref and current.form_structure == shape:
                result.unchanged += 1
                continue
            evaluation = current
            evaluation.form_ref, evaluation.form_name, evaluation.form_name_ka = ref, name.en, name.ka
            evaluation.form_structure, evaluation.sent_by, evaluation.sent_at = shape, actor.user.id, func.now()
            evaluation.updated_at = func.now()
            action = "evaluation.form_replaced"
            result.replaced += 1
        else:
            result.skipped.append(people[user_id].display_name)
            continue
        audit.record(db, action, entity_type="evaluation", entity_id=evaluation.id, actor_user_id=actor.user.id,
                     acting_role=role, organization_id=org_id, ip=actor.ip,
                     after={"user_id": str(user_id), "period": period.name, "form": name.en})
    db.commit()
    return result


@router.delete("/api/v1/orgs/{org_id}/evaluations/{evaluation_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw(org_id: uuid.UUID, evaluation_id: uuid.UUID, actor: Actor = Depends(get_actor),
             db: Session = Depends(get_db)):
    """Takes back a form the researcher hasn't started. Once they've added an entry it stays."""
    get_organization(db, org_id)
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != org_id or evaluation.withdrawn_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Evaluation not found.")
    role = authorize(db, actor, Action.SEND_EVALUATIONS, org_id, target_user_id=evaluation.user_id)
    if evaluation.started_at is not None or evaluation.state != "draft":
        raise problem(status.HTTP_409_CONFLICT, "evaluation_started",
                      "They've started filling it in, so it can't be withdrawn.")
    evaluation.withdrawn_at = func.now()
    audit.record(db, "evaluation.withdrawn", entity_type="evaluation", entity_id=evaluation.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, ip=actor.ip,
                 before={"user_id": str(evaluation.user_id), "form": evaluation.form_name})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
