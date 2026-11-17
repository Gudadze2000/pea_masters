"""Researcher identifiers kept on the profile: ORCID iD, Web of Science ResearcherID and Scopus Author ID.
People paste them in many shapes (full links, lower case, without dashes); they're stored in one canonical form and
checked the same way as in the CV builder (src/Pages/CvBuilder/identifiers.ts)."""

import re

from pydantic import BaseModel, field_validator

KEYS = ("orcid", "researcher_id", "scopus_id")

_ORCID = re.compile(r"(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])")
_RESEARCHER_ID = re.compile(r"^[A-Z]{1,3}-\d{4}-(19|20)\d{2}$")
_SCOPUS_ID = re.compile(r"^\d{8,12}$")


def orcid_checksum_valid(orcid: str) -> bool:
    """ISO 7064 MOD 11-2 check digit, as ORCID uses."""
    digits = orcid.replace("-", "")
    if not re.fullmatch(r"\d{15}[\dX]", digits):
        return False
    total = 0
    for char in digits[:15]:
        total = (total + int(char)) * 2
    result = (12 - total % 11) % 11
    return digits[15] == ("X" if result == 10 else str(result))


def normalize_orcid(value: str) -> str:
    match = _ORCID.search(value.strip().upper())
    if not match:
        raise ValueError("An ORCID iD looks like 0000-0002-1825-0097.")
    orcid = "-".join(match.groups())
    if not orcid_checksum_valid(orcid):
        raise ValueError("This ORCID iD has a typo: its last character doesn't match the rest.")
    return orcid


def normalize_researcher_id(value: str) -> str:
    # Also accepts a webofscience.com/…/record/ABC-1234-2020 link
    rid = value.strip().upper().rstrip("/").split("/")[-1]
    if not _RESEARCHER_ID.match(rid):
        raise ValueError("A ResearcherID looks like ABC-1234-2020.")
    return rid


def normalize_scopus_id(value: str) -> str:
    match = re.search(r"authorId=(\d+)", value, re.IGNORECASE)
    sid = match.group(1) if match else value.strip()
    if not _SCOPUS_ID.match(sid):
        raise ValueError("A Scopus Author ID is a number of 8-12 digits.")
    return sid


class Identifiers(BaseModel):
    """Each one optional. On save, an empty string or null removes it."""
    orcid: str | None = None
    researcher_id: str | None = None
    scopus_id: str | None = None

    @field_validator("orcid")
    @classmethod
    def _orcid(cls, value: str | None) -> str | None:
        return normalize_orcid(value) if value and value.strip() else None

    @field_validator("researcher_id")
    @classmethod
    def _researcher_id(cls, value: str | None) -> str | None:
        return normalize_researcher_id(value) if value and value.strip() else None

    @field_validator("scopus_id")
    @classmethod
    def _scopus_id(cls, value: str | None) -> str | None:
        return normalize_scopus_id(value) if value and value.strip() else None
