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

## Community behavior

- Public and private communities are discoverable in `/communities`; private discussion content remains membership-gated.
- Public joins become active immediately. Private joins create a pending request that an owner or moderator can approve or decline. Declined users may request again; banned users may not.
- Students can join communities. Researcher and Lecturer academic profiles can create them; global moderators and administrators can also create them.
- Owners and moderators can edit community details, rules and visibility. Moderators can manage regular members. Only the owner or an administrator can assign or remove moderators.
- Owners cannot leave until ownership-transfer support is added. Other active members can leave, and pending applicants can cancel their request.
- Forum posts can target a community only when the author has an active membership. The post composer therefore lists only communities the current user has joined.

Community API responses expose viewer-specific membership state, `canManage`, and `contentRestricted`. They do not expose the internal `ownerId` on public list or detail responses.
