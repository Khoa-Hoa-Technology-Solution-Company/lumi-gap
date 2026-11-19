# Registration error recovery (2026-11-13)

## Confirmed cause

The running backend logged POST `/api/v1/auth/register` failures at `resolvePasswordResetOrigin -> webOrigin -> sendEmailVerification`. Local Docker used NODE_ENV=production and EMAIL_DELIVERY_MODE=smtp, while its configured web origin was HTTP localhost. The security-link origin check correctly refused HTTP production links.

The account transaction had already committed before email generation failed. The endpoint then returned 500; a subsequent signup attempt for that address correctly returned 409 because the account already existed. This was not a Docker build failure or a duplicate account that should be overwritten.

## Changes

- Registration returns a successful account/token response after committed account creation, even if verification-mail preparation/delivery fails. An additive optional `verificationEmailDelivery` field distinguishes SENT, DISABLED and FAILED.
- The account remains unverified. No lecturer privileges or verified email flags are granted. The existing login and resend mechanisms remain available.
- Disabled verification-mail delivery returns before constructing a URL, avoiding origin validation for a message that will not be sent.
- Production SMTP links still require HTTPS. No TLS validation, token protection, production secret or mail configuration was weakened/changed.
- The verification page distinguishes account creation from delivery failure/suppression rather than asserting that a message was delivered.
- A 409 is shown next to the email field with sign-in/reset guidance. Generic 500/network failures use a recoverable message; inputs remain intact.
- A synchronous submit guard prevents double submissions before the pending button renders; registration mutations explicitly disable automatic retries.

Files: `packages/shared-types/src/user.ts`; backend auth service/mail service and their tests; `apps/backend/scripts/test-registration.mjs`; web register form, auth hook, verify-email page, registration locale entries and component tests.

## Actual verification

- Real PostgreSQL: 8/8 cases passed (3 registration persistence/HTTP cases plus 5 auth-mail cases), run in both the worktree and runtime checkout. Only the isolated `lumigap_registration_test` database was migrated/populated.
- Web: 36/36 cases passed (6 registration/verification cases, 24 post-auth redirects, 6 password-policy cases).
- Shared-types build, worktree backend/web type checks, runtime backend TypeScript build and production web build passed. Scoped lint and diff whitespace checks passed.
- Runtime local backend/web containers were recreated with the new code. Backend image update copies only the compiled auth modules; unrelated worktree role-workspace/onboarding code was not deployed.
- `/` and backend `/ready` returned 200; unauthenticated `/api/v1/auth/me` returned the expected 401.
- SHA-256 of auth service/mail JavaScript in the running container matched the newly compiled runtime files.
- Browser at `127.0.0.1:8080/register`: submitting the known existing demo email returned 409 with a field-level message and retained form data. No uncaught/unhandled error was captured during this check. It did not change the demo account/password or create another application account.

Screenshot: `docs/audits/2026-11-13-registration/duplicate-email.png`.

## Remaining configuration issue

Local SMTP verification is still blocked by the production HTTPS-origin rule. The new FAILED state makes this explicit without falsely failing account creation. Real verification-mail delivery was not tested or repaired by inventing an HTTPS hostname. To send usable mail, configure a real HTTPS application origin for the production SMTP environment (or run a deliberately configured local development environment). No existing user's password or verification state was altered.

Accounts created by the earlier failed requests already exist and should sign in or use the password-reset flow instead of registering again. No plaintext password was recovered or logged.

## Local rollout and rollback

Runtime source checkout: `D:/lumi-gap`. Changes are also preserved in the task worktree. Existing differences in runtime onboarding/types were retained using a targeted port, not a whole-repository overwrite.

Backups: `C:/Users/tdinh/.codex/local-backups/registration-20261113`.
Prior images: `lumigap-backend:before-registration-20261113`, `lumigap-web:before-registration-20261113`.
No application DB migration, Git commit, push or production deployment was performed.
