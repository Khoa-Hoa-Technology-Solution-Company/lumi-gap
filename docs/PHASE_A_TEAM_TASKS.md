# Phase A — Chia Việc Theo Use Case

> **Triết lý:** Mỗi dev sở hữu 1 **user journey** xuyên suốt project. Khi thầy hỏi "ai làm gì", có câu trả lời 1 câu rõ ràng. CV viết được luôn.

---

## 🎭 4 User Journeys — 4 Domain Owners

Mỗi người **chủ sở hữu 1 use case** từ Phase A đến Phase E. Không phải "1 phase 1 task" mà là "1 lĩnh vực xuyên suốt".

```
┌─────────────────────────────────────────────────────────────────┐
│ 👑 LEAD (bạn) — "AI Brain & Admin"                              │
│ User journey: System ingests data and AI analyzes papers        │
│                                                                 │
│ "Em xây dựng pipeline data + AI để các dev khác có data dùng"   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 🔍 DEV 1 — "Discovery"                                          │
│ User journey: User searches → sees results → reads paper        │
│                                                                 │
│ "Em xây search, browse paper, xem trend"                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ⭐ DEV 2 — "Personalization"                                    │
│ User journey: User saves, follows, gets notified                │
│                                                                 │
│ "Em xây bookmark, follow topic, profile, notification"          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 📑 DEV 3 — "Research & Insights"                                │
│ User journey: Researcher builds project → generates report      │
│                                                                 │
│ "Em xây project, AI report viewer, research gap, dashboard"     │
└─────────────────────────────────────────────────────────────────┘
```

**Tại sao split này tốt:**
- Mỗi người 1 user story rõ ràng, demo 1 phút cho thầy
- Full-stack ownership: dev quản BE + Web + Mobile cho domain của mình
- Maps trực tiếp với câu hỏi gốc trong project brief
- CV: "Owned 'paper discovery' user journey end-to-end across web + mobile"
- Phase B-E sau cũng tiếp tục với cùng phân chia này — không phải reassign liên tục

---

## 🗺️ Big Picture — Mỗi Người Làm Gì Qua 5 Phases

| | Phase A (now) | Phase B | Phase C | Phase D | Phase E |
|---|---|---|---|---|---|
| **Lead** | Sync OpenAlex + 10 models + admin sync endpoint | Embeddings worker + add Semantic Scholar | LLM service + RAG pipeline | MCP tools + research gap engine | Admin web UI polish |
| **Dev 1 — Discovery** | UI shell (PaperCard mock, SearchBar) | Semantic search results page | Paper detail page | Trends dashboard | Mobile search/detail screens |
| **Dev 2 — Personal** | Mobile auth + Profile page | (idle / Dev 1 helper) | Bookmark API + page | Follow + notifications | Mobile personal screens |
| **Dev 3 — Research** | UI components + DevOps tools | Markdown viewer + saved searches | Report list + viewer page | Projects + Gap Viewer | Mobile read-only screens |

Trên trục **dọc**, mỗi cột Phase tăng dần độ phức tạp.
Trên trục **ngang**, mỗi dev có **1 dải feature liên tục** — biết phía trước cần làm gì.

---

## 📋 Phase A — Tasks Cụ Thể Cho Mỗi Owner

### 👑 LEAD (bạn) — Paper Sync + Admin Foundation

#### Mục tiêu Phase A
Tạo data foundation để 3 dev khác có data thật để build UI:
> *"Bấm Sync → sau 2 phút có 100 paper về LLM-in-education thật trong DB, admin xem được sync history"*

#### Output ship được
1. **10 Mongoose models** (journals, authors, keywords, research_topics, paper_source_records, paper_quality_checks, api_providers, api_sync_configs, api_sync_runs, audit_logs)
2. **OpenAlex client** với rate-limit + retry + cursor pagination
3. **Sync worker** standalone (`pnpm worker:sync`)
4. **Admin endpoint** `POST /api/v1/admin/sync`
5. **Admin UI page** trong web — list sync runs, button trigger sync
6. **Cron job** chạy 2h sáng mỗi ngày
7. ~100+ paper thật trong MongoDB

#### Files động vào
```
apps/backend/src/modules/api-sync/*          (toàn bộ module mới)
apps/backend/src/modules/papers/models/*     (6 models mới)
apps/backend/src/modules/audit/*             (module mới)
apps/backend/src/workers/sync.worker.ts      (entry point)
apps/backend/scripts/seed-providers.ts       (seed)

apps/web/src/pages/admin/                    (mới)
├── sync.tsx                                 (trigger + history page)
└── runs/[id].tsx                            (run detail)

apps/web/src/features/admin/                 (mới module)
├── api/admin.api.ts
└── hooks/use-admin.ts
```

#### Spec chi tiết
[`docs/superpowers/specs/2026-05-25-phase-a-design.md`](superpowers/specs/2026-05-25-phase-a-design.md)

#### Done khi
- [ ] `curl POST /admin/sync` → return runId
- [ ] Worker logs 100+ paper upsert
- [ ] MongoDB `research_papers.count` ≥ 100
- [ ] Re-run sync → totalDuplicates tăng (dedup OK)
- [ ] Admin UI hiển thị danh sách runs với status

**Effort:** 8–12 giờ.

---

### 🔍 DEV 1 — Discovery UI Shell

#### Mục tiêu Phase A
Chuẩn bị UI components cho user journey "discover papers" — chạy được với **mock data** (không cần đợi Lead xong sync).

> *"Em xây UI để hiển thị paper. Khi Lead sync xong, em chỉ swap mock → real data."*

#### Output ship được
1. **PaperCard component** (web) — hiển thị title, authors, year, citationCount, journal
2. **SearchBar component** với debounce + clear button
3. **PaperList component** — list of PaperCard với pagination
4. **Search page mockup** (web) — chưa connect API thật, dùng mock paper data
5. **Mobile Search screen** mockup
6. **Mobile Paper Detail screen** mockup

#### Files động vào
```
apps/web/src/features/papers/components/
├── paper-card.tsx                          NEW
├── paper-list.tsx                          NEW
└── empty-state.tsx                         NEW

apps/web/src/features/search/components/
├── search-bar.tsx                          NEW
└── search-filters.tsx                      NEW (year range, open access)

apps/web/src/pages/search.tsx               NEW (route /search)
apps/web/src/pages/papers/[id].tsx          NEW (route /papers/:id)

apps/web/src/routes/app-routes.tsx          EDIT — add /search /papers/:id

apps/mobile/src/features/papers/components/
└── paper-card.tsx                          NEW

apps/mobile/app/(tabs)/search.tsx           NEW
apps/mobile/app/paper/[id].tsx              NEW

apps/web/src/fixtures/mock-papers.ts        NEW — fake paper data for dev
```

#### Reuse có sẵn (KHÔNG viết lại)
- `apps/web/src/features/papers/api/papers.api.ts` — đã có `papersApi.list()` và `papersApi.detail()`
- `apps/web/src/features/papers/hooks/use-papers.ts` — đã có `usePapers()` và `usePaper()`
- Type `Paper` từ `@trend/shared-types`
- shadcn `Card`, `Input`, `Button` đã install

#### Done khi
- [ ] Vào `/search` → SearchBar + mock paper results
- [ ] Vào `/papers/abc123` → Paper detail page với mock data
- [ ] Mobile: Search screen render được trên Expo Go
- [ ] PaperCard component test standalone: render đẹp với 1 paper bất kỳ
- [ ] EmptyState khi search không có kết quả

**Effort:** 6–8 giờ.

---

### ⭐ DEV 2 — Mobile Auth + Profile

#### Mục tiêu Phase A
Hoàn thiện auth cross-platform (web đã xong, mobile chưa) + tạo profile page cho user.

> *"Em xây để user đăng nhập trên cả web và mobile, vào profile xem/sửa info"*

#### Output ship được
1. **Mobile Login screen** — copy web's login-form.tsx pattern qua RN
2. **Mobile Register screen**
3. **Mobile Profile screen** — hiển thị info user, nút logout
4. **Web Profile page** `/profile` — view + edit fullName, see role
5. **Mobile protected route** equivalent cho Expo Router
6. **Profile picture upload** (Phase A bonus, nếu kịp)

#### Files động vào
```
apps/mobile/src/features/auth/components/
├── login-form.tsx                          NEW (copy web pattern)
└── register-form.tsx                       NEW

apps/mobile/src/features/auth/schemas/auth.schemas.ts  COPY from web

apps/mobile/app/(auth)/
├── _layout.tsx                             NEW (Stack)
├── login.tsx                               NEW
└── register.tsx                            NEW

apps/mobile/src/components/protected-route.tsx  NEW

apps/mobile/app/(tabs)/profile.tsx          NEW

apps/web/src/pages/profile.tsx              NEW (route /profile, protected)
apps/web/src/features/users/                NEW module
├── api/users.api.ts
└── hooks/use-update-profile.ts

apps/backend/src/modules/users/             EXTEND existing
└── user.controller.ts                      NEW — PATCH /me to update profile
```

#### Reuse có sẵn
- `apps/mobile/src/features/auth/index.ts` — đã export `useLogin`, `useRegister`, `useLogout`
- `apps/mobile/src/stores/auth-store.ts` — đã wire `expo-secure-store`
- `apps/web/src/features/auth/components/login-form.tsx` — copy logic, đổi UI sang RN

#### Done khi (test trên Android — team không có iOS)
- [ ] Expo Go **Android** hoặc Android Studio emulator: đăng ký account mới → toast → vào Home
- [ ] Đóng app, mở lại → vẫn đăng nhập (token trong AsyncStorage/SecureStore)
- [ ] Tab Profile → email + Logout button
- [ ] Web `/profile` → form sửa fullName, save → API PATCH thành công
- [ ] Logout cả web + mobile xong → redirect /login
- [ ] Hardware back button trên Android xử lý đúng (không crash app)

**Effort:** 5–7 giờ.

---

### 📑 DEV 3 — UI Foundation + Team Tooling

#### Mục tiêu Phase A
Xây dựng nền tảng dùng chung cho **tất cả** Phase B-E + tighten team workflow.

> *"Em làm các component reusable + setup CI/lint để team không dập tay nhau"*

#### Output ship được
1. **6 reusable components** (web): EmptyState, LoadingSpinner, Skeleton, NotFoundPage, ErrorBoundary, ThemeToggle
2. **Dark mode** hoạt động + persist
3. **404 page** với link back
4. **ESLint + Prettier** config
5. **Husky pre-commit** + commitlint
6. **GitHub Actions CI** workflow
7. **Backend Dockerfile**
8. **CONTRIBUTING.md** cho onboard dev mới

#### Files động vào
```
apps/web/src/components/
├── empty-state.tsx                         NEW
├── loading-spinner.tsx                     NEW
├── skeleton.tsx                            NEW (or shadcn add skeleton)
├── theme-toggle.tsx                        NEW (next-themes)
└── page-error.tsx                          NEW

apps/web/src/pages/
├── not-found.tsx                           NEW (404)
└── error.tsx                               NEW

apps/web/src/main.tsx                       EDIT — ThemeProvider
apps/web/src/layouts/MainLayout.tsx         EDIT — add ThemeToggle in header

.eslintrc.cjs                               NEW (root)
apps/{backend,web,mobile}/.eslintrc.cjs     NEW
.prettierrc.json                            NEW
.prettierignore                             NEW
.lintstagedrc.json                          NEW
commitlint.config.cjs                       NEW

.husky/pre-commit                           NEW
.husky/commit-msg                           NEW

.github/workflows/ci.yml                    NEW
.github/pull_request_template.md            NEW

.vscode/settings.json                       NEW
.vscode/extensions.json                     NEW

apps/backend/Dockerfile                     NEW
apps/backend/.dockerignore                  NEW

CONTRIBUTING.md                             NEW
```

#### Lệnh setup tooling
```bash
pnpm add -D -w eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-import \
  eslint-plugin-jsx-a11y prettier eslint-config-prettier husky lint-staged \
  @commitlint/cli @commitlint/config-conventional
pnpm exec husky init
# add "prepare": "husky" to root package.json
```

#### Done khi
- [ ] `pnpm lint` chạy không lỗi
- [ ] Commit code xấu → bị chặn
- [ ] Commit message `wip` → bị commitlint chặn
- [ ] Mở PR → GitHub Actions tự chạy lint + typecheck
- [ ] `docker build -t trend-backend apps/backend` thành công
- [ ] Vào URL không tồn tại → 404 page
- [ ] Click theme toggle → dark/light, reload vẫn giữ

⚠️ **KHÔNG động vào** `apps/backend/src/modules/api-sync/*` và `apps/backend/src/modules/papers/models/*` — đó là territory của Lead.

**Effort:** 5–7 giờ.

---

## 🧭 Coordination Rules

### Branch naming
```
feat/<your-name>/<short-description>
ví dụ:
  feat/long/openalex-sync
  feat/thanh/mobile-login
  feat/anh/paper-card
  feat/nam/ci-workflow
```

### Commit format (sau khi Dev 3 setup commitlint)
```
feat: short summary
fix: short summary
docs: short summary
refactor: short summary
chore: short summary
```

### PR flow
- Branch riêng → PR vào `dev`
- 1 người approve mới merge
- CI phải xanh
- Lead merge `dev` → `main` cuối phase

### Daily standup
- 9h sáng Discord voice, 15 phút
- Yesterday / today / blockers — mỗi người 30s

### Pull `dev` mỗi sáng
```bash
git checkout dev && git pull
git checkout feat/your-branch && git rebase dev
```

### Khi stuck — format gửi Discord
```
🆘 Stuck
Domain: [Discovery / Personal / Research / AI Brain]
File: <path>
Đã thử: <những gì làm>
Error: <paste>
```

---

## ✅ Phase A "Done" Definition

Cả 4 người xong khi:
- [ ] Lead: 100+ papers trong DB, sync hoạt động, admin UI list runs OK
- [ ] Dev 1: PaperCard + Search page (mock data) render OK
- [ ] Dev 2: Mobile auth chạy Expo Go + Web profile page hoạt động
- [ ] Dev 3: CI green trên PR + dark mode + 404 + pre-commit hook active
- [ ] CLAUDE.md §10 (Roadmap) update Phase A → DONE
- [ ] Lead merge `dev` → `main`

---

## 🎯 Sau Phase A — Mỗi Owner Tiếp Phase B

**Vì split đã thiết kế xuyên 5 phases**, không cần reassign:

- **Lead** → Phase B: embeddings worker + semantic search backend + add Semantic Scholar
- **Dev 1** → Phase B: connect real search API + semantic search UI
- **Dev 2** → Phase B: (rảnh, help Dev 1) hoặc Phase B prep cho personal features
- **Dev 3** → Phase B: markdown viewer component cho future report rendering

Mỗi người có "roadmap cá nhân" — biết tuần sau làm gì.

---

## 📚 Tham Khảo

- [Phase A backend design spec](superpowers/specs/2026-05-25-phase-a-design.md)
- [CLAUDE.md](../CLAUDE.md) — project context tổng quát
- [Web README](../apps/web/README.md), [Backend README](../apps/backend/README.md), [Mobile README](../apps/mobile/README.md)
