"""Reviewing submitted evaluations: a coordinator (or an Admin) decides on each entry, then on the whole form.

    Entry   approved, or rejected with a comment the researcher sees on the entry
    Form    approved: final; the score is worked out from the approved entries and the form is locked
            returned: with a comment; the researcher fixes it and resubmits while the period is open

The reviewer always sees what was submitted (`evaluations.submission`), even while the researcher is changing their
form. A decision on an entry is kept with the submission and, if the researcher hasn't changed that entry since, with
the entry itself. A resubmission waits for a new decision on the form; unchanged entries keep theirs."""

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, wos
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.evaluations import FormStructure, Localized, PeriodOut, to_out
from app.models import Evaluation, EvaluationEntry, File, User
from app.people import PersonOut, one_person
from app.profile_entries import DocumentOut
from app.sent_evaluations import (
    ReviewState,
    content,
    document,
    files_of,
    name_of,
    number,
    period_of,
    snapshot_of,
)

router = APIRouter(tags=["evaluations"])


class EntryReviewIn(BaseModel):
    decision: Literal["approved", "rejected", "submitted"]  # "submitted": undo, back to waiting for a decision
    comment: str | None = Field(None, max_length=1000)  # required when rejecting; the researcher sees it


class FormReviewIn(BaseModel):
    decision: ReviewState
    comment: str | None = Field(None, max_length=2000)  # required when returning the form


class ReviewEntry(BaseModel):
    id: uuid.UUID
    item_id: str
    description: str
    detail: str
    points: float | None
    status: Literal["submitted", "approved", "rejected"]
    review_comment: str | None
    wos: dict[str, Any] | None  # the check saved by the researcher's browser; GET …/wos checks again on the server
    doi: str | None
    files: list[DocumentOut]


class ReviewOut(BaseModel):
    id: uuid.UUID
    person: PersonOut
    period: PeriodOut
    form_name: Localized
    structure: FormStructure
    state: Literal["submitted", "updating"]  # updating: the researcher is changing it; this is what they last sent
    submitted_at: datetime
    review_state: ReviewState | None
    review_comment: str | None
    reviewed_at: datetime | None
    reviewed_by: str | None
    final_score: float | None
    score: float  # from the entries approved so far, with the form's limits applied
    can_review: bool  # entries can be decided until the form is approved
    can_finish: bool  # the form can be approved or returned: submitted, not being changed, not yet approved
    entries: list[ReviewEntry]  # as submitted; hidden ones weren't sent and aren't here


DOI = re.compile(r"10\.\d{4,9}/[^\s\"<>]+")


def doi_of(snapshot: dict[str, Any]) -> str | None:
    saved = (snapshot.get("wos") or {}).get("doi")
    found = saved or next((m.group(0) for text in (snapshot["detail"], snapshot["description"])
                           if (m := DOI.search(text or ""))), None)
    return wos.normalize_doi(found) if found else None


def score_of(structure: dict[str, Any], entries: list[dict[str, Any]]) -> Decimal:
    """Points from approved entries: each item counts at most its max_points, each part at most its cap"""
    approved = [e for e in entries if e["status"] == "approved" and not e["hidden"]]
    total = Decimal(0)
    for part in structure["parts"]:
        part_total = Decimal(0)
        for item in part["items"]:
            mine = [e for e in approved if e["item_id"] == item["id"]]
            if item.get("variable_points"):
                points = sum((Decimal(str(e["points"] or 0)) for e in mine), Decimal(0))
            else:
                points = Decimal(str(item["points"])) * len(mine)
            if item.get("max_points") is not None:
                points = min(points, Decimal(str(item["max_points"])))
            part_total += points
        if part.get("cap") is not None:
            part_total = min(part_total, Decimal(str(part["cap"])))
        total += part_total
    return total


def sent_entries(evaluation: Evaluation) -> list[dict[str, Any]]:
    return [e for e in evaluation.submission or [] if not e["hidden"]]


def find_for_review(db: Session, org_id: uuid.UUID, evaluation_id: uuid.UUID, actor: Actor) -> tuple[Evaluation, str]:
    get_organization(db, org_id)
    evaluation = db.get(Evaluation, evaluation_id)
    if evaluation is None or evaluation.organization_id != org_id or evaluation.withdrawn_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Evaluation not found.")
    role = authorize(db, actor, Action.REVIEW_EVALUATIONS, org_id, target_user_id=evaluation.user_id)
    if evaluation.user_id == actor.user.id:
        raise problem(status.HTTP_403_FORBIDDEN, "own_evaluation", "Nobody reviews their own evaluation.")
    if evaluation.submission is None:
        raise problem(status.HTTP_409_CONFLICT, "not_submitted", "This form hasn't been submitted yet.")
    return evaluation, role


def review_out(db: Session, evaluation: Evaluation) -> ReviewOut:
    entries = sent_entries(evaluation)
    file_ids = [uuid.UUID(i) for e in entries for i in e["file_ids"]]
    files = {f.id: f for f in db.scalars(select(File).where(File.id.in_(file_ids), File.deleted_at.is_(None)))} \
        if file_ids else {}
    reviewer = db.get(User, evaluation.reviewed_by) if evaluation.reviewed_by else None
    approved = evaluation.review_state == "approved"
    return ReviewOut(
        id=evaluation.id, person=one_person(db, evaluation.organization_id, evaluation.user_id),
        period=to_out(period_of(db, evaluation)), form_name=name_of(evaluation),
        structure=FormStructure.model_validate(evaluation.form_structure),
        state=evaluation.state, submitted_at=evaluation.submitted_at,  # type: ignore[arg-type]
        review_state=evaluation.review_state, review_comment=evaluation.review_comment,  # type: ignore[arg-type]
        reviewed_at=evaluation.reviewed_at, reviewed_by=reviewer.display_name if reviewer else None,
        final_score=number(evaluation.final_score),
        score=float(score_of(evaluation.form_structure, entries)),
        can_review=not approved, can_finish=not approved and evaluation.state == "submitted",
        entries=[ReviewEntry(
            id=uuid.UUID(e["id"]), item_id=e["item_id"], description=e["description"], detail=e["detail"],
            points=e["points"], status=e["status"] if e["status"] != "draft" else "submitted",
            review_comment=e["review_comment"], wos=e["wos"], doi=doi_of(e),
            files=[document(files[uuid.UUID(i)]) for i in e["file_ids"] if uuid.UUID(i) in files]) for e in entries])


def sent_entry(evaluation: Evaluation, entry_id: uuid.UUID) -> dict[str, Any]:
    found = next((e for e in sent_entries(evaluation) if e["id"] == str(entry_id)), None)
    if found is None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Entry not found.")
    return found


def require_not_final(evaluation: Evaluation) -> None:
    if evaluation.review_state == "approved":
        raise problem(status.HTTP_409_CONFLICT, "already_approved", "This evaluation has already been approved.")


@router.get("/api/v1/orgs/{org_id}/evaluations/{evaluation_id}", response_model=ReviewOut)
def get_review(org_id: uuid.UUID, evaluation_id: uuid.UUID, actor: Actor = Depends(get_actor),
               db: Session = Depends(get_db)):
    """A researcher's submitted form, for their coordinator (or an Admin) to review"""
    evaluation, _ = find_for_review(db, org_id, evaluation_id, actor)
    return review_out(db, evaluation)


@router.put("/api/v1/orgs/{org_id}/evaluations/{evaluation_id}/entries/{entry_id}/review", response_model=ReviewOut)
def review_entry(org_id: uuid.UUID, evaluation_id: uuid.UUID, entry_id: uuid.UUID, body: EntryReviewIn,
                 actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Approves or rejects one entry (or undoes the decision)."""
    evaluation, role = find_for_review(db, org_id, evaluation_id, actor)
    require_not_final(evaluation)
    comment = (body.comment or "").strip() or None
    if body.decision == "rejected" and not comment:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "comment_required",
                      "Say why it's rejected, so they know what to fix.")
    target = sent_entry(evaluation, entry_id)
    before = target["status"]
    status_now, comment_now = body.decision, comment if body.decision == "rejected" else None
    # The submission is stored as one JSON value: replace it, so the change is saved
    evaluation.submission = [
        {**e, "status": status_now, "review_comment": comment_now} if e["id"] == target["id"] else e
        for e in evaluation.submission or []]
    # The entry itself too, unless the researcher has changed it since submitting (it's then reviewed again)
    entry = db.get(EvaluationEntry, entry_id)
    if entry is not None and entry.evaluation_id == evaluation.id:
        current = snapshot_of(entry, files_of(db, [entry.id]).get(entry.id, []))
        if content(current) == content(target):
            entry.status, entry.review_comment = status_now, comment_now
            entry.reviewed_by = actor.user.id if body.decision != "submitted" else None
            entry.reviewed_at = func.now() if body.decision != "submitted" else None
    evaluation.updated_at = func.now()
    action = {"approved": "approved", "rejected": "rejected", "submitted": "decision_undone"}[body.decision]
    audit.record(db, f"evaluation_entry.{action}", entity_type="evaluation_entry", entity_id=entry_id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, ip=actor.ip,
                 before={"status": before}, after={"status": status_now, "comment": comment_now})
    db.commit()
    db.refresh(evaluation)
    return review_out(db, evaluation)


@router.post("/api/v1/orgs/{org_id}/evaluations/{evaluation_id}/review", response_model=ReviewOut)
def review_form(org_id: uuid.UUID, evaluation_id: uuid.UUID, body: FormReviewIn, actor: Actor = Depends(get_actor),
                db: Session = Depends(get_db)):
    """Approves the whole form (final: the score is worked out and the form is locked) or returns it to the
    researcher to fix and resubmit."""
    evaluation, role = find_for_review(db, org_id, evaluation_id, actor)
    require_not_final(evaluation)
    if evaluation.state == "updating":
        raise problem(status.HTTP_409_CONFLICT, "being_updated",
                      "They're changing their form right now. Wait until they resubmit it.")
    comment = (body.comment or "").strip() or None
    if body.decision == "returned" and not comment:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "comment_required",
                      "Say what needs to change, so they know what to do.")
    entries = sent_entries(evaluation)
    if body.decision == "approved":
        undecided = sum(1 for e in entries if e["status"] not in ("approved", "rejected"))
        if undecided:
            raise problem(status.HTTP_409_CONFLICT, "undecided_entries",
                          f"Approve or reject every entry first: {undecided} still "
                          f"{'needs' if undecided == 1 else 'need'} a decision.")
        evaluation.final_score = score_of(evaluation.form_structure, entries)
    evaluation.review_state = body.decision
    evaluation.review_comment = comment
    evaluation.reviewed_by = actor.user.id
    evaluation.reviewed_at = func.now()
    evaluation.updated_at = func.now()
    audit.record(db, f"evaluation.{body.decision}", entity_type="evaluation", entity_id=evaluation.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, ip=actor.ip,
                 after={"comment": comment, "final_score": number(evaluation.final_score)})
    db.commit()
    db.refresh(evaluation)
    return review_out(db, evaluation)


@router.get("/api/v1/orgs/{org_id}/evaluations/{evaluation_id}/entries/{entry_id}/wos",
            response_model=wos.WosArticle)
def check_entry_doi(org_id: uuid.UUID, evaluation_id: uuid.UUID, entry_id: uuid.UUID,
                    actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Looks the entry's DOI up in Web of Science on the server (cached), whatever the researcher's browser saved.
    "Includes you" means the researcher's family name is among the authors."""
    evaluation, _ = find_for_review(db, org_id, evaluation_id, actor)
    doi = doi_of(sent_entry(evaluation, entry_id))
    if doi is None:
        raise problem(status.HTTP_404_NOT_FOUND, "no_doi", "This entry has no DOI.")
    researcher = db.get(User, evaluation.user_id)
    return wos.lookup(doi=doi, user=researcher, db=db)
