# Research Forum redesign

## Audit and gap analysis

The live architecture is React 18 / Vite / React Router / TanStack Query, with an Express 5 TypeScript API and PostgreSQL / Prisma 7. There is no Next.js application to extend. The existing architecture is retained.

| Area | Existing LumiGap | Target / changes |
| --- | --- | --- |
| Taxonomy | Community table, required membership, group links | Category adapter over the same records; admin-managed public taxonomy; no membership needed |
| Topic list | Existing feeds, search, pagination, batched metrics; tall rows and reaction total | Flat Horizon-style rows, category + type + tags, opening-topic Helpful, shareable category URLs |
| Conversation | Flat replies, shared lazy composer, stable post numbers, infinite response chunks, native timeline | Preserve; category links, explicit Follow, compact identity |
| Research | Existing papers, DOI search, shareable gaps, formal evidence review | Preserve; verify gap ownership/project access on writes; reuse DOI metadata resolver |
| Moderation | Reports, locks, hiding/restoring, pinning, moving, removals, appeals, copyright, audit, scoped assignments | Preserve existing Trust & Safety; category admin reuses moderator assignments |
| Identity / notification | Shared auth, academic profiles, persisted follow levels and notifications | Reuse, no duplicate systems |

## Reference

Studied [Discourse](https://github.com/discourse/discourse), its topic query and topic-list components, [Meta Discourse](https://meta.discourse.org/latest), and [Hugging Face Forums](https://discuss.huggingface.co/). Adopt topic scanning, category/tag separation, meaningful activity ordering, continuous conversations and a shared composer. No Rails/Ember code or full application shell is copied.

## Persistence and compatibility

`Community.isForumCategory` marks public taxonomy records; `sortOrder` orders them. The six existing field slugs are migrated in place, preserving IDs, topic relations, assignments and audit history. Older uncategorized topics receive General Research when needed. Existing group data retains its access rules, but is excluded from forum discovery. Both `/forum/category/:slug` and `/forum?category=:slug` resolve to the same feed behavior. Canonical forum URLs use `category`; old `community` URL filters remain readable. The existing `communityId` storage and legacy API field remain compatibility aliases.

Category moderators are stored in the existing CommunityMembership assignment records, with assignedById, assignedAt and revokedAt. Academic role confers no moderation authority. Forum references, Helpful and accepted responses never update scientific confidence, evidence or gap validation.

## Delivered behavior

### Topic list and navigation

The existing LumiGap AppHeader is retained. Community opens `/forum`. The forum has its own Latest, Unanswered, Popular and Following navigation, public categories and fixed thread types. Canonical URLs use `feed`, `category`, `type`, `tag`, `q`, `page` and `pageSize`; combined filters preserve one another and reset pagination. Pagination remains server-backed with 20 topics by default and stable ID tie-breaks.

Rows show title, category, type, tags, an author/participant preview, replies, views, opening-topic Helpful and activity. Only pinned topics have an excerpt. The list queries an explicit compact selection and batches categories, academic authors, distinct visible participants, Helpful and follows. Full bodies, citation collections and reading statistics are loaded by the thread endpoint.

The visual pass follows Horizon's low-chrome discussion surface: the global feed has a compact heading and flat topic table, the selected-category feed adds a small tinted icon context, and the list no longer sits inside a rounded dashboard card. Desktop rows target a 92px rhythm with aligned Participants, Replies, Views, Helpful and Activity columns; mobile rows stack metadata and keep the feed horizontally scrollable. Sidebar rows are 36px with tighter sections and neutral inactive icons.

Latest uses meaningful visible topic/reply activity with pinned topics first. Unanswered uses the persisted visible reply count (excluding the opening post). Popular uses engagement and activity, without implying research validity. Following uses explicit persisted Watching/Tracking subscriptions from the existing notification model.

### Continuous conversations

The existing flat response stream, response chunks, stable post numbers and native sticky timeline remain. Reply-to-response persists a parent in the same topic and adds context without deep nesting. One lazy shared composer preserves drafts on failure and when minimized. Topic Follow/Unfollow is explicit; existing notification levels remain available. Opening posts and responses now have explicit Helpful controls connected to their separate persisted votes, alongside the existing emoji reactions. Failed votes retain the server-confirmed count and selection. Compact academic profiles, question-author acceptance, share, report and formal evidence review remain in place.

### Composer and research references

Category, thread type, title and body are the initial fields; citations, research context and tags are progressive actions. All four domain types remain system-defined. Paper discussions require a public paper; gap discussions require an accessible, explicitly shareable Candidate Research Gap. Access is validated on both create and edit, including project-owner access.

Paper and citation lookup support existing LumiGap papers and DOI resolution. Resolve produces a read-only metadata preview; Attach explicitly reuses the existing OpenAlex ingestion pipeline. Restricted papers cannot be revived through DOI or OpenAlex-ID lookup. Existing public-metadata quality rules remain: provider metadata without a sufficient abstract can be previewed but cannot be imported as an active public paper. Provider requests have a fixed host, a timeout and no redirects. DOI endpoints require authentication and are rate-limited.

The forum formatting toolbar no longer offers image insertion or file upload controls. Existing authored Markdown remains readable. Category participation requires no Join/Leave flow or membership.

## API and database

| Endpoint | Behavior / permission |
| --- | --- |
| `GET /forum/categories` | Public active categories; `all=true` is Admin-only |
| `POST /forum/categories` | Admin create |
| `PATCH /forum/categories/:id` | Admin edit, archive/restore and display order |
| `GET /forum/categories/:id/moderators` | Admin inspect scoped assignments |
| `PUT /forum/categories/:id/moderators/:userId` | Admin assign using existing membership records |
| `DELETE /forum/categories/:id/moderators/:userId` | Admin revoke with revocation timestamp |
| `GET /forum/tags` | Bounded public tag suggestions, excluding hidden/removed/group topics |
| `POST /forum/papers/doi/preview` | Authenticated metadata preview; no paper write |
| `POST /forum/papers/doi/attach` | Authenticated forum-write permission; existing ingestion |
| `GET /forum/posts?category=…` | Existing pagination, search and feeds with category alias |
| `POST /forum/posts` | Exactly one active category required; canonical `categoryId` or legacy `communityId` accepted |

Routes retain the existing `/api/v1` prefix. Migration `20261003000300_forum_categories` adds `is_forum_category`, `sort_order`, a public-category check constraint and a category-order index. It was applied to the local PostgreSQL database. Other environments should apply it through the existing `pnpm --filter backend db:migrate:deploy` workflow. Fresh seeds create the six category fields.

Category creation handles duplicate-slug races as conflicts. New-topic persistence locks and rechecks the category so archival cannot race a successful write. Moderator moves validate an active public destination and recheck under lock. Author edits cannot move categories. Category administration and moderator assignment retain audit events.

## Access and moderation

The existing Trust & Safety subsystem handles reports, hides/restores, locks/unlocks, pinning, moves, Admin removals, appeals and audits. Its Move selector now uses active forum categories. Assignments are scoped and revoked authority is checked server-side. The legacy community API excludes category records from group discovery and rejects Join/Leave, ownership transfer and ordinary group mutations against categories.

Public lists, search, tag suggestions and related discussions exclude hidden/removed topics and legacy private groups. Existing direct group reads/replies retain their original access rules. Archived categories are read-only and excluded from discovery. Paper visibility and gap access are enforced on writes. Citation review still requires project screening, structured evidence extraction and researcher confirmation before candidate-gap evidence is linked.

## Verification (2026-10-03)

| Check | Result |
| --- | --- |
| Backend full suite | **92 files, 555 tests passed** |
| Web full suite | **41 files, 256 tests passed** |
| Backend and web typecheck | **Passed** |
| Backend and web production builds | **Passed**, including PostgreSQL runtime audit and web bundle budget |
| Changed backend forum/community/provider lint | **Passed** |
| Full web lint | **Passed**, 117 existing warnings |
| Full backend lint | **Blocked by an existing error**: `auth.service.ts:640`, `prefer-const` for `programId`; 8 existing warnings |
| Locale coverage | **Passed** for all 11 locale key sets, with Vietnamese forum translations and English fallbacks |
| Real DOI lookup | **Passed** for `10.7717/peerj.4375`; expected Open Access study title and metadata shown |
| Responsive list and conversation | **Verified** at 1440×1000, 1280×800 and 390×844; ordinary desktop rows measure 92px; no mobile horizontal overflow; one shared reply editor and no file input |

Full suites were run with `--maxWorkers=3 --minWorkers=1` after default parallelism caused resource-related timeouts. Test limits and assertions were retained. Coverage includes feeds, composed search/filters/pagination, all four thread types, context requirements, reply targeting, separate root/response Helpful and vote-failure behavior, Follow, acceptance, visibility, view/participant/activity semantics, category administration, moderator scope/revocation and DOI preview/attachment failures. Build artifacts were generated sequentially around shared-types and Prisma dependencies.

Logs are in `test-results/`, including `backend-full-final.log`, `web-full-final.log`, `forum-*-typecheck-final.log`, `forum-*-build.log` and `forum-*-lint-final.log`. Screenshots are in `artifacts/forum-redesign/`.

- [Large desktop topic list](../artifacts/forum-redesign/forum-desktop.png)
- [Laptop topic list](../artifacts/forum-redesign/forum-laptop.png)
- [Mobile topic list](../artifacts/forum-redesign/forum-mobile.png)
- [Desktop conversation](../artifacts/forum-redesign/forum-thread-desktop.png)
- [Mobile conversation](../artifacts/forum-redesign/forum-thread-mobile.png)
- [Shared reply-to-response composer](../artifacts/forum-redesign/forum-reply-composer.png)
- [Category administration](../artifacts/forum-redesign/forum-categories.png)

## Visual fidelity follow-up (2026-10-03)

Studied the public Discourse source directly: Horizon `scss/main.scss`, `variables.scss`, `sidebar.scss`, `nav-pills.scss`, `topic.scss`, `topic-cards.scss`, core `common/base/_topic-list.scss`, and `topic-list/latest-topic-list-item.gjs`. Compared the supplied Meta category screenshot and the live keyboard-shortcuts conversation. The React implementation retains LumiGap's shared header and existing forum data/actions.

- Global feed: heading sits outside a flat topic list; content is capped at 1200px, with light dividers, 18px titles at weight 450, quiet tag text and pill-shaped creation action.
- Category pages: title/description sit on a category-colored canvas above a white 20px-radius topic surface. The 1120px cap leaves space for LumiGap's five metadata columns. Category metadata is omitted on rows in the selected category.
- Conversation: purple canvas surrounding a white 1040px panel with 20px corners, full-width topic heading, author/post stream and sticky timeline. Topic metrics and participant avatars share one compact row; the real single-post count is displayed without an interactive scrubber. Mobile uses 8px canvas gutters and 16px panel corners.
- Mobile: filters/search/create share the first control row, feeds scroll on the second; tags remain visible. Creation uses a labeled icon on small screens. Verified no horizontal overflow on feed, category or conversation at 390px.
- Category-route filters now carry the category into feed links and allow changing/clearing category scope. Clearing other filters retains the selected category.
- Added Vietnamese category descriptions and methodology naming, localized short activity units, and completed Vietnamese onboarding/profile/cover-control copy. User discussion text remains in its original language.

Verification: **22 test files / 157 tests passed** (forum and locale suites), web typecheck passed, lint for changed code passed. Desktop/category row measurements: 82–86px for ordinary sample rows; category surface 1120px at a 1440px viewport. Screenshots are saved in `artifacts/forum-fidelity/` for desktop and mobile feed, category and conversation.

Source references: [Horizon source](https://github.com/discourse/discourse/tree/main/themes/horizon), [Meta General](https://meta.discourse.org/c/general/124), [Meta conversation](https://meta.discourse.org/t/do-you-use-keyboard-shortcuts/355021).

## Differences from Discourse

This implementation uses LumiGap's React/Vite and Express architecture; no Next.js, Rails or Ember application was added. Categories are an adapter over existing Community storage rather than a duplicated taxonomy table. Category display order is edited numerically. Reply chunks and the lightweight native timeline reuse the existing forum implementation. DOI imports depend on an enabled OpenAlex provider and the existing metadata quality gate. Other locales use English fallbacks for new forum wording. No chat, group experience, badges, plugin/theme engine or full Discourse administration platform is introduced.
