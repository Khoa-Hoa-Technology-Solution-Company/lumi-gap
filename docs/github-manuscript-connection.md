# GitHub App connection for manuscripts

The primary flow is **Manuscripts → GitHub → Kết nối GitHub → approve on GitHub →
return to the same manuscript → select an authorized repository/branch → inspect
and explicitly pull/push**. The dialog reopens after a successful callback. Manual
PAT access remains under **Nâng cao**. Existing snapshots, file-level conflict
choices and non-force branch updates remain in use.

This connection authorizes manuscript transfers. It does not sign in to LumiGap,
grant project membership, or share a project owner's credentials with teammates.
Every member connects their own GitHub account. The selected repo/branch binding
is manuscript data; credentials are private to each LumiGap user.

## Register and configure once per deployment

Register a **GitHub App** in the GitHub account/organization that operates LumiGap.
This registration must be done by an administrator with that account's access.

1. Set the Homepage URL to the public LumiGap web origin.
2. Set a user authorization **Callback URL**:
   - Local Compose: `http://localhost:8080/integrations/github/callback`.
   - Native web dev: `http://localhost:3000/integrations/github/callback`.
   - Production: `https://YOUR_WEB_HOST/integrations/github/callback`.
   Use the frontend origin/path, not the backend OAuth completion endpoint.
3. Request repository **Contents: Read and write**. Metadata read is provided by
   GitHub. Do not request Actions, Workflows, administration or organization write.
4. Keep expiring user access tokens enabled. The authorization request also uses
   `offline_access` to opt into expiration. Device flow is not needed.
5. Disable Webhooks unless separately implementing webhook delivery. This feature
   syncs only on explicit user action. Leave automatic OAuth authorization during
   installation off: LumiGap starts a session-bound PKCE flow itself.
6. Generate a Client Secret on GitHub and provide these backend environment
   variables through the deployment secret configuration. Never commit real values:

   ```dotenv
   GITHUB_CLIENT_ID=YOUR_GITHUB_APP_CLIENT_ID
   GITHUB_CLIENT_SECRET=YOUR_GITHUB_APP_CLIENT_SECRET
   GITHUB_APP_SLUG=your-lumigap-app-slug
   GITHUB_CALLBACK_URL=http://localhost:8080/integrations/github/callback
   # Optional dedicated encryption secret: at least 32 random characters.
   GITHUB_CONNECTION_ENCRYPTION_KEY=YOUR_RANDOM_SERVER_SIDE_ENCRYPTION_SECRET
   ```

   If the dedicated encryption key is omitted, an independently derived key uses
   the existing `INTERNAL_SERVICE_KEY`. Rotating either effective encryption key
   requires users to reconnect. Credentials cannot be migrated by changing keys.
7. Install the app on the repositories the user/team wants to synchronize. Choose
   specific repositories when possible. Users can open **Quản lý quyền repository
   trên GitHub**, install/configure access, return and reload the repository list.
8. Apply migrations with `pnpm --filter backend db:migrate:deploy`, generate Prisma
   and rebuild backend/shared-types/web. Recreate the backend to load updated env.
   Local Compose already reads root `.env`; production must inject these variables.

`configured: false` is returned when Client ID/Secret are absent. The UI explains
the missing setup and disables OAuth while retaining the PAT fallback. No keys or
registration are fabricated. App ID/private key are not needed for this user-token
flow; installation tokens/background bot access are not implemented.

## Security and lifecycle

- Authorization uses a 256-bit random state, 10-minute Redis lifetime, single-use
  compare-and-delete, session/user binding and S256 PKCE. The callback frontend
  removes code/state from its URL and completes through an authenticated POST.
  A changed/revoked LumiGap session cannot complete the original connection.
- PostgreSQL stores AES-256-GCM ciphertext with user-bound associated data. Access
  and refresh tokens never appear in API responses, frontend storage or URLs.
  A connection revision invalidates old flows and disconnect races. Refreshes
  serialize across API instances using a PostgreSQL row lock.
- Connected Git requests use a narrow backend proxy to fixed HTTPS GitHub origins,
  rejecting redirects, arbitrary endpoints, force-push, unsupported source paths,
  tags and extra request fields. Every operation uses the current user's token.
  Calls have a 15-second timeout and bounded response/body sizes.
- Repository enumeration uses GitHub's authenticated user repository API, which
  applies the user token/app's access. Requests beyond that grant fail on GitHub.
  No repository is created, published or pushed merely by connecting an account.
- Invalid/revoked provider tokens clear the GitHub connection and return a 403;
  they do not invalidate the LumiGap login. Temporary GitHub outages retain saved
  credentials for retry. GitHub branch protections are still enforced.
- Disconnect clears local credentials before attempting upstream token revocation.
  If GitHub is unavailable, the UI explicitly asks the user to revoke LumiGap in
  GitHub settings. Disconnect does not uninstall the app or delete repositories.

## API

All endpoints require LumiGap bearer authentication and return private/no-store
responses under `/api/v1/integrations/github`:

| Method/path | Purpose |
| --- | --- |
| GET `/` | Safe configuration/connection status |
| POST `/start` | Create session-bound authorization URL; validated `returnTo` |
| POST `/complete` | Complete callback using `code` and `state` |
| GET `/repositories?page=1` | Paginated authorized repository choices |
| POST `/repository` | Validated source Git-object operations with saved token |
| DELETE `/` | Disconnect current user's saved credential |

## Verification

Automated checks cover encryption/tampering, callback state/session/replay,
superseded and disconnected callbacks, concurrent refresh rotation, expired and
revoked credentials, local disconnect during upstream outages, strict proxy
boundaries, authenticated HTTP routes, UI repository selection, callback
StrictMode handling and the existing PAT transport. Provider responses in these
checks are synthetic; persistence checks use disposable PostgreSQL and random
short-lived Redis keys. Live authorization requires the app registration above.

References: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[refresh rotation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).
