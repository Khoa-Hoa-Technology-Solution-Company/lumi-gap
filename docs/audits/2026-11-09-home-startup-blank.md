# Home startup recovery, 2026-11-09

The reported localhost:8080/home screen initially remained on a route-loading fallback and later appeared empty. Backend readiness passed initially. During diagnosis Docker CLI calls returned HTTP 500, and direct static CSS requests timed out with no response. Nine optional workers had been restarted along with the full stack. They were temporarily stopped under the user's existing authorization; Docker and static-file requests recovered. No volume or application records were deleted or changed.

After recovery, 55 home/layout assets were checked against the built files: all returned matching content. No browser JavaScript exception was captured, so this investigation does not establish a specific React crash or an out-of-memory kill. The route/layout loading fallbacks did contain only screen-reader text, leaving a visually blank screen while lazy-loaded code was pending. The real authenticated home page subsequently rendered its search interface and library content in the browser.

## Changes

- Shared `PageLoading` replaces the invisible route and main-layout loading fallbacks. It immediately shows translated loading text and skeletons, then offers a reload action after 12 seconds. Its timer is removed when loading ends.
- `AppErrorBoundary` surrounds the application providers. A render or rejected lazy-import error now produces a recovery action rather than unmounting into an empty root. Internal diagnostic details stay out of the visible message. Reload does not erase the sign-in session.
- Existing route declarations, authorization, academic workflows and UI changes were retained.

## Verification

- 31 focused tests passed across the recovery boundary, loading state, home search and guest home suites.
- Web TypeScript checking and scoped ESLint passed.
- Production build passed. The web container was updated through the existing lightweight local packaging workflow; the live entry HTML matched the built output and backend `/ready` returned HTTP 200.
- The authenticated `/home` page was reloaded after the final deployment and visibly rendered its research heading, search controls and navigation. Screenshot: `home-restored-20261109.png` in this chat's visualization directory.

The nine optional workers remain stopped. Running a full `docker compose up` starts them again; this UI fix does not change Compose defaults or claim to repair Docker Desktop itself. Backend, PostgreSQL, Redis and the notification worker remain running. No production deployment is involved.
