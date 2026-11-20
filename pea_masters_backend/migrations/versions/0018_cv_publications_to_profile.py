"""The CV builder's own publication lists move to research outputs on the profile, once.

Each CV's publications become the person's research outputs (source 'cv'), unless one with the same DOI (or, without a
DOI, the same title and year) is already there. The CV keeps no publications of its own after this: it shows the
profile's, minus the ones it hides.

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-20
"""

import re

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

TYPES = {"Journal article", "Conference paper", "Book", "Book chapter", "Preprint", "Thesis", "Report"}
STATUSES = {"Published", "In press", "Under review", "Preprint"}


def clean_doi(value: str) -> str:
    value = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (value or "").strip(), flags=re.I).lower()
    return value if re.fullmatch(r"10\.\d{4,9}/\S+", value) else ""


def key(doi: str, title: str, year) -> str:
    return f"doi:{doi}" if doi else f"title:{re.sub(r'[\W_]+', '', title.lower())}:{year or ''}"


def upgrade() -> None:
    db = op.get_bind()
    cvs = db.execute(sa.text("select user_id, data from cvs where jsonb_array_length(coalesce(data->'publications', "
                             "'[]'::jsonb)) > 0")).all()
    for user_id, data in cvs:
        existing = {key(doi, title, year) for doi, title, year in db.execute(
            sa.text("select doi, title, year from research_outputs where user_id = :u"), {"u": user_id})}
        for pub in data.get("publications") or []:
            title = " ".join(str(pub.get("title") or "").split())[:600]
            if not title:
                continue
            year_text = str(pub.get("year") or "")
            year = int(year_text) if re.fullmatch(r"\d{4}", year_text) and 1900 <= int(year_text) <= 2100 else None
            doi = clean_doi(pub.get("doi") or "")
            if key(doi, title, year) in existing:
                continue
            existing.add(key(doi, title, year))
            url = str(pub.get("url") or "")
            db.execute(sa.text(
                "insert into research_outputs (user_id, kind, subtype, status, title, authors, venue, year, volume, "
                "issue, pages, doi, url, source) values (:user_id, 'publication', :subtype, :status, :title, :authors, "
                ":venue, :year, :volume, :issue, :pages, :doi, :url, 'cv')"),
                {"user_id": user_id, "subtype": pub.get("type") if pub.get("type") in TYPES else "Journal article",
                 "status": pub.get("status") if pub.get("status") in STATUSES else "Published", "title": title,
                 "authors": str(pub.get("authors") or "")[:3000], "venue": str(pub.get("venue") or "")[:400],
                 "year": year, "volume": str(pub.get("volume") or "")[:40], "issue": str(pub.get("issue") or "")[:40],
                 "pages": str(pub.get("pages") or "")[:40], "doi": doi,
                 "url": url[:1000] if re.match(r"https?://", url, re.I) else ""})
    db.execute(sa.text("update cvs set data = data - 'publications' where data ? 'publications'"))


def downgrade() -> None:
    """The moved publications stay on the profile; CVs simply show none of their own again."""
