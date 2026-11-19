# The PEA API for the server (deploy/compose.yml). Development doesn't use this: see README.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# uv from PyPI: the university network blocks ghcr.io, where uv's own image lives. Same version as CI.
RUN pip install --no-cache-dir uv==0.13.7

WORKDIR /app

# Dependencies first, so changing the code doesn't reinstall them
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project --python /usr/local/bin/python

COPY alembic.ini ./
COPY app app
COPY migrations migrations
COPY scripts scripts

# Runs as an ordinary user; uploaded files go to a volume mounted at /data/storage
RUN useradd --system --uid 10001 --no-create-home pea && mkdir -p /data/storage && chown pea /data/storage
USER pea
ENV STORAGE_DIR=/data/storage

EXPOSE 8000

# Brings the database up to date, then serves the API. Only the web server (Caddy) can reach port 8000, so the
# client address it passes on (X-Forwarded-For) is trusted for the audit log.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
