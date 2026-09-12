# Production Environment Documentation Design

## Goal

Document the production environment for PaperLens so another team member can
configure and deploy the application without copying secrets into Git.

## Artifacts

### `README_PRODUCTION.md`

The production runbook will explain:

- the roles of DNS, OpenResty, Jenkins, Docker, and application environment
  variables;
- the public URLs `https://paperlens.uk` and
  `https://api.paperlens.uk/api/v1`;
- how to prepare the backend production environment;
- how to store that environment in the Jenkins Secret Text credential
  `liemresearch-backend-env-b64`;
- the required Jenkins build arguments and runtime overrides;
- Google OAuth origin and callback configuration;
- post-deployment health, CORS, API, and OAuth checks;
- secret rotation and troubleshooting guidance.

### `apps/backend/.env.production.example`

The example will include every backend variable accepted by
`apps/backend/src/config/env.ts`, grouped by responsibility. Public production
values may be populated, while every credential remains a descriptive
placeholder.

## Security Rules

- Never commit `.env.production` or another file containing real credentials.
- Never place MongoDB, Redis, Gemini, R2, Google OAuth, JWT, or provider secrets
  in the README.
- Store the complete production environment only in the Jenkins credentials
  store or another approved secret manager.
- Use command examples that do not print decoded secrets to terminal output.
- Runtime `docker run -e` values may override non-secret deployment URLs from
  the Jenkins-managed environment.

## Source Of Truth

- Variable names and defaults: `apps/backend/src/config/env.ts`.
- Safe local examples: `apps/backend/.env.example`.
- Production deployment behavior: the Jenkins `User1/LiemResearch` pipeline.
- Public endpoints:
  - Web: `https://paperlens.uk`
  - API: `https://api.paperlens.uk/api/v1`
  - Health: `https://api.paperlens.uk/health`
  - Google callback:
    `https://api.paperlens.uk/api/v1/auth/google/callback`

## Acceptance Criteria

- No real secret is added to Git.
- The production example covers all backend environment keys.
- The runbook explains how to configure Jenkins without committing the real
  environment.
- The runbook includes exact Google OAuth and CORS values.
- Commands and endpoint checks match the current Jenkins deployment.
