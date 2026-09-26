# Academic Profile migration

The migration is intentionally non-destructive and idempotent.

## Safety rules

- Dry-run is the default: `pnpm --filter backend academic-profiles:migrate`.
- Apply only after reviewing the inventory: `pnpm --filter backend academic-profiles:migrate -- --apply`.
- Existing `student`, `researcher`, and `lecturer` account roles are preserved for backward-compatible guards.
- A missing `academicProfileType` is mirrored from a legacy academic role.
- Missing one-to-one AcademicProfile records are created with `SELF_DECLARED`.
- No Lecturer is made `VERIFIED` merely because their account role is `lecturer`.
- Reviewer/moderator accounts are inventory-only because their future contextual role cannot be inferred safely.
- First-MVP profile fields are copied into the production-oriented shape without deleting the legacy fields.

Run the migration more than once safely; conditional updates and `$setOnInsert` prevent duplicate profiles and role rewrites.

## Institutional email verification

Seed the initial trusted-institution registry with:

```bash
pnpm --filter backend academic-profiles:seed-institutions
```

The seed is idempotent and currently registers the approved FPT University domains. Add future institutions through reviewed seed data or an admin-only workflow; never infer trust from an `.edu` or `.edu.vn` suffix.

For local development, `EMAIL_DELIVERY_MODE=log` writes the one-time code to the backend console. This mode is rejected in production. Production must use `EMAIL_DELIVERY_MODE=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and a separate `ACADEMIC_EMAIL_OTP_SECRET` of at least 32 characters.

OTP codes expire after 10 minutes, are limited to five attempts, and are stored only as an HMAC. The API never returns the code. Changing the institutional email invalidates active challenges, the previous verification timestamp, and related verification evidence.

## Lecturer policy

Lecturer verification is deterministic:

```text
verified institutional email
AND one validated strong signal:
  - trusted SSO faculty assertion, or
  - ORCID affiliation match, or
  - trusted institution employment API confirmation
```

A trusted domain, manually entered ORCID, GitHub profile, or selected Lecturer profile type cannot independently grant `VERIFIED`. Requests without a validated strong signal remain `PENDING` for admin review.

## Public profile URLs

Owners can claim one current lowercase handle such as `nguyendinhthanh-it`, producing the clean public URL `/nguyendinhthanh-it`. Handles use 3–40 ASCII letters, digits and single hyphens, and reserved application route names are blocked. MongoDB's unique handle registry prevents two users from claiming the same URL.

Changing a handle keeps the previous handle registered to the same user. Legacy `/u/:handle`, previous-handle, and `/academics/:userId` links continue to resolve and redirect to the current clean URL. The public handle is independent of Lecturer verification status.

Production hosting must keep the SPA fallback enabled so an initial request to `/<handle>` serves `index.html`; the client then resolves the public profile. Keep the backend reserved-handle list synchronized whenever a new top-level application route is introduced.

To prevent handle squatting, a user can request at most five URL changes per day and claim at most twenty distinct handles. Reusing one of their earlier handles does not consume another claim.

## Profile cover images

Student, Researcher, and Lecturer profiles can use the same public cover-image feature. Owners upload or remove the cover from their profile; the stored object key is private and public profile DTOs expose only a versioned API URL.

- Accepted input: JPEG, PNG, or WebP, at most 5 MB and at least 600 × 200 pixels.
- The backend decodes the bytes with Sharp, rejects SVG or malformed input, applies EXIF orientation, strips metadata, and writes a 1600 × 480 WebP.
- Local development stores covers below `apps/backend/uploads/profile-covers/<userId>/`.
- With `STORAGE_PROVIDER=r2`, the same object is kept in the configured R2 bucket and the public endpoint issues a short-lived signed redirect.
- Replacing or removing a cover deletes the previous object on a best-effort basis and records an audit event.
- Uploads are authenticated, owner-scoped, and limited to twenty per account per day. Reading a cover is public only while the associated academic account exists and remains active.

The profile response includes `coverUrl` with a cache-busting version. Clients should prefix relative cover URLs with their configured API base URL rather than persisting storage URLs.
