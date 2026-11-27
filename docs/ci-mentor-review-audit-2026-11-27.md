# Mentor review CI audit — 27 November 2026

Scope: the mentor review worktree, based on commit `4205b9d6`.

## Fixes

- Resolve the missing documentation IDs, trend response imports, mentor profile fields and topic row types that blocked TypeScript checks.
- Restore the literature matrix and limitations destinations, keep overdue review claims actionable, and display AI feedback only for its exact manuscript revision.
- Redirect legacy academic support links into the appropriate workspace while preserving invitation context. Remove duplicate rubric explanations, manual replacement assignment controls and empty screening criteria notices.
- Send approved local evidence files relative to their validated directory. Express otherwise treats an ancestor such as `.codex` as a hidden file and rejects legitimate downloads. Authentication, ownership checks and private cache headers still apply.
- Separate PDF worker startup and parsing deadlines, preserving size, page and memory limits.
- Recover notification outbox records in stable pages instead of stopping after 100 records. The regression test seeds 101 older records, including equal creation timestamps, before exercising the real worker with email delivery disabled.
- Update obsolete tests for explicit mentor consent, final screening outcomes, scoped contribution evidence and retired percentage allocation writes. Tests continue to assert that unauthorized writes fail and create no approval decisions.

## Validation

The full baseline runs exposed 39 web test failures and 7 backend test failures. The failing suites were corrected and rerun. The following are targeted rechecks, rather than a claim that a second full suite run was performed:

| Check | Result |
| --- | --- |
| Web, backend and shared types TypeScript checks | Passed |
| Web and backend production builds | Passed |
| PostgreSQL runtime boundary | 4 tests passed |
| Original failing backend suites | 7 files, 127 tests passed |
| Web failed-suite recheck | 11 files passed; remaining overdue-card failure passed in the subsequent check below |
| Screening cards, screening workspace and locale coverage | 3 files, 83 tests passed |
| Submission details, score comparison and locale coverage | 3 files, 35 tests passed, including two new revision-specific AI regressions |
| Lecturer verification and outbox recovery | 40 tests passed |
| Complete CI integration command, with all three integration flags enabled | 8 files, 168 tests passed |
| ESLint on changed TypeScript files | Passed |
| Whitespace and merge-conflict check | Passed |

All 168 Prisma migrations replayed successfully on dedicated local test databases. Integration uses a separate database ending in `_test`, Redis database 15 and disabled email delivery. Application records were not reset.

## Limits and follow-up

- `workflow-source.ts` registers existing UI copy and reuses existing translations when available. Many Vietnamese strings remain explicit source-language fallbacks in English and inherited dictionaries. Key coverage passing does **not** mean translation into every supported language is complete. Existing curated translations take precedence.
- Authenticated browser E2E, Flutter tests and production deployment were not validated in this audit.
- Existing Browserslist age and large lazy-chunk warnings do not fail the production build.
- GitHub Actions currently runs for pull requests targeting `main` and pushes to `main`. Uploading a feature branch alone does not start that workflow or establish a green remote CI result.
- The localhost checkout at `D:\lumi-gap` contains additional ongoing development. Compatible fixes were applied there separately; this branch contains the changes from the attached mentor review worktree.
