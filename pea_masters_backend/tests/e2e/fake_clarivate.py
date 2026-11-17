"""A stand-in for Clarivate's Web of Science Starter API, for the browser tests. It answers GET /v1/documents like the
real API (same JSON shape): DOI look-ups (q=DO="…") from RECORDS and author searches (q=AI=(…) AND PY=(from-to), with
paging) from AUTHORS, and journals (GET /v1/journals?issn=) from JOURNALS. It insists on the X-ApiKey header and counts
requests so tests can check that PEA caches. It also plays Crossref (GET /crossref/works/{doi}) from WORKS."""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

KEY = "e2e-key"


def record(doi: str, title: str, authors: list[tuple[str, str]], cited: int, year: int = 2025) -> dict:
    return {
        "uid": f"WOS:E2E{abs(hash(doi)) % 10**9:09d}",
        "title": title,
        "types": ["Article"],
        "source": {"sourceTitle": "PLANTA", "publishYear": year, "volume": "261", "issue": "2",
                   "pages": {"range": "12-25", "begin": "12", "end": "25", "count": 14}},
        "names": {"authors": [{"displayName": name, "wosStandard": standard} for name, standard in authors]},
        "links": {"record": f"https://www.webofscience.com/api/gateway?KeyUT=E2E&doi={doi}&DestLinkType=FullRecord"},
        "citations": [{"db": "WOS", "count": cited}],
        "identifiers": {"doi": doi},
    }


# DOIs use Crossref's 10.5555 test prefix, like the rest of the sample data
INDEXED = "10.5555/pea.e2e.indexed"
SOMEONE_ELSES = "10.5555/pea.e2e.someone-else"
RECORDS = {
    INDEXED: record(INDEXED, "Heat-shock proteins in Caucasian wheat",
                    [("Schulz, Karin", "Schulz, K"), ("Admin, Test", "Admin, T")], 14),
    SOMEONE_ELSES: record(SOMEONE_ELSES, "Alpine soil microbiome", [("Schulz, Karin", "Schulz, K")], 3),
}

# The test Admin's documents, by ResearcherID
RESEARCHER_ID = "AAA-1111-2020"
SECOND = "10.5555/pea.e2e.second"
ME = [("Admin, Test", "Admin, T")]
AUTHORS = {RESEARCHER_ID: [
    RECORDS[INDEXED],
    record(SECOND, "Root architecture of drought-tolerant wheat", ME, 6, 2024),
    record("10.5555/pea.e2e.old", "Seed bank digitisation in Georgia", ME, 30, 2019),
]}

# Registered with Crossref but not (yet) in Web of Science; its journal is in Web of Science's journal list
NOT_YET_INDEXED = "10.5555/pea.e2e.not-yet-indexed"
WORKS = {NOT_YET_INDEXED: {
    "type": "journal-article", "title": ["Cold tolerance of Svanetian barley"], "container-title": ["Planta"],
    "ISSN": ["0032-0935", "1432-2048"], "issued": {"date-parts": [[2026, 10]]},
    "author": [{"family": "Admin", "given": "Test"}],
}}
JOURNALS = {"1432-2048": {"id": "PLANTA-2025", "name": "PLANTA", "isoTitle": "Planta", "issn": "0032-0935",
                          "eIssn": "1432-2048", "links": [{"type": "Journal Citation Report record",
                                                           "url": "https://www.webofscience.com/jcr/planta"}]}}

requests: list[str] = []  # DOIs and author queries asked for, in order


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (http.server's naming)
        url = urlparse(self.path)
        params = parse_qs(url.query)
        if url.path.startswith("/crossref/works/"):
            doi = url.path.removeprefix("/crossref/works/")
            requests.append(f"crossref:{doi}")
            return self.reply(200, {"message": WORKS[doi]}) if doi in WORKS else self.reply(404, {"message": "no"})
        if url.path not in ("/v1/documents", "/v1/journals"):
            return self.reply(404, {"message": "no"})
        if self.headers.get("X-ApiKey") != KEY:
            return self.reply(401, {"message": "no"})
        if url.path == "/v1/journals":
            issn = params.get("issn", [""])[0]
            requests.append(f"journal:{issn}")
            hit = JOURNALS.get(issn)
            return self.reply(200, {"metadata": {"total": 1 if hit else 0}, "hits": [hit] if hit else []})
        query = params.get("q", [""])[0]
        limit, page = int(params.get("limit", ["10"])[0]), int(params.get("page", ["1"])[0])
        if match := re.fullmatch(r'DO="(.+)"', query):
            requests.append(match.group(1))
            hits = [RECORDS[match.group(1)]] if match.group(1) in RECORDS else []
        elif match := re.fullmatch(r"AI=\((.+?)\)(?: AND PY=\((\d{4})-(\d{4})\))?", query):
            requests.append(query)
            ids = [part.strip() for part in match.group(1).split(" OR ")]
            first, last = int(match.group(2) or 0), int(match.group(3) or 9999)
            hits = [hit for author in ids for hit in AUTHORS.get(author, [])
                    if first <= hit["source"]["publishYear"] <= last]
        else:
            return self.reply(400, {"message": f"unsupported query {query}"})
        self.reply(200, {"metadata": {"total": len(hits), "page": page, "limit": limit},
                         "hits": hits[(page - 1) * limit:page * limit]})

    def reply(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # keep the test output quiet
        pass


def start(port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
