# Academic Profile and Forum migration

The migration is intentionally staged. `User.role` remains backward-compatible while new accounts use `user`; `admin` remains the only global privileged role. Academic identity lives in `User.academicProfileType` plus the one-to-one `academic_profiles` document.

## Preview

From `apps/backend` run:

```powershell
pnpm academic-profiles:migrate
```

This is a read-only dry run. Review the listed legacy `reviewer` and `moderator` accounts manually because those roles need entity-specific evidence before they can be converted into review assignments or community memberships.

## Apply

```powershell
pnpm academic-profiles:migrate --apply
```

The script is idempotent. It creates missing academic profiles as `SELF_DECLARED`, mirrors legacy `student`, `researcher`, and `lecturer` values into `academicProfileType`, and changes those legacy global roles to `user`. It preserves `admin` and does not automatically migrate or elevate `reviewer`/`moderator` accounts.

No legacy Lecturer is marked `VERIFIED`. Verification requires the explicit request and administrator decision workflow.
