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

The Client ID/Secret belong to the LumiGap deployment and are configured once by
its operator. Ordinary users do not create an app, enter these secrets or generate
a PAT: they use **Kết nối GitHub**, approve access on GitHub and return to the
manuscript. The optional PAT field stays collapsed under Advanced.

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

Verified 2026-10-20: 113 manuscript frontend tests, nine PostgreSQL/Redis OAuth
persistence tests, nine crypto/HTTP/schema/route tests and four PostgreSQL runtime
boundary tests passed (135 total). Shared-types/backend/web builds, targeted ESLint
and scoped whitespace checks passed. The additive migration was applied locally;
backend/web images were updated and `/ready` confirmed PostgreSQL and Redis.

A disposable browser project confirmed the Vietnamese connection dialog and its
explicit unconfigured state, with PAT entry collapsed under Advanced. The actual
local server has no registered GitHub App credentials, so the Connect action is
disabled until the administrator supplies the configuration. No real account was
linked and no repository was published during verification.

### Recheck 2026-10-30

The user's actual manuscript on port 8080 displays **Kết nối GitHub** with the
manual token fallback collapsed. The running backend has no `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET` or `GITHUB_APP_SLUG` configured, so authorization is correctly
disabled. The operator confirmed that a GitHub App already exists and will supply
the backend configuration. Do not substitute fake credentials or claim a completed
live authorization until those values are loaded and a user approves on GitHub.

Executed again: nine backend crypto/HTTP/schema/route tests and eleven frontend
callback/connection/connected-client/Git transport tests passed (20/20). These
checks use synthetic provider responses; PostgreSQL OAuth persistence tests were
not rerun in this recheck. No manuscript content, GitHub permission or repository
was changed. No new OAuth implementation was necessary.

After setting the server environment, recreate the backend with the same Compose
overrides used to launch it (including the isolated compiler configuration); a
plain container restart does not reload `env_file`. Refresh the manuscript and
open GitHub to load the configuration status. The registered user authorization
callback must exactly match `http://localhost:8080/integrations/github/callback`.

Later on 2026-10-30, at the operator's explicit request, the supplied Client ID,
Client Secret, app slug and frontend callback URL were written to the ignored
local `.env`, after a local backup. The backend was recreated with the existing
compiler-network override. Presence of all four settings was verified inside the
running container without printing the secret; `/ready` and the frontend callback
page returned HTTP 200. No RSA private key was stored or used by this user OAuth
flow. The registration's Callback URL still needs to match the frontend URL above;
an actual GitHub authorization/exchange has not been performed in this recheck.
Credentials disclosed in chat must be revoked/rotated in GitHub and replaced
locally; do not copy them into this document or version control.

![GitHub setup state in the verified dialog](assets/manuscript-editor/github-connection-setup.png)

References: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[refresh rotation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).


## Manuscript GitHub tab (2026-10-30)

### Team model

- One manuscript has one shared repository and branch, stored in its remote binding.
- A GitHub connection belongs to a LumiGap user. Connecting or disconnecting it does not grant or revoke GitHub access for other members.
- One person coordinating synchronization is sufficient. Team members who only write in LumiGap need no GitHub connection. Additional editors may connect their own accounts; there is no project-wide shared credential or mandatory connection count.
- Synchronizing requires manuscript write permission and the project's existing source export policy. Pushing additionally requires the caller's own GitHub Contents write permission. GitHub read-only access can receive changes.
- Under the current policy, any eligible editor can select or change the shared target. The UI requires explicit confirmation before applying a plan targeting a different repository or branch. This is a coordination recommendation, not a new exclusive coordinator role.

### Interface and workflow

1. Open the **GitHub** tab beside **PDF preview**, or the GitHub toolbar action. Read-only members can view the shared binding.
2. Connect a personal GitHub account. The saved-source preparation runs before OAuth redirect. Returning from OAuth selects the GitHub tab, without automatically synchronizing.
3. Choose an authorized repository and source branch. App installation and GitHub repository permissions remain managed by GitHub.
4. **Inspect synchronization** creates/reuses a recovery snapshot and compares local source, remote source and the last shared baseline. This step does not push or apply incoming source.
5. Review counts and per-file changes. Resolve every conflict explicitly. A different existing shared target requires confirmation.
6. **Pull merged source** applies the chosen merge in LumiGap. **Push merged source** applies the chosen merge locally and sends it to GitHub. These operations preserve the existing merge semantics: receiving does not discard local-only changes, and sending includes the resolved merge.
7. Recheck local source revision, GitHub branch head and binding revision before applying. Conflicting concurrent changes require inspection again. A successful operation updates the shared baseline and commit link. Compile after receiving source.

The tab keeps an ongoing transfer mounted when changing editor panels. It clears a manually entered token and a stale comparison after leaving the tab once the transfer finishes. Closing the page can still interrupt a transfer; existing snapshots and non-force Git commits provide recovery, and errors instruct the user to inspect again. Local database updates and GitHub commits are separate systems, not one atomic transaction.

### Verification scope

Tests cover reader visibility, OAuth return selecting the tab, keyboard tab navigation, comparison without remote/local source application, explicit target-change confirmation, unresolved conflicts, GitHub read-only access, stale local revision/remote head/shared binding, revoked manuscript write access and panel switching during a transfer. Live GitHub authorization and repository writes require an authorized user account and are not simulated against a real manuscript.
