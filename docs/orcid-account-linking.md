# ORCID account linking

Implemented 7 November 2026. Account linking reuses `AcademicIdentityLink`, the existing identity manager, identity visibility/removal APIs, bearer authentication, PostgreSQL, Redis and the audit logger. It is separate from Google sign-in and does not create a LumiGap account or session.

## Setup and exact callback

Set backend environment variables only. No `VITE_` secret is needed:

```dotenv
ORCID_CLIENT_ID=
ORCID_CLIENT_SECRET=
ORCID_BASE_URL=https://sandbox.orcid.org
ORCID_REDIRECT_URI=http://localhost:8080/integrations/orcid/callback
```

The exact local callback to register with ORCID is **`http://localhost:8080/integrations/orcid/callback`**. This is a web application route, following LumiGap's GitHub linking pattern. It submits the code to the authenticated backend callback, not to a public backend GET endpoint. Use the actual web origin/port if running Vite directly, for example `http://localhost:5173/integrations/orcid/callback`. Start and callback must use the same browser origin and tab; `localhost` and `127.0.0.1` are different origins.

For production, use `ORCID_BASE_URL=https://orcid.org` and the registered HTTPS web callback `https://<your-web-host>/integrations/orcid/callback`. Only these two official ORCID origins are accepted. Redirect configuration rejects credentials, query strings, fragments, other callback paths and nonlocal HTTP. Sandbox and production use separate ORCID clients/accounts. Use separate application databases for sandbox testing; when intentionally reusing a database, disconnect old sandbox links before switching environments. Sandbox ownership is labeled separately and never used to infer production publication authorship.

Blank/missing client ID or secret disables the connection without breaking the app or other manual academic profiles. Availability returns `configured: false`; the button explains the missing setup. `.env.example` contains placeholders only. No production secret or deployment was changed.

The flow follows the [official authenticated iD tutorial](https://info.orcid.org/documentation/api-tutorials/api-tutorial-get-and-authenticated-orcid-id/) and [ORCID integration FAQ](https://info.orcid.org/documentation/integration-and-api-faq/). It requests only `/authenticate`, with `response_type=code`, authorization at `/oauth/authorize`, and backend form-encoded exchange at `/oauth/token`.

## APIs and browser flow

| Method | Path under `/api/v1` | Purpose |
| --- | --- | --- |
| GET | `/academic-profiles/me/orcid` | Authenticated availability and SANDBOX/PRODUCTION environment. |
| POST | `/academic-profiles/me/orcid/start` | Strict empty body; returns official authorization URL and random state. |
| POST | `/academic-profiles/me/orcid/callback` | `{state, code}` or `{state, error}`, never caller-supplied identity/trust fields. |
| PATCH | `/academic-profiles/me/academic-identities/:identityId` | Existing visibility API; ownership value cannot be changed while connected. |
| DELETE | `/academic-profiles/me/academic-identities/:identityId` | Existing owned-identity removal, also invalidates pending ORCID authorization. |

Start/callback use `requireAuth`, the existing response envelope, private/no-store headers and `createRateLimiter`. A provider redirect reaches the dedicated web callback outside the main app layout. The page removes temporary code/state from the URL, checks its tab-bound pending record and original user, and posts through the authenticated API client. StrictMode does not exchange twice. Completion refreshes existing profile queries and offers a fixed link back to `/profile`. Errors never display provider response bodies or `error_description`.

## State, persistence and concurrency

State is 32 random bytes, stored under a SHA-256 Redis key for ten minutes. It binds the canonical user ID, refresh-token session family, creation time, provider/client/redirect configuration and original identity revision. A per-user latest-flow marker invalidates older starts. Wrong account/session attempts do not consume the original state. Atomic `GETDEL` prevents replay and competing exchanges. Redis failures fail closed.

The browser additionally binds pending authorization to its tab/user in sessionStorage. No bearer or provider token is stored there. A changed/logged-out account must restart linking rather than attach another user's ORCID.

Backend exchange has a ten-second timeout, a 16 KB response limit, HTTPS official-origin destination and redirect rejection. The returned identifier must be canonical and pass the existing ORCID checksum validator. The response must contain a bearer token and `/authenticate` grant. Provider names do not overwrite local names. Access/refresh tokens are immediately discarded, never persisted, logged, returned, or used to read research records.

Successful persistence rechecks the account/session, locks the account and active session rows, and compares the latest-flow marker and identity revision. A late provider response cannot recreate a disconnected identity or overwrite a concurrent edit. The existing manual link is upgraded in place, preserving visibility; a new link defaults to PRIVATE. Only this successful exchange sets `OAUTH`, `CONNECTED`, and `PROVIDER_CONNECTED`. Manual APIs cannot supply those fields. Visibility changes preserve trust; connected identity values require disconnect first.

The handwritten migration `20261107100000_orcid_oauth_identity` adds a partial unique index on provider-connected ORCID identifiers and requires a connected identifier. Existing per-user ORCID uniqueness and provider-connection checks are retained. Multiple unverified claims do not reserve an identifier. Concurrent verified ownership claims are resolved by the database constraint; a duplicate reports a conflict without revealing the other account. Pre-existing conflicting OAuth ownership causes migration failure for explicit review, not silent reassignment.

Audit actions record start, success, cancellation, failure and disconnect with safe actor/identity/environment metadata. They contain no code, state, tokens, secret, provider body or academic assertions. Existing audit retention policy applies.

Disconnect removes the LumiGap ownership association and releases the unique identifier. This linking-only integration stores no token to revoke remotely. Users can additionally remove LumiGap from their ORCID trusted organizations. Disconnect is not a request to delete the ORCID record.

## Academic verification boundary

ORCID proves account ownership at connection time. It does not verify lecturer status, employment, affiliation, research skills, publication authorship by name, or mentoring quality. No role, affiliation, verification evidence, capability or mentor relationship is changed. Existing lecturer verification and mutual-consent gates remain authoritative.

## Verification and delivery

The isolated runner `apps/backend/scripts/test-academic-identity-matching.mjs --env-file <local-env-file>` derives local PostgreSQL database `lumigap_identity_matching_test` and Redis database 14. It applies forward migrations only to that database. It uses synthetic clients and mocked ORCID responses, not real ORCID credentials. No app database was migrated.

Executed coverage includes provider success/denial/failure, malformed identifiers/scopes/token metadata, bounded responses, missing credentials, sandbox/production endpoints, manual upgrade, privacy, actor/session binding, expiration, replay, superseded flows, duplicate ownership races, disconnect/late callbacks, session revocation, authenticated routes and forged-field rejection. Frontend covers availability, manual-link upgrade, start failures, callback success/error/cancellation, StrictMode, tab/user/expiry checks, URL cleanup and safe provider destinations. Exact final totals are recorded with the companion lecturer-matching handoff.

ORCID files added: `orcid-oauth.service.ts`, `orcid-oauth-state.ts`, `orcid-oauth.routes.ts`, `dto/orcid-oauth.schema.ts`, `__tests__/orcid-oauth.persistence.test.ts` under backend academic-profiles; web `features/academic-profile/orcid-authorization.ts`, `pages/orcid-callback.tsx`, and `__tests__/orcid-callback.test.tsx`; the migration and this document. Existing identity service/schema/routes, environment validation, identity UI/API/hooks/tests, shared academic-profile types, API constants, app routes and EN/VI locales were integrated rather than replaced.

Remaining real-provider steps: obtain sandbox credentials, register the exact callback, apply reviewed migrations to a development/staging database, restart with the four environment values, then test real grant/denial, reconnect, cross-account duplicates, disconnect and browser session changes. Repeat with separate production credentials and HTTPS only after review. Automated mocks do not establish compatibility with a real registered ORCID client. No commit, push or deployment is included.
