# PHASE P0 — Report (Checkpoint 2)

> Ngày: 2026-10-21 · Nhánh: **`feat/research-trends-p0`** (tạo từ `origin/main` @ `5a9d228`, không có upstream, **chưa commit, chưa push**).
> Căn cứ: `05_IMPLEMENTATION_PLAN.md` (bản Checkpoint 1.5) và `CHECKPOINT_1_5_REVIEW.md`. Thứ tự đã làm: P0.0 → P0.1 → P0.2 → P0.6 → P0.4 → P0.5 → P0.3 → P0.7.
> Không sửa database, không tạo migration, không bắt đầu P1–P5.
> **Cập nhật Checkpoint 2 — final verification (2026-10-21, tối):** §0 (S2, S4), §3, §4, §5, §6 và §7 mới được viết lại theo kết quả chạy thật trên môi trường tích hợp cô lập. Kết luận nghiệm thu nằm ở `P0_RELEASE_READINESS.md`.
> *Ghi chú:* bản anh/chị review còn `RESULTS_PLACEHOLDER` là bản trước khi tôi điền §4 ở cuối lượt trước; bản trên đĩa đã không còn placeholder. Nay §4 được thay bằng số liệu đầy đủ hơn.

## 0. Sự cố cần biết trước

| # | Sự cố | Ảnh hưởng | Đã xử lý |
|---|---|---|---|
| S1 | Lúc 16:04:34 checkout bị chuyển từ `feat/research-trends-p0` sang `docs/review2-cleanup` (reflog). Tôi không chạy lệnh này; việc chuyển xảy ra trong lúc phiên bị tạm dừng vì giới hạn sử dụng. Các thay đổi chưa commit của P0 đi theo working tree | Một phần P0 (P0.5 web, P0.3, P0.7, đồng bộ 04) được viết khi checkout đang ở `docs/review2-cleanup` | Đã sao lưu toàn bộ (patch + 18 file untracked) rồi chuyển lại về `feat/research-trends-p0`. Đã kiểm tra: tập thay đổi giống hệt trước và sau khi chuyển. File duy nhất khác giữa hai nhánh (`docs/environment-variables.md`) được áp lại 1 dòng thay đổi trên bản của nhánh P0. `docs/review2-cleanup` không còn thay đổi nào của P0. **Toàn bộ kiểm chứng ở §4 đã chạy lại trên nhánh P0** |
| S2 | Lệnh `pnpm typecheck` (chạy lấy baseline ở đầu phiên) đã tự kích hoạt bước kiểm tra phụ thuộc của pnpm 11 và chạy **`pnpm install` ngầm** (log: `Packages: +63 -910`). Bước này bị treo hơn 5 giờ ở khâu tải `@napi-rs/canvas-*` | `node_modules/.modules.yaml` được ghi lại lúc 15:21:58; `pnpm-lock.yaml` **không đổi**. Mọi typecheck, test và build sau thời điểm đó vẫn chạy được | Đã dừng job, kill tiến trình `pnpm install` bị treo. Sau đó mọi kiểm chứng chạy trực tiếp bằng `tsc`, `vitest`, `eslint`, `vite`/`node scripts/build.mjs`, không qua `pnpm <script>`. **Đã xử lý ở final verification:** `pnpm install --frozen-lockfile` → "Already up to date", exit 0, `pnpm-lock.yaml` không đổi (so sánh byte trước/sau) |
| S3 | Prisma client sinh sẵn (`src/generated/prisma`, bị gitignore) đã cũ so với schema của `main` | `tsc` của backend lỗi ở các module không liên quan | Đã chạy `prisma generate` (chỉ sinh code, không chạm DB) |
| S4 | Không có PostgreSQL (5432/5433) và Redis (6379) trên máy (Docker daemon không chạy) | Ở lượt đầu, test cần DB bị BLOCKED | **Đã xử lý ở final verification:** container PostgreSQL+pgvector và Redis riêng, dùng một lần (cổng 55433/56379, DB `*_test`), áp migration có sẵn, chạy lại toàn bộ (§4). Container đã xoá sau khi xong |

Thư mục tạm cho so sánh trước/sau (`.p0-before`, `.p0-base`) là git worktree tạm, đã xoá.

---

## 1. Danh sách thay đổi

### Backend — `apps/backend/src/modules/trends/`
| File | Thay đổi | Task |
|---|---|---|
| `trend.openalex-client.ts` | Ngưỡng ngân sách theo tỷ lệ `Remaining/Limit` (`BUDGET_RESERVE_FRACTION = 0.2`, quy ước); 429 hết ngân sách → không retry, khoá tới reset; 4xx khác không retry (`OpenAlexHttpError`, giữ thông điệp "OpenAlex <status>"); bỏ `mailto`; key gửi bằng `Authorization: Bearer`; cảnh báo khi production thiếu `OPENALEX_API_KEY`; `corpus=core` tường minh trên `/works`; cache lưu `{ fetchedAt, body }`; `OPENALEX_CACHE_VERSION = "v3"`; `withOpenAlexProvenance()` (AsyncLocalStorage) | P0.1, P0.6 |
| `trend.evidence.ts` | Tách `computeOpenAlexTopicStatistics` (nhận Data Scope, cùng chuỗi filter với overview và biểu đồ, không tự fallback) và `computeLocalTopicStatistics`; population local chỉ tính primary topic; keyword shift xếp bằng `rankKeywordShifts` | P0.2, P0.4, P0.5 |
| `trend.service.ts` | `topic()`: biểu đồ và thống kê cùng một nguồn, cùng một scope; `preferOpenAlex` gắn `dataProvenance`; cửa sổ dùng `resolveTrendWindow`; `topicRows` lọc `isPrimary` và khớp `openalexTopicId` chính xác | P0.2, P0.6, P0.4 |
| `trend.openalex-detail.ts` | Export `topicScope()`; cửa sổ dùng `resolveTrendWindow` | P0.2, P0.4 |
| `trend.openalex-overview.ts` | `qFamilySize`; keyword xếp theo `rankKeywordShifts`; cửa sổ dùng `resolveTrendWindow` | P0.2, P0.5, P0.4 |
| `trend.postgres.ts` | Đếm topic theo `pt.is_primary = TRUE`; cửa sổ 10 năm hoàn chỉnh (trước là 5); keyword local dùng cùng kiểm định log OR 2 kỳ + BH như OpenAlex (bỏ chọn theo YoY); `qFamilySize` | P0.4, P0.5, P0.2 |
| `trend.statistics.ts` | p chính xác của Mann–Kendall (n ≤ 10, không ties) bằng phân phối Mahonian, quy hoạch động, có cache; trường `pValueMethod` | P0.7 |
| `trend.verdict.ts` | `qFamilySize` trong classification; `rankKeywordShifts`; chuyển `pValueMethod` | P0.2, P0.5, P0.7 |
| `modules/home/home.postgres.ts` | Snapshot trang chủ: `dataSource: "local"`, xếp topic theo `total` | P0.3 |

### Shared types — `packages/shared-types/src/`
- `trend.ts`: `TrendDataProvenance` + `dataProvenance?` trên 5 kiểu response; `qFamilySize?`; `pValueMethod?`; `resolveTrendWindow()` + `DEFAULT_TREND_WINDOW_COMPLETE_YEARS = 10`; `KEYWORD_SHIFT_MIN_PAPERS = 30`. Chỉ **thêm** trường tùy chọn, không xoá hay đổi trường cũ.
- `home.ts`: `HomeTrendSnapshot.dataSource?`.

### Web — `apps/web/src/`
- Nhãn: bỏ "Hot", "Hot Signal", "Rising Signal", "Exploratory (Small Base…)", "(Small Base)"; chuỗi `+${growthRatePct}%` → `formatSigned` (hết "+-x%"); tiêu đề "Emerging Keywords" → "Keyword shifts (supplementary)"; cột "Growth" → "YoY (raw)" kèm chú thích "mô tả, chưa khử lạm phát" (`pages/trends.tsx`, `topics-tab.tsx`, `overview-tab.tsx`, `trends-shared.components.tsx`).
- Chọn keyword: `getFastestKeyword` chỉ chọn keyword có kiểm định, theo log OR; `isSmallBaseKeyword` bị xoá; `isShiftSignificant` thêm điều kiện `papersB ≥ 30` (`trends.insights.ts`, `trend-source.ts`).
- p/q: dòng dữ liệu ghi "q … (Benjamini–Hochberg across n topics)" hoặc "p … (one topic, not adjusted…)"; bảng chi tiết ghi "p-value (one topic, not adjusted)" (`trend-verdict-badge.tsx`, `trend-evidence-panel.tsx`).
- Provenance: `DataSourceBadge` hiện "OpenAlex data fetched {date}" ở 5 nơi dùng.
- Cửa sổ mặc định web dùng `resolveTrendWindow` (`trends.insights.ts`).
- Trang chủ: ghi chú "Papers in the LumiGap library (synced locally). These counts describe the library, not research trends…" (`home-discovery.tsx`).
- Trang `/docs`: mục Mann–Kendall và hạn chế số 6 cập nhật theo p chính xác (`docs/content/trends/en.ts`, `vi.ts`).
- i18n: thêm 16 chuỗi en/vi (`trend-verdict.ts`: 14, `trend-evidence.ts`: 1, `research-home*.ts`: 1).

### Tài liệu
- `docs/environment-variables.md`: mô tả `OPENALEX_API_KEY`.
- `docs/research-trends/04_TARGET_ARCHITECTURE.md`: đồng bộ với quyết định Checkpoint 1.5 (mục 2.1, 2.3–2.8, 2.10; bỏ "Hot Right Now", bỏ ngưỡng "50 điểm %", bỏ ước tính chi phí chưa đo, bỏ "classifier version", đổi tên bảng `trend_series_snapshots` → `trend_series_store`).

### Test mới (backend)
`fixtures/` (G0), `trend.golden-g0.test.ts`, `trend.openalex-client.test.ts`, `trend.consistency.test.ts`, `trend.window.test.ts`, `trend.postgres.test.ts`, `trend.keyword-rank.test.ts`, `trend.mann-kendall-exact.test.ts`, `modules/home/__tests__/home.postgres.trends.test.ts`. **Thêm ở final verification:** `trend.openalex-client-startup.test.ts` (4), `trend.local.integration.test.ts` (4, PostgreSQL thật, flag `TRENDS_INTEGRATION=1` + bắt buộc DB `_test`), web `features/trends/__tests__/trend-provenance-ui.test.tsx` (6, render thật trong jsdom). Test cũ được cập nhật theo hành vi mới có chủ đích: `trend.evidence.test.ts`, `trend.openalex-detail.test.ts` (cửa sổ), `trend.statistics.test.ts` (p chính xác); web: `trend-helpers.test.ts`, `trends.insights.test.ts`, `research-home.test.tsx`.

---

## 2. Bằng chứng trước / sau

### 2.1 Các test P0 mới chạy trên code **chưa sửa** (worktree `origin/main`)
`Test Files 7 failed (7) · Tests 21 failed | 9 passed (30)`.
- Thất bại đúng như mong đợi: budget/429/provenance (10/11), nhất quán overview ↔ chi tiết (3/3), local primary + cửa sổ + keyword (3/3), p chính xác (3/4), home (1/1), G0 Mann–Kendall (1/8: p chính xác), `trend.keyword-rank.test.ts` không nạp được vì `rankKeywordShifts` chưa tồn tại.
- 9 test đã pass trên code cũ: 7 kiểm tra tham chiếu G0 (đúng thiết kế: G0 phải pass trước khi sửa), benchmark, và "sends no mailto…". Test cuối là **test yếu**: nó pass trên code cũ chỉ vì môi trường test không đặt `OPENALEX_MAILTO`.

### 2.2 Trước / sau theo từng lỗi

| Lỗi | Trước | Sau |
|---|---|---|
| F1 ngân sách | Header thật không key (`Limit 1000`, `Remaining 999`): `999 < 1000` → khoá OpenAlex tới reset ngay sau request đầu | Tỷ lệ 999/1000 ≥ 0,2 → vẫn dùng OpenAlex; khoá khi < 20%; 429 hết ngân sách: 1 lần gọi, không retry |
| F2 verdict chi tiết | Thống kê dùng `type:…` mặc định, bỏ `paperKinds`/`languages`…; có thể trộn local + OpenAlex | Chuỗi topic và population của trang chi tiết dùng **đúng chuỗi filter** của overview (test kiểm tra `type:article,language:en,primary_topic.id:T1,publication_year:2016-2021` có ở cả hai); OpenAlex lỗi → cả response là local |
| F13 / off-by-one | `yearTo = 2025` → 2015–2025 = **11** năm hoàn chỉnh; `yearTo = 2024` → 2014–2024 (test cũ `trend.openalex-detail` mã hoá đúng lỗi này); local mặc định 5 năm | Luôn 10 năm hoàn chỉnh kết thúc ở `lastCompleteYear`: 2026 → 2016–2025 (không đổi), 2025 → 2016–2025, 2024 → 2015–2024; local = OpenAlex |
| F4 đơn vị local | `JOIN paper_topics` không lọc primary | `pt.is_primary = TRUE` ở truy vấn đếm; `topicId` khớp chính xác |
| F5/F7 nhãn và keyword | "Hot" khi YoY > 100%, "Hot Signal" khi > 50%; xếp keyword theo `z` (ví dụ test: "machine learning" 25%→28% có z ≈ 100, đứng trên "large language models" tăng ~10 lần, z ≈ 44) | Không còn nhãn dựa trên YoY; xếp theo log OR, ưu tiên shift có q < 0,05 và ≥ 30 bài → "large language models" đứng trước; keyword < 30 bài xếp sau |
| F3 trang chủ | API home xếp topic theo "trend" trên dữ liệu local (mọi verdict = insufficient) | `sortBy: "total"`, `dataSource: "local"`; ghi chú biểu đồ nói rõ đây là số bài của thư viện |
| P0.7 p | Xấp xỉ chuẩn cho mọi n | n ≤ 10 không ties: p chính xác. Ví dụ: n = 7, S = 17: 0,0163 → **0,01071** (= 54/5040); n = 10, S = 41: 3,47·10⁻⁴ → **2,98·10⁻⁵** (= 108/3 628 800) |

### 2.3 P0.7 — ảnh hưởng tới verdict (tính trên toàn bộ phân phối G0)
| n | |S| nhỏ nhất đạt p < 0,05 (xấp xỉ / chính xác) | |S| nhỏ nhất đạt p < 0,01 (xấp xỉ / chính xác) |
|---|---|---|
| 4 | không có / không có | không có / không có |
| 5 | 10 / 10 | không có / không có |
| 6 | 13 / 13 | 15 / 15 |
| 7 | 15 / 15 | 19 / 19 |
| 8 | 18 / 18 | 22 / 22 |
| 9 | 20 / 20 | 26 / 26 |
| 10 | 23 / 23 | **31 / 29** |

- Với **một chủ đề** (trang chi tiết, dùng p): ranh giới rising/declining/stable ở α = 0,05 **không đổi** với mọi n ≤ 10. Ngưỡng "high confidence" (p < 0,01, n ≥ 8) chỉ đổi ở n = 10: |S| = 29, 30 giờ được "high".
- Ở **overview** (dùng q của BH): q được tính từ p, nên verdict **có thể** đổi ở biên. Mức đổi trên dữ liệu thật **chưa đo** (cần OpenAlex + danh sách topic thật).
- `MIN_YEARS = 5` vẫn đúng: với n = 4, p chính xác nhỏ nhất = 2/24 ≈ 0,083.

### 2.4 Benchmark P0.7
- 100 000 lần chạy Mann–Kendall có p chính xác (n = 10): **173 ms** và **313 ms** ở hai lần chạy (~2–3 µs mỗi lần, gồm cả tính S).
- Một lần liệt kê đầy đủ 10! hoán vị trong Node để tính một p: **506 ms**. Với 200 topic là khoảng 100 giây. Cách dùng phân phối Mahonian không liệt kê hoán vị nào.
- Đúng đắn: so với liệt kê đầy đủ n! (n = 3…10) ở **mọi** giá trị S có thể đạt, sai khác < 10⁻¹⁴.

---

## 3. Đối chiếu acceptance criteria của P0

Ký hiệu: **PASS** đã kiểm chứng bằng test/lệnh · **PARTIAL** đạt một phần · **BLOCKED** không kiểm được trong môi trường này · **FAIL** chưa đạt.

| Task | Tiêu chí (05 bản 1.5) | Kết quả | Bằng chứng |
|---|---|---|---|
| P0.0 | Fixtures có README nguồn + ngày; test P0 dùng fixtures, không gọi mạng | **PASS** | `__tests__/fixtures/README.md`; 3 file JSON; các test mock `fetch`/client, không gọi mạng |
| P0.0 | Bảng p chính xác n = 4…10 "từ bảng in sẵn (Kendall 1975 / Helsel 2020)" | **PASS (đổi nguồn)** | Không dùng bảng in (chưa truy cập được). Thay bằng **liệt kê đầy đủ n!** (n = 3…10). Đây là định nghĩa của phân phối chính xác nên không cần bảng in. Đối chiếu: n = 5, S = 10 → 2/120 |
| P0.1 | (1) `Limit=1000, Remaining=999` vẫn dùng OpenAlex | **PASS** | `trend.openalex-client.test.ts` dùng header thật trong G0 |
| P0.1 | (2) `Remaining < 20% Limit` → khoá tới reset | **PASS** | test 199/1000; 1999/10000 |
| P0.1 | (3) 429 hết ngân sách → 0 retry; 429 tốc độ → retry | **PASS** | 2 test (fetch gọi 1 lần / 2 lần) |
| P0.1 | (4) không còn `mailto` | **PASS** | test + code; *test yếu, xem §2.1* |
| P0.1 | Cảnh báo khởi động khi production thiếu key | **PASS** | `trend.openalex-client-startup.test.ts` (4 test: production thiếu key → cảnh báo; có key / không phải production → không cảnh báo; key đi qua header `Authorization: Bearer`, không có trong URL). Trên code gốc: 2/4 fail (không cảnh báo, key nằm trong URL) |
| P0.2 | (1) `shareSeries`/MK của overview và chi tiết giống hệt trên fixture | **PASS** | `trend.consistency.test.ts`: MK, Sen, CI, số năm, số bài bằng nhau; cùng chuỗi filter |
| P0.2 | (2) scope có trong filter của cả chuỗi topic và population | **PASS** | cùng test |
| P0.2 | (3) chi tiết local ⇒ `statistics.source = "local"` | **PASS** | cùng test (không có lệnh đếm OpenAlex nào) |
| P0.2 | UI ghi rõ p (1 giả thuyết) / q (BH, n topic) | **PASS** | `trend-provenance-ui.test.tsx` render thật trong jsdom (`TrendFigures`, `TrendEvidencePanel`): "q = 0.012 (Benjamini–Hochberg across 37 topics)", "p = 0.007 (one topic, not adjusted…)", "q < 0.001…", nhãn hàng p-value. Trên code gốc: 4/4 fail |
| P0.3 | Khi `dataSource = local`: ghi chú, xếp theo số bài, không badge verdict | **PASS** | backend `home.postgres.trends.test.ts`; web `research-home.test.tsx`. *Đính chính:* web và mobile **không** hiển thị danh sách topic của trang chủ (chỉ biểu đồ số bài), nên không có badge nào để bỏ. F3 ở Checkpoint 1 bị phóng đại; mức thực tế là API trả thứ tự gây hiểu nhầm, chưa có client nào hiển thị |
| P0.4 | (1) SQL đếm có `is_primary = TRUE` | **PASS** | `trend.postgres.test.ts` |
| P0.4 | (2) Tổng thị phần các topic một field ≤ 100% | **PASS** | `trend.local.integration.test.ts` trên PostgreSQL thật: mỗi bài A có thêm B, C phụ; mỗi bài B có thêm A. Đếm đúng `a`, `b` mỗi năm; topic C (chỉ phụ) không xuất hiện; tổng thị phần ≤ 100% mọi năm. **Trên code gốc: cả 2 test fail** (đếm trùng) |
| P0.4 | (3) "T1002" không khớp "T10028" | **PASS** | `trend.consistency.test.ts` kiểm `equals` + `isPrimary` |
| P0.4 | (4) local mặc định `yearTo − 10` | **PASS (đã hiệu chỉnh theo yêu cầu)** | Theo yêu cầu bổ sung số 1: không dùng `yearTo − 10` mà dùng `lastCompleteYear − 9`. `trend.window.test.ts`, `trend.postgres.test.ts` |
| P0.5 | (1) không còn nhánh UI gắn nhãn theo `growthRatePct` | **PARTIAL** | **Web: PASS** (grep: trong UI trends của web, `growthRatePct` chỉ còn là dữ liệu và chỗ hiển thị có dấu kèm "raw"). **Mobile: FAIL, có sẵn từ trước, chưa sửa**: `apps/flutter_mobile/lib/features/home/presentation/home_screen.dart:258-270` tô màu và mũi tên theo dấu của `momentum`, in "x% growth"; dòng 426 ghi "Topic … is growing rapidly with growth rate of …%" cho 2 topic đầu bất kể verdict. Danh sách file của P0.5 chỉ có web. Toolchain Flutter ở máy này không chạy được (dự án cần Dart ≥ 3.12, máy có 3.11.5) nên tôi **không sửa** Dart khi không biên dịch hay test được (§7.4) |
| P0.5 | (2) không còn "+-" | **PASS** | `trends.insights.test.ts` |
| P0.5 | (3) keyword nhỏ log OR lớn xếp trên keyword lớn log OR nhỏ | **PASS** | `trend.keyword-rank.test.ts` (cả trường hợp z ngược lại), `trend-helpers.test.ts` |
| P0.6 | (1) `dataProvenance` đúng 4 trường, không `classifierVersion` | **PASS** | `trend.consistency.test.ts` |
| P0.6 | (2) đọc từ cache trả `fetchedAt` gốc | **PASS** | `trend.openalex-client.test.ts` (đồng hồ giả: lấy 21/10, đọc lại 23/10 → vẫn 21/10) |
| P0.6 | (3) count có `corpus=core` = count không tham số | **PASS (thực tế)** | 2 request đọc-only 2026-10-21, T10028, 10 năm: giống hệt (ghi vào G0 `corpusCoreVsDefault`) |
| P0.6 | (4) UI hiện "Dữ liệu OpenAlex lấy lúc …" | **PASS** | `trend-provenance-ui.test.tsx`: hiện "OpenAlex data fetched {ngày}" từ `fetchedAt`; không hiện với nguồn local, khi thiếu hoặc khi `fetchedAt` không hợp lệ. Trên code gốc: fail. Dữ liệu thật: lần gọi live thứ hai (dùng cache) trả **đúng** `fetchedAt` của lần đầu (`2026-10-21T14:13:27.740Z`) |
| P0.7 | (1) khớp G0 cho n = 4…10 không ties | **PASS** | `trend.mann-kendall-exact.test.ts` (mọi S, n = 3…10) |
| P0.7 | (2) có ties: chính xác hoặc ghi rõ xấp xỉ | **PASS (ghi rõ xấp xỉ)** | `pValueMethod = "normal"` khi có ties; trang `/docs` cập nhật. Không làm phân phối chính xác có ties |
| P0.7 | (3) báo cáo số topic đổi verdict trước/sau | **PASS** | Dữ liệu OpenAlex thật, field 17 (Computer Science), 2016–2025, **toàn bộ family BH 150 topic**: **0 topic** đổi verdict hoặc mức tin cậy giữa p chính xác và p xấp xỉ (§7.3). Bản dựng lại family khớp 50/50 topic của overview thật về p, q và verdict |
| P0.7 | Yêu cầu bổ sung: không liệt kê hoán vị, có benchmark | **PASS** | §2.4 |
| Chung | Không thêm bảng DB, phương pháp mới, không đổi/xoá trường API cũ | **PASS** | Chỉ thêm trường tùy chọn; không migration |
| Chung | Golden G0 có trước khi sửa thuật toán | **PASS** | G0 tạo và pass (8/8) trên code chưa sửa, trước P0.1 |
| Chung | Đồng bộ 04 | **PASS** | §1 Tài liệu |
| Chung | `pnpm typecheck`, `pnpm test` xanh | **PARTIAL** | Gọi trực tiếp `tsc`/`vitest` thay vì `pnpm <script>` (S2). Typecheck: xanh. Backend test (có DB): **xanh**, 1 456 pass, 0 fail. Web test: 10 fail, **đều có sẵn trên `5a9d228`** (§4.3). Không có lỗi nào do P0 gây ra, nhưng toàn bộ suite web không xanh |

---

## 4. Kết quả kiểm chứng (final verification, 2026-10-21)

Mọi lệnh chạy trên `feat/research-trends-p0` (code gốc `5a9d228` + thay đổi P0, chưa commit). Lệnh gọi trực tiếp công cụ (`tsc`, `vitest`, `eslint`, `node`), không qua `pnpm <script>` (S2).

### 4.1 Môi trường

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Nhánh | `feat/research-trends-p0` @ `5a9d228` | `git branch --show-current`; 37 file sửa + 13 mục untracked, đều trong phạm vi (trends, home, shared-types, i18n, docs/research-trends, docs/environment-variables.md); `apps/flutter_mobile` không đổi |
| Dependencies | Đồng bộ | `pnpm install --frozen-lockfile` → "Already up to date", exit 0; lockfile không đổi (so sánh byte) |
| PostgreSQL / Redis | Cô lập | Container dùng một lần `pgvector/pgvector:0.8.1-pg16` (cổng 55433) và `redis:7-alpine` (cổng 56379); DB `lumigap_p0_test` và `lumigap_base_test`; áp **93 migration có sẵn** (`prisma migrate deploy`), không tạo migration mới. Mọi lệnh truyền `DATABASE_URL`/`REDIS_URL` tường minh (`.env` trỏ tới DB dev nên không dùng mặc định). Đã xoá container khi xong |
| DB dev của dự án | Không chạm | Khi khởi động Docker, `lumi-gap-postgres-1` và `lumi-gap-redis-1` tự chạy lại (restart policy). Không lệnh test nào kết nối tới chúng. Tôi đã `docker stop` để trả về trạng thái trước đó (dữ liệu giữ nguyên) |
| OpenAlex | Đọc-only, khoá trong `.env` | Kiểm tra live dùng Redis cô lập (db 14) làm cache |
| Flutter | **BLOCKED** | `flutter analyze` / `flutter test`: "flutter_mobile requires SDK version ^3.12.0, version solving failed" (máy: Flutter 3.41.9, Dart 3.11.5) |

### 4.2 Tổng hợp kết quả

| Kiểm tra | Lệnh | Mã thoát | Tổng | PASS | FAIL | SKIPPED | BLOCKED |
|---|---|---|---|---|---|---|---|
| Shared types build + typecheck | `tsc -p tsconfig.json` + `tsc --noEmit` | 0 | — | ✔ | — | — | — |
| Backend typecheck | `tsc --noEmit` | 0 | — | ✔ | — | — | — |
| Backend build | `tsc -p tsconfig.build.json` (xuất ra thư mục tạm) | 0 | — | ✔ | — | — | — |
| Backend lint (trends, home) | `eslint src/modules/trends src/modules/home` | 0 | — | 0 lỗi | — | 2 cảnh báo có sẵn | — |
| **Backend test (có DB)** | `vitest run` + `TRENDS_INTEGRATION=1` | **0** | 1 855 test / 210 file | **1 456** | **0** | 399 (29 file tự bỏ qua theo flag riêng) | 0 |
| **Backend integration (flag, như CI)** | `vitest run <6 suite> --maxWorkers=1` + 3 flag | **0** | 148 / 6 file | **148** | **0** | 0 | 0 |
| Backend runtime audit | `vitest run postgres-only-runtime.test.ts` | 0 | 4 | 4 | 0 | 0 | 0 |
| Web typecheck | `tsc -b` | 0 | — | ✔ | — | — | — |
| Web build | `node scripts/build.mjs` | 0 | — | ✔ | — | — | — |
| Web lint (trends, home) | `eslint …` | 0 | — | 0 lỗi | — | 9 cảnh báo có sẵn | — |
| **Web test** | `vitest run --passWithNoTests` | 1 | 900 / 123 file | **890** | **10** (có sẵn) | 0 | 0 |
| Mobile | `flutter analyze`, `flutter test` | 1 | — | — | — | — | **BLOCKED** (SDK) |
| E2E Playwright | — | không chạy | — | — | — | — | **NOT VERIFIED** (không thuộc phạm vi kiểm chứng P0) |

Cộng hai suite test chính (backend có DB + web): **2 755 test, 2 346 PASS, 10 FAIL (đều có sẵn), 399 SKIPPED (tự bỏ qua theo flag), 0 BLOCKED**. Thêm 148 PASS của suite integration chạy riêng.

399 test bị bỏ qua thuộc 29 file persistence/e2e tự bỏ qua theo flag riêng (manuscript, workspace, github, mentorship…). Sáu file trong số đó là suite integration ở dòng trên (148/148 PASS). Không file nào thuộc trends. 23 file còn lại cần flag và hạ tầng riêng mà P0 không động tới → **NOT VERIFIED**, không có lý do liên quan P0.

### 4.3 So sánh với code gốc `5a9d228` (cùng môi trường, DB riêng)

| Suite | `5a9d228` | P0 | Chênh lệch |
|---|---|---|---|
| Backend (có DB) | 1 410 pass · 0 fail · 399 skip (200 file) | 1 456 pass · 0 fail · 399 skip (210 file) | +46 = đúng 46 test của 10 file test mới |
| Backend integration (flag) | 148 / 148 | 148 / 148 | 0 |
| Web | 880 pass · 11 fail (122 file) | 890 pass · 10 fail (123 file) | +6 (file UI mới) +3 (assertion thêm vào 3 file có sẵn); lỗi giống nhau, trừ 1 lỗi không ổn định |

Phân loại từng lỗi:

| Lỗi | Phân loại | Bằng chứng |
|---|---|---|
| `web/src/i18n/__tests__/locales.test.ts` (2 test) | **PRE-EXISTING** | Fail y hệt trên `5a9d228`. 10 chuỗi mới của P0 đã đăng ký: danh sách "chưa có trong từ điển" của P0 = của gốc; phần lệch giữa các ngôn ngữ giống hệt |
| `web/src/features/projects/__tests__/project-workspace-navigation.test.tsx` (8 test) | **PRE-EXISTING** | Fail y hệt trên gốc (mock thiếu `useProject`) |
| `web/src/features/auth/utils/academic-onboarding.test.tsx` (1 test) | **FLAKY** | Fail 1 lần trên P0 (lượt trước) và 1 lần trên gốc (lần này) khi chạy cả bộ; chạy riêng 3/3 pass; lần chạy P0 cuối pass. Hết giờ `vi.waitFor` |
| 19 file backend cần DB (lượt trước) | **ENVIRONMENT BLOCKED → đã giải quyết** | Có DB cô lập: 0 fail |
| 11 lỗi integration trên gốc (lần chạy đầu) | **ENVIRONMENT** (do cách tôi dựng môi trường, không phải code) | (1) worktree không có `.env` → "Academic email verification is not configured"; (2) worktree nằm trong thư mục `.p0-base` → Express `sendFile` từ chối đường dẫn có thư mục bắt đầu bằng dấu chấm (404 → 500). Chuyển sang thư mục thường và cấp `.env`: gốc 148/148 |
| Bất kỳ lỗi nào do P0 gây ra | **INTRODUCED BY P0: không có** | Mọi file fail trên P0 đều fail y hệt trên gốc |
| Mobile | **NOT VERIFIED** | Toolchain bị chặn |

### 4.4 Test P0 mới chạy trên code gốc (chứng minh test bắt được hành vi cũ)

| Test | Trên `5a9d228` |
|---|---|
| Đơn vị (lượt trước): budget/429/provenance, nhất quán, local SQL + cửa sổ + keyword, p chính xác, home, G0 | 21/30 fail như mong đợi; 9 pass gồm 7 tham chiếu G0, benchmark và "no mailto" (test yếu) |
| `trend.openalex-client-startup.test.ts` | 2/4 fail (không cảnh báo; key nằm trong URL `…&api_key=secret-key`) |
| `trend.local.integration.test.ts` | 3/4 fail: đếm trùng (2 test) và test N_t (xem §7.2) |
| `trend-provenance-ui.test.tsx` | 5/6 fail (không có nhãn p/q, không có thời điểm lấy dữ liệu) |

---

## 5. Rủi ro còn lại

| # | Rủi ro | Mức | Hướng xử lý |
|---|---|---|---|
| R1 | Mobile vẫn hiển thị kết luận từ số thô ("growing rapidly", màu theo `momentum`) | Trung bình (người dùng mobile thấy) | Sửa ở `home_screen.dart` khi có Flutter SDK ≥ 3.12 để kiểm chứng; đề xuất ở §7.4. Cần anh/chị quyết định |
| R2 | Local path: mẫu số N_t của overview khác trang chi tiết (§7.2) | Thấp (verdict local luôn "insufficient"; chỉ số mô tả lệch) | Thống nhất N_t local ở P1.1 (Series Provider) |
| R3 | Chưa biết production có `OPENALEX_API_KEY` | Cao cho P2 | Đội xác nhận (máy dev đã có key) |
| R4 | Family BH vẫn phụ thuộc `limit` (150 ứng viên khi `limit = 50`) | Trung bình | Đã có trong 03 (#6) / P2; P0 chỉ hiển thị `qFamilySize` để minh bạch |
| R5 | Gaps và trang đọc bài báo vẫn hiển thị `growthRatePct` thô, không ghi "raw" | Thấp–TB | P1.3 |
| R6 | 23 file test tự bỏ qua theo flag riêng và e2e chưa chạy | Thấp (không liên quan trends) | Ngoài phạm vi P0 |
| R7 | Thay đổi chưa commit | — | Chờ duyệt |

## 6. Trạng thái

Kiểm chứng cuối đã xong. Quyết định nghiệm thu và bảng tiêu chí: `P0_RELEASE_READINESS.md`. **Dừng ở P0, không bắt đầu P1.**

---

## 7. Kiểm tra khoa học lần cuối

### 7.1 Đếm công bố không trùng ngoài ý muốn — **PASS**
- OpenAlex: mọi chuỗi đếm topic/field dùng `primary_topic.*` (một work có đúng một primary topic). Các nhóm đa trị (`topics.id` cho quan hệ đồng xuất hiện, `keywords.id`, `authorships.author.id`) chỉ dùng làm danh sách top, không cộng thành tổng.
- Local: đếm xu hướng chỉ theo `is_primary = TRUE` (test tích hợp trên PostgreSQL; trên code gốc fail).
- Có chủ đích, không phải lỗi: facet taxonomy của Data Scope (danh sách để lọc) vẫn đếm bài theo mọi topic được gán, vì đây là phạm vi lọc chứ không phải số liệu xu hướng.
- Chưa đo (ngoài phạm vi P0): bản preprint và bản xuất bản của cùng một nghiên cứu có thể bị OpenAlex đếm hai lần.

### 7.2 Overview và Detail dùng cùng phạm vi dữ liệu — **PARTIAL**
- **OpenAlex path: PASS.**
  - Unit test: cùng chuỗi filter.
  - **Dữ liệu thật** (field 17, 2016–2025, 8 topic gồm 5 đầu danh sách và 3 cuối danh sách, có cả "stable"): S, p, Sen, số năm, số bài **giống hệt**.
  - q của overview và p của detail khác nhau đúng như thiết kế (ví dụ: q = 0,0116 vs p = 0,0091, cùng "rising").
- **Local path: PARTIAL.**
  - Số bài của topic n_t: **giống nhau** (test tích hợp).
  - Mẫu số N_t: **khác nhau**. Overview chia cho mọi bài trong Data Scope; trang chi tiết chia cho bài có primary topic thuộc field.
  - Dữ liệu thăm dò cùng cơ sở dữ liệu:

    | Trường hợp | `5a9d228` (overview / chi tiết) | P0 (overview / chi tiết) |
    |---|---|---|
    | Lọc theo field | 10 / 10 | 10 / **6** |
    | Không lọc | 13 / **10** | 13 / **6** |

  - Kết luận: sự lệch **đã có từ trước** (trường hợp không lọc). P0.4 đổi N_t của trang chi tiết sang định nghĩa của OpenAlex (primary topic thuộc field), nên lệch thêm ở trường hợp lọc theo field.
  - Ảnh hưởng: verdict local luôn "insufficient" (LOCAL_CORPUS), chỉ con số mô tả bị lệch.
  - Được giữ hiển thị bằng `it.fails` trong `trend.local.integration.test.ts`: test sẽ đỏ khi hai mẫu số được thống nhất, nên không thể "lặng lẽ" che đi.
  - Đề xuất sửa ở P1.1 (Series Provider dùng chung). Trang chi tiết local cũng **chưa áp Data Scope** (ví dụ `paperKinds`); điều này có từ trước và thuộc cùng hạng mục.

### 7.3 p-value / q-value được diễn giải đúng — **PASS**
- Overview: q của Benjamini–Hochberg, UI ghi "across n topics".
- Detail: p của một giả thuyết, UI ghi "not adjusted".
- Cả hai có test UI.
- p chính xác **chỉ** dùng khi n ≤ 10 **và** không có ties (`tieTerm === 0 && n ≤ MANN_KENDALL_EXACT_MAX_N`), trường `pValueMethod` cho biết cách tính. Đã đối chiếu với liệt kê đầy đủ n! cho mọi S, n = 3…10. Có ties → xấp xỉ chuẩn (có test).
- Dữ liệu thật (150 topic, n = 10): 150/150 dùng p chính xác. Theo bộ tiêu chí hiện tại, kết luận **không đổi** (rising/high 41, declining/high 73, rising/medium 7, declining/medium 4, stable 25 với cả hai cách tính p).

### 7.4 Nhãn "Hot" không căn cứ và chỉ số thô — **PARTIAL**
- Web: không còn "Hot", "Hot Signal", "Exploratory"; YoY hiển thị là "YoY (raw)" kèm chú thích "Descriptive only…". Từ khoá chỉ được chọn qua kiểm định (log OR, q, ngưỡng hỗ trợ).
- **Mobile (có sẵn, chưa sửa):**
  - `home_screen.dart:258-270`: màu và mũi tên theo dấu `momentum`, chữ "x% growth".
  - `home_screen.dart:426`: "Topic … is growing rapidly…" cho 2 topic đầu, bất kể verdict.
  - Đề xuất sửa:
    1. `sortBy: 'trend'`.
    2. Bỏ màu và mũi tên theo `momentum`, hiện "YoY (raw) ±x%" màu trung tính.
    3. Thay câu "growing rapidly" bằng "{topic}: {n} papers, YoY (raw) ±x%. Raw counts, not a trend test — open Trends for the verdict."
  - **Chưa áp dụng** vì không biên dịch/test được Flutter ở máy này (cần Dart ≥ 3.12).
- Ngoài phạm vi P0 (P1.3): Gaps và thẻ đọc bài báo còn hiện `growthRatePct` thô không ghi "raw".

### 7.5 GGT chưa được triển khai hay dùng để kết luận — **PASS**
`grep -i ggt` trên mã backend, web và shared-types (trừ code Prisma sinh tự động): không có kết quả.

### 7.6 Provenance phản ánh thời điểm lấy dữ liệu thật — **PASS**
- Unit test với đồng hồ giả: lấy ngày 21/10, đọc từ cache ngày 23/10 → `fetchedAt` vẫn là 21/10.
- Dữ liệu thật: lần chạy live thứ hai (đọc toàn bộ từ cache) trả cùng `fetchedAt = 2026-10-21T14:13:27.740Z` với lần đầu.
- Không có trường "classifier version".
