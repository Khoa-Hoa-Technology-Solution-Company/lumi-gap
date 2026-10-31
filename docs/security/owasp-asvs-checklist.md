# OWASP Security Hardening & ASVS 5.0.0 Compliance Report — LumiGap

**Document Version:** 1.0.0  
**Target System:** LumiGap Collaborative Academic Research & LaTeX Platform  
**Standards Covered:**
- **OWASP Top 10:2025**
- **OWASP Application Security Verification Standard (ASVS) 5.0.0**
- **OWASP Cheat Sheet Series** (Authorization, Input Validation, File Upload, SSRF, REST Security)
- **OWASP ZAP** Penetration Testing Readiness

---

## 1. Executive Summary & Security Model

LumiGap is an academic collaboration and scientific research platform hosting confidential research materials, unpublished manuscripts, research gaps, literature evidence matrices, and attribution histories.

### Core Security Tenets
1. **Confidential Research Integrity:** Unpublished manuscript drafts, LaTeX sources, compiled PDFs, and literature reviews remain isolated strictly within project boundaries.
2. **Export Sovereignty:** Research assets can only be exported (ZIP bundle, raw source download, or GitHub synchronization) when explicitly permitted by the project's security policy (`exportPolicy: ALL_MEMBERS` vs `OWNER_ONLY`).
3. **External Sync Confidentiality:** Private research projects cannot leak manuscript code to public GitHub repositories. Mutations without verified project identifiers are strictly rejected.
4. **Append-Only Evidence Ledger:** Research attribution events and security audit logs are strictly append-only. Project leaders and collaborators cannot manipulate or delete historic scientific contributions.
5. **Real-time Session Revocation:** When project membership is revoked, active collaboration WebSockets and edit streams are severed immediately.

---

## 2. OWASP Top 10:2025 Threat Mapping & Defenses

| Threat Category | LumiGap Defense Implementation | Verification Test File |
|---|---|---|
| **A01:2025 — Broken Access Control** | • `withWorkspace` enforces row-level locks and verifies active membership / ownership.<br>• `assertCanExportProjectSource` enforces `exportPolicy` on downloads, ZIP exports, and GitHub pushes.<br>• Cross-project references rejected by `assertWorkspaceLink`.<br>• Inactive / suspended accounts blocked by `assertActiveProjectAccount`. | `owasp-security.test.ts`<br>`workspace-collaboration.persistence.test.ts`<br>`authorization.middleware.test.ts` |
| **A02:2025 — Cryptographic Failures & Data Exposure** | • GitHub tokens encrypted at rest with AES-256-GCM (`sealGithubToken` / `openGithubToken`).<br>• Public project API (`getPublicProjectById`) strips members, papers, activities, and owner identities.<br>• Sensitive fields sanitized from audit logs (`sanitizeMetadata`).<br>• `Cache-Control: private, no-store` on all authenticated endpoints. | `owasp-security.test.ts`<br>`github.crypto.test.ts`<br>`project.service.ts` |
| **A03:2025 — Injection & Path Traversal** | • `manuscriptPath` strictly blocks `../`, `./`, invalid symbols, and `lumigap-build`.<br>• `readSourceZip` blocks zip slips, symlinks (`0xa000`), and zip bombs.<br>• AI LaTeX engine (`validateManuscriptProposal`) blocks command injection (`\write18`), shell escapes, and macro overrides.<br>• Isolated compiler URL with dedicated service key. | `owasp-security.test.ts`<br>`manuscript-import.test.ts`<br>`manuscript-ai-policy.test.ts` |
| **A04:2025 — Insecure Design** | • Overleaf-style bidirectional GitHub synchronization with safety locks.<br>• Git commits are decoupled from scientific contribution calculations (evidence ledger is primary).<br>• Project privacy enforced before external repository binding. | `owasp-security.test.ts`<br>`manuscript-github-sync.workflow.test.ts` |
| **A05:2025 — Security Misconfiguration** | • `helmet()` enforces CSP, HSTS, X-Content-Type-Options: nosniff, Referrer-Policy.<br>• CORS restricted to explicit origin allowlist (`isAllowedCorsOrigin`).<br>• Rate limiters applied to auth, connections, and compiler routes.<br>• `x-powered-by` disabled. | `app-cors.test.ts`<br>`rate-limit.test.ts`<br>`manuscript.routes.test.ts` |
| **A06:2025 — Vulnerable Components** | • Monorepo dependencies locked via pnpm.<br>• Sharp and fflate used for memory-safe image/archive parsing.<br>• PostgreSQL 16 & Prisma 7 modern driver architecture. | Monorepo CI audit |
| **A07:2025 — Identification & Authentication** | • RS256 JWT access tokens (15m expiry) + rotated refresh tokens in PostgreSQL.<br>• Purpose tokens for WebSocket collaboration tickets (`tokenService.signPurposeToken`).<br>• Revocation via `member-revoked` event closes active WebSockets with status code 4401. | `token.service.test.ts`<br>`manuscript-collaboration.test.ts`<br>`owasp-security.test.ts` |
| **A08:2025 — Software & Data Integrity** | • CRDT vector clock dependency validation (`validateDocument`).<br>• SHA-256 checksums recorded for all manuscript snapshots, downloads, and exports.<br>• GitHub fast-forward push enforcement (`force: false`). | `manuscript-source.ts`<br>`owasp-security.test.ts` |
| **A09:2025 — Security Logging & Monitoring** | • Immutable `researchEvidenceEvent` and `auditLog` tables.<br>• Role-scoped visibility (`getProjectSecurityOverview` hides `OWNER_ADMIN` events from non-owners).<br>• No deletion endpoint in database or API for historical evidence. | `owasp-security.test.ts`<br>`research-ledger.service.ts` |
| **A10:2025 — Server-Side Request Forgery (SSRF)** | • `provider-http.ts` validates IP ranges, blocking private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254) and IPv6 loopbacks.<br>• DNS pinning against rebinding attacks.<br>• Protocol restricted to http/https. | `provider-http.test.ts` |

---

## 3. OWASP ASVS 5.0.0 Verification Matrix

### V1 — Systems Architecture & Threat Modeling
- [x] **1.1.1 Project Isolation:** Every workspace query is bound to a verified `projectId` with PostgreSQL transaction locks.
- [x] **1.1.2 Trust Boundaries:** Separate trust zones for Web UI, Backend API, PostgreSQL/Redis, and isolated LaTeX Compiler.

### V2 — Authentication
- [x] **2.1.1 Token Management:** Cryptographically signed RS256 access tokens and family-tracked refresh tokens.
- [x] **2.2.1 Credential Protection:** Passwords hashed with Argon2id; GitHub tokens sealed with AES-256-GCM.

### V3 — Session Management
- [x] **3.1.1 Session Termination:** User logout or account suspension immediately invalidates refresh tokens and blocks subsequent access token refreshes.
- [x] **3.2.1 Realtime Collaboration Revocation:** Project member removal emits `member-revoked`, causing `manuscript-collaboration.ts` to immediately close active WebSockets with 4401 status.

### V4 — Access Control
- [x] **4.1.1 Direct Object Reference (IDOR):** Inaccessible project resources return 404 Not Found rather than 403 to prevent enumeration of confidential projects.
- [x] **4.1.2 Source Export Control:** `assertCanExportProjectSource` checks project `exportPolicy`. When set to `OWNER_ONLY`, non-owner members are forbidden from downloading raw source files, downloading ZIP bundles, or pushing to remote repositories.
- [x] **4.1.3 GitHub Target Visibility:** Private project manuscripts cannot be exported to public GitHub repositories.
- [x] **4.1.4 Reviewer Permissions:** Reviewers and mentors without write privileges are restricted to comments, reviews, and reading scoped materials.

### V5 — Malicious Input & Validation
- [x] **5.1.1 Path Traversal:** `manuscriptPath` blocks `..`, `.`, directory traversals, root slashes, and internal reserved prefixes.
- [x] **5.1.2 Archive Safety:** `readSourceZip` decompresses only allowed LaTeX source and figure extensions, validates local header signatures, checks uncompressed size limits, and detects symlinks.
- [x] **5.1.3 AI LaTeX Sanitization:** `validateManuscriptProposal` validates that AI-generated proposals do not inject executable macros (`\write18`, `\immediate`, markdown fences) or fabricate unauthorized numerical findings.

### V7 — Error Handling & Logging
- [x] **7.1.1 Sensitive Information Leakage:** Stack traces disabled in non-development environments; error messages sanitized.
- [x] **7.2.1 Security Audit Logging:** Downloads, exports, permission changes, membership joins/removals, and GitHub sync events logged with SHA-256 checksums and actor identities.
- [x] **7.2.2 Role-Based Log Visibility:** `OWNER_ADMIN` audit events are omitted from non-owner member audit overviews.

### V8 — Data Protection & Privacy
- [x] **8.1.1 Public Project Sanitization:** `project.service.ts:hydrate` ensures that retrieving a public project summary strips internal members, private papers, activities, and owner IDs.
- [x] **8.2.1 HTTP Cache Controls:** `Cache-Control: private, no-store` enforced on all protected endpoints and GitHub API calls.

### V10 — Malicious Code / Compiler Isolation
- [x] **10.1.1 LaTeX Execution Isolation:** LaTeX compilation is offloaded to a designated, isolated worker microservice (`MANUSCRIPT_COMPILER_URL`) with restricted memory and CPU limits.

### V12 — File & Resource Handling
- [x] **12.1.1 Content Disposition:** Raw file downloads and ZIP exports set `Content-Disposition: attachment; filename="..."` and `X-Content-Type-Options: nosniff`.
- [x] **12.1.2 PDF Sandbox:** Compiled PDF preview endpoints enforce `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`.

---

## 4. Automated Security Verification Suite

An automated Vitest security verification suite is located at:
`apps/backend/src/modules/authorization/__tests__/owasp-security.test.ts`

### Test Suite Execution Summary
- **Total Test Cases:** 33 automated scenarios
- **Status:** 100% Passed
- **Test Categories:**
  1. Access Control & Export Policy Enforcement (4 tests)
  2. Cross-Project Resource Boundary & IDOR Prevention (3 tests)
  3. GitHub Integration Confidentiality & Export Hardening (4 tests)
  4. Path Traversal & File Upload Defenses (4 tests)
  5. LaTeX AI Operation & Injection Defenses (3 tests)
  6. Real-time Collaboration Session Revocation (1 test)
  7. Security Audit Overview & Contribution Ledger Access (3 tests)
  8. Public Project Information Disclosure Hardening (1 test)
  9. Additional parameterized safety assertions (10 tests)

