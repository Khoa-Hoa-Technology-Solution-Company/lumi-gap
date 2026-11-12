# Submission workspace fixes — 6 November 2026

## Scope and findings

The reported entry point was the project's `tab=submissions` workspace. The original working directory contained substantial uncommitted screening, mentor and submission UI work.

Regression tests reproduced three failures in that working copy: loading/recovering an uncached detail changed React's hook order, and a descending version history selected the oldest version. Text revision controls also posted to the PDF-only revisions endpoint.

The working copy was repaired, and the submission fixes were ported to a separate branch based on `origin/main` (`5b7bde8`). This branch retains main's existing submission creation, human review controls and permissions. The unfinished mentor assignment/feedback expansion and other unrelated working changes were left in the original directory.

`needsMyStatement` is already declared on main; no shared-type change is needed in this branch.

## Resulting behavior

- Detail loading and error recovery keep a stable hook order. Paragraphs are calculated without a conditional hook.
- The content viewer selects the explicit selection, backend current revision, or highest revision number, in that order. It does not rely on array ordering.
- PDF downloads appear only after revision metadata confirms a PDF exists.
- PDF revisions use the existing multipart endpoint. Text revisions use the existing JSON versions endpoint with `expectedRevisionNumber` to reject stale writes.
- Empty text, short change summaries and empty PDFs are rejected. A failed text revision retains its inputs for retry. Both revision modes share the pending state.
- Submission reads have a 20-second timeout per request and receive TanStack Query cancellation signals. Existing read retry behavior remains available. Mutations are not automatically retried.
- Successful text revisions invalidate detail, history, submission lists and existing task/review opportunity query keys.

## Verification

On the final branch:

- 59 web tests passed across six files: project submission routing/access, cold detail loading, error recovery, current revision selection, text/PDF separation, failed save retry, PDF metadata gating, API cancellation/timeouts, content comparison and workspace navigation.
- 18 backend unit tests passed across project submission access, pre-review input and academic review rules. These use mocked dependencies, not a live database.
- Shared types compiled, web `tsc -b` passed, and the production web build passed using the installed Vite 6.4.2 dependency.
- `git diff --check` passed.

Browser verification of the repaired original component used synthetic data and a delayed detail response. The current version displayed successfully with no console error. It did not create live manuscripts, review requests, AI jobs or notifications. The logged-in live account was a mentor, so its restricted project workspace did not verify the student/author path end to end.

Docker initially returned management API errors. It subsequently recovered: the live web and backend readiness endpoints returned 200. The final branch's web build was copied into the existing web container, preserving old hashed assets and backing up the previous index. The served index matched the build, and all eight referenced entry assets returned 200. No database migration or backend image replacement was required.

This audit covers the submission changes above. It is not a claim that every project feature or live submission mutation has been tested.
