"""Cleans rich text (HTML from the biography editor) before it's stored, so it can't carry scripts.

Kept: paragraphs, line breaks, bold/italic/underline, bullet and numbered lists, links (http, https, mailto) and
inline images embedded as PNG/JPEG/GIF/WebP data. Everything else (scripts, styles, event handlers, iframes,
javascript: links) is removed.
"""

import re

import nh3

TAGS = {"p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "img", "div", "span"}
ATTRIBUTES = {"a": {"href", "title"}, "img": {"src", "alt"}}
_LINK = re.compile(r"^(https?://|mailto:)", re.IGNORECASE)
_IMAGE = re.compile(r"^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$")


def _keep(tag: str, attribute: str, value: str) -> str | None:
    if tag == "a" and attribute == "href":
        return value if _LINK.match(value.strip()) else None
    if tag == "img" and attribute == "src":
        return value if _IMAGE.match(value.strip()) else None
    return value


def clean(html: str) -> str:
    return nh3.clean(
        html, tags=TAGS, attributes=ATTRIBUTES, attribute_filter=_keep, url_schemes={"http", "https", "mailto", "data"},
        link_rel="noopener noreferrer nofollow", strip_comments=True,
    ).strip()


def text_length(html: str) -> int:
    """Visible characters, as the editor counts them (tags and images don't count)."""
    text = re.sub(r"<[^>]*>", "", html)
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    return len(text.strip())
