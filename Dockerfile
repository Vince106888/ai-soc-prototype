# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dashboard-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH" \
    AI_SOC_FRONTEND_DIR=/app/frontend/dist
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app/ app/
COPY fixtures/ fixtures/
COPY alembic.ini ./
COPY alembic/ alembic/
COPY --from=dashboard-build /build/frontend/dist/ frontend/dist/

RUN addgroup --system sentinelsme \
    && adduser --system --ingroup sentinelsme sentinelsme \
    && mkdir -p /app/data \
    && chown -R sentinelsme:sentinelsme /app
USER sentinelsme

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=3)"

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
