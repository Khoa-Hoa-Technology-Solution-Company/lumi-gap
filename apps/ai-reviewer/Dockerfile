# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    REVIEW_APP_HOST=0.0.0.0 \
    REVIEW_APP_PORT=8000 \
    REVIEW_APP_RELOAD=false
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 paperscope \
    && useradd --uid 10001 --gid 10001 --no-create-home paperscope \
    && mkdir -p /app/data/uploads /app/outputs \
    && chown -R paperscope:paperscope /app/data /app/outputs
COPY app/ ./app/
COPY run.py AGENTS.md scientific_paper_review_agent_codex_prompt_v2_bilingual.md ./
COPY scripts/healthcheck.py ./scripts/healthcheck.py
USER 10001:10001

FROM base AS test
USER root
COPY requirements-dev.txt ./
RUN python -m pip install --no-cache-dir -r requirements-dev.txt
COPY tests/ ./tests/
USER 10001:10001
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]

FROM base AS runtime
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "scripts/healthcheck.py"]
CMD ["python", "run.py"]
