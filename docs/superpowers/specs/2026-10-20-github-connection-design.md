# GitHub App connection for manuscript synchronization

Extend existing import/export and explicit two-way sync; retain conflict review,
snapshots, non-force branch updates and project authorization. GitHub connection
is personal authorization, not a LumiGap sign-in or a team-shared credential.

Use GitHub App OAuth authorization-code + S256 PKCE. The configured callback is
the frontend `/integrations/github/callback`. It posts the code/state through the
existing authenticated API, bound to the initiating user and session. State is
random, hashed in Redis, single-use and expires after ten minutes. A connection
revision invalidates older flows and prevents a late callback reviving a removed
connection. Return paths are restricted to manuscript/project routes.

Encrypt access/refresh tokens in PostgreSQL with AES-GCM and per-user associated
data. No provider tokens reach browser storage or callback URLs. Refresh under a
database row lock; use CAS when removing invalid credentials. The connected client
proxies only validated Git object operations to fixed GitHub HTTPS endpoints,
with bounded bodies, timeout and no redirects. Provider authorization failures
must not log the user out of LumiGap. Disconnect clears local credentials and
attempts upstream token revocation; installation removal stays on GitHub.

UI prioritizes Connect GitHub, authorized repository selection, connection state
and disconnect. Keep PAT as an explicit advanced fallback. Registration/client
secret/callback configuration is deployment work: no fabricated credentials or
claims of authenticated live verification without a registered GitHub App.
