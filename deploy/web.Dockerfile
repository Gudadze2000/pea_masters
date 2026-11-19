# The website: the built React app served by Caddy, which also gets the HTTPS certificate and passes /api to the API.
# Built from the repository root (see compose.yml).
FROM oven/bun:1.4.4 AS build
WORKDIR /src
COPY pea_masters_frontend/package.json pea_masters_frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY pea_masters_frontend/ ./
RUN bun run build

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
