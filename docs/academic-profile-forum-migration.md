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

Permissions follow the matrix in `.herdr/specs/research-communities.md` §1.2.

- Public and private communities are discoverable in `/communities`; private discussion content remains membership-gated, and the member roster of a private community is visible to its active members only.
- **Proposing a community.** Administrators create communities directly (`ACTIVE`). A lecturer or researcher whose academic role is `VERIFIED` (`AcademicProfile.roleVerificationStatus`) files a proposal that starts as `PENDING_APPROVAL`. A self-declared lecturer or researcher cannot propose. Students cannot. Eligibility is computed on the server (`canProposeCommunity` in `/auth/me`); clients never derive it from a role. Each user may have at most 3 proposals waiting, and a name may not duplicate a live or pending community (case, accent and spacing are ignored).
- **Review.** Only administrators approve or reject. Rejecting requires a note, which the proposer sees. A rejected proposal can be edited by its owner and resubmitted. `PENDING_APPROVAL` and `REJECTED` communities are visible to the owner and administrators only; nobody can join or post in them. Administrators are notified of new proposals; owners are notified of decisions.
- **Membership.** Public joins become active immediately. Private joins create a pending request that the owner or a moderator can approve or decline (they are notified of new requests, and the requester of the decision). Declined users may request again; banned users may not join. Joining never downgrades an active member.
- **Roles.** The proposer holds the `owner` membership (one per community). Owners and administrators edit details, rules, topics and visibility, assign or remove moderators, and transfer ownership to an active member. Moderators manage regular members and hide content. Only administrators archive or restore a community, which makes it read-only.
- **Leaving.** Owners must transfer ownership before leaving. Other active members can leave, and pending applicants can cancel their request.
- **Counters.** `memberCount` is recomputed from active memberships under a row lock on every membership change, so concurrent joins and leaves cannot drift it.
- Forum posts can target a community only when the author has an active membership. The post composer therefore lists only communities the current user has joined.
- **Research data.** A community page lists papers and shareable research gaps matched to its topics with PostgreSQL full-text search (cached for one hour, never an LLM call), and offers an on-demand weekly discussion summary that runs in the `community-summary` worker and is cached in Redis.

Community API responses expose viewer-specific membership state, `canManage`, and `contentRestricted`. They do not expose the internal `ownerId` on public list or detail responses.
