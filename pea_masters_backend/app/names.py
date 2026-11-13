"""People's display names.

Where a name comes from, in order of trust:
  manual        a person corrected it (an Admin, a head of department, later the person themselves): never overwritten
  google        the official name from ISU's Google Workspace directory, refreshed at every sign-in
  registration  typed or guessed from the email when the person was registered: replaced at their first sign-in
"""

import re
from typing import Any

# Letters (any script), optionally joined by hyphens or apostrophes: "ana-maria", "o'brien"
_NAME_PART = re.compile(r"^[^\W\d_]+(?:['-][^\W\d_]+)*$")


def _capitalize(part: str) -> str:
    return re.sub(r"[^\W\d_]+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), part)


def name_from_email(email: str) -> str | None:
    """Guesses "Giorgi Kekelidze" from "giorgi.kekelidze.3@iliauni.edu.ge" (ISU's name.surname.number format).

    Returns None when the address doesn't look like a name, so callers can ask for one instead of guessing badly.
    """
    local = email.strip().rpartition("@")[0] if "@" in email else ""
    parts = [p for p in local.split(".") if p and not p.isdigit()]
    if len(parts) < 2 or not all(_NAME_PART.match(p) for p in parts):
        return None
    return " ".join(_capitalize(p) for p in parts)


def official_name(claims: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """(display name, given name, family name) from verified Google ID-token claims."""
    given = (claims.get("given_name") or "").strip() or None
    family = (claims.get("family_name") or "").strip() or None
    display = " ".join(p for p in (given, family) if p) or (claims.get("name") or "").strip() or None
    return display, given, family
