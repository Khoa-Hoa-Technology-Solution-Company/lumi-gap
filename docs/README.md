# LumiGap documentation index

Code is the source of truth (`apps/**/src`, `apps/backend/prisma`, `docker-compose.yml`, `.env.example`, `package.json`). When a document here disagrees with the code, fix the document.

## Setup and operations
- [installation_guide_vietnamese.md](installation_guide_vietnamese.md) - Vietnamese install and run guide (Docker and native).
- [DEPLOY_WITH_DOCKER.md](DEPLOY_WITH_DOCKER.md) - Docker Compose runtime, profiles, workers, troubleshooting, rate limits.
- [environment-variables.md](environment-variables.md) - inventory of every environment variable with defaults.
- [single-env-docker-validation.md](single-env-docker-validation.md) - historical (2026-10-05) validation of the single root `.env` setup.
- [OPENALEX_MILLION_INGEST_RUNBOOK.md](OPENALEX_MILLION_INGEST_RUNBOOK.md) - operating the bulk OpenAlex ingest campaigns.
- [integration-tests.md](integration-tests.md) - persistence suites that need a throwaway `_test` database.
- [prisma-migrations.md](prisma-migrations.md) - why `migrate dev` is disabled and how to write migrations by hand.

## API and design
- [API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md) - base URLs, response envelope, auth and paper endpoints, admin sync.
- [DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md) - visual language and design tokens of the web app.
- [adr/0001-collaborative-latex.md](adr/0001-collaborative-latex.md) - architecture decision record for collaborative LaTeX writing.
- [superpowers/specs/2026-05-25-phase-a-design.md](superpowers/specs/2026-05-25-phase-a-design.md) - historical Phase A design (MongoDB era, kept because `CLAUDE.md` links to it).
- [superpowers/specs/2026-10-15-gap-closure-protocol-design.md](superpowers/specs/2026-10-15-gap-closure-protocol-design.md) - Gap Closure Protocol software design (referenced from backend code comments).
- [superpowers/specs/2026-10-16-trend-methodology-design.md](superpowers/specs/2026-10-16-trend-methodology-design.md) - trend verdict methodology (referenced from backend and web code comments).

## Features
- [PERSONAL_AI_CONNECTIONS.md](PERSONAL_AI_CONNECTIONS.md) - per-user AI provider connections.
- [gap-closure-protocol.md](gap-closure-protocol.md) - how a research gap is declared open, in a form repeatable by hand.
- [rag-implementation.md](rag-implementation.md) - full-text RAG and paper knowledge graph.
- [forum-trust-safety-v1.md](forum-trust-safety-v1.md) - forum moderation and appeals.
- [lecturer-verification-workflow.md](lecturer-verification-workflow.md) - lecturer verification states and notifications.
- [student-affiliation-verification.md](student-affiliation-verification.md) - open academic onboarding and optional FPT verification.
- [shared-academic-profile.md](shared-academic-profile.md) - shared academic profile and featured works.
- [mentorship-demo-data.md](mentorship-demo-data.md) - local mentorship demo seed.
- [manuscript-compilation.md](manuscript-compilation.md) - manuscript PDF compilation service.
- [manuscript-ai-assistant.md](manuscript-ai-assistant.md) - AI writing assistant in the manuscript editor.
- [github-manuscript-connection.md](github-manuscript-connection.md) - GitHub App connection for manuscripts.
- [pdf-to-latex.md](pdf-to-latex.md) - PDF to LaTeX conversion.
- [pdf-structured-validation.md](pdf-structured-validation.md) - validation record of structured PDF conversion (fixtures in `assets/pdf-structured/`).

## Other
- [notices/docling-core-MIT.txt](notices/docling-core-MIT.txt) - third-party license notice.
- [diagrams/](diagrams/) - Mermaid sources of the SRS/SDD diagrams (Reports 1-4).
