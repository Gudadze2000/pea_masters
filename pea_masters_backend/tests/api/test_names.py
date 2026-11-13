import pytest

from app.names import name_from_email, official_name


@pytest.mark.parametrize(("email", "expected"), [
    ("giorgi.kekelidze.3@iliauni.edu.ge", "Giorgi Kekelidze"),  # ISU: name.surname.number
    ("nino.beridze@iliauni.edu.ge", "Nino Beridze"),
    ("ANA-MARIA.lomidze.12@iliauni.edu.ge", "Ana-Maria Lomidze"),  # hyphenated, any case
    ("sean.o'brien.1@iliauni.edu.ge", "Sean O'Brien"),
    ("mari.tsereteli-dadiani.2@iliauni.edu.ge", "Mari Tsereteli-Dadiani"),
    ("gkekelidze@iliauni.edu.ge", None),  # one word: can't tell name from surname
    ("info.2024@iliauni.edu.ge", None),  # not a person's name
    ("g.k3@iliauni.edu.ge", None),  # digits inside a part
    ("not-an-email", None),
])
def test_name_from_email(email, expected):
    assert name_from_email(email) == expected


def test_official_name_prefers_given_and_family_names():
    assert official_name({"given_name": "Giorgi", "family_name": "Kekelidze", "name": "G. K."}) == \
        ("Giorgi Kekelidze", "Giorgi", "Kekelidze")
    assert official_name({"name": "Giorgi Kekelidze"}) == ("Giorgi Kekelidze", None, None)
    assert official_name({}) == (None, None, None)
