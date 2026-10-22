# 02 — Current System Audit

> Checkpoint 1 · Ngày lập: 2026-10-21 · Kiểm tra trên mã nguồn hiện có trong `D:\K9\lumi-gap` (thư mục không phải git repo nên không có commit hash; mọi tham chiếu là `file:dòng` tại ngày lập).
> Nguyên tắc: kết luận dựa trên logic đã đọc, không dựa trên tên hàm hay tài liệu `docs/*.md`. Spec `docs/superpowers/specs/2026-10-16-trend-methodology-design.md` chỉ được dùng để biết **ý định**; mọi khẳng định đều đối chiếu lại với code.

---

## 1. Kiến trúc tổng quan

```
Web (React)                                   Backend (Express 5)                          Nguồn dữ liệu
─────────────                                 ───────────────────                          ─────────────
pages/trends.tsx  (5 tab: overview,           GET  /api/v1/trends            ─┐
  topics, dataset, compare, ai)                GET  /api/v1/trends/:topic      │  trend.service.ts
pages/trends-topic.tsx (chi tiết topic)        GET  /trends/compare            │  preferOpenAlex(…)
features/home/… (trang chủ)                    GET  /trends/topic-candidates   ├─▶ OpenAlex group_by  ─▶ api.openalex.org
                                               GET  /trends/relationships      │   (cache Redis 7 ngày)
                                               POST /trends/explain (LLM)      │
                                               GET  /trends/explain/history   ─┘─▶ fallback PostgreSQL (papers, paper_topics, paper_keywords)
home.postgres.ts ─────────────────────────────▶ getPostgresTrendsOverview (CHỈ PostgreSQL)
```

| Thành phần | File chính |
|---|---|
| Routes / controller | `apps/backend/src/modules/trends/trend.routes.ts`, `trend.controller.ts` |
| Điều phối, fallback | `trend.service.ts` (`preferOpenAlex`, `topic`, `compare`, …) |
| OpenAlex client | `trend.openalex-client.ts` |
| Bộ lọc → OpenAlex filter | `trend.openalex-scope.ts` |
| Overview (OpenAlex) | `trend.openalex-overview.ts` |
| Topic/compare/candidates/relationships (OpenAlex) | `trend.openalex-detail.ts` |
| Thống kê chi tiết 1 topic | `trend.evidence.ts` |
| Overview (PostgreSQL) | `trend.postgres.ts` |
| Kiểm định | `trend.statistics.ts` |
| Kết luận (verdict) và xếp hạng | `trend.verdict.ts` |
| Chỉ số đếm thô (deprecated) | `trend.formulas.ts` |
| LLM giải thích | `trend-explain.prompt.ts`, `trend.service.ts:65-90` |
| Code chết (Mongo cũ) | `trend.filters.ts:48-130` (`buildTrendMatchStage`, `buildUnwoundTopicMatch`, `describeAppliedTrendFilters`: chỉ test gọi) |
| Kiểu dùng chung | `packages/shared-types/src/trend.ts` |

**Không có**: worker xử lý xu hướng định kỳ, bảng lưu kết quả xu hướng, snapshot dữ liệu. Mọi con số được tính **lúc request**, chỉ có cache Redis cho phản hồi OpenAlex thô (`trend.openalex-client.ts:14-15`, TTL 7 ngày, `CACHE_VERSION = "v2"`). `apps/backend/src/workers/` không có worker nào cho trends.

---

## 2. Kết nối OpenAlex

`trend.openalex-client.ts`

| Hạng mục | Thực tế trong code | Đối chiếu tài liệu OpenAlex (2026-10) |
|---|---|---|
| Kiểu truy vấn | Chỉ `group_by` trên `/works` (1 trang, `per_page=200`), và `/topics` cho entity | `group_by` tối đa 200 nhóm/trang; trang đầu sắp theo count giảm dần (kiểm tra thực tế 2026-10-21), trang cursor sắp theo key — code dùng đúng |
| Định danh | gửi `mailto` (`:73`) và `api_key` (`:74`) qua query | `mailto`/polite pool **đã bị bỏ, bị bỏ qua** từ trước 02/2026 |
| Ngân sách | `MIN_REMAINING_CREDITS = 1000` (`:19`); nếu header `x-ratelimit-remaining < 1000` thì khóa OpenAlex tới khi reset (`:112-119`) | Hiện tại: không key = **1.000 credit/ngày** chung cho cả IP (header thực tế `X-RateLimit-Limit: 1000`), key miễn phí = 10.000 credit/ngày ($1); list/group_by = 1 credit, search = 10 |
| Retry | 2 lần cho 429/5xx, backoff 1s, 2s | Ổn |
| Biến môi trường | `OPENALEX_API_KEY` là **tùy chọn** (`config/env.ts:153`) | — |
| `corpus` | Không gửi → mặc định `core` | Từ 08/2026 có tham số `corpus=core|expansion|all`; mặc định core |

**Phát hiện F1 (nghiêm trọng, có điều kiện):** khi không cấu hình `OPENALEX_API_KEY`, giới hạn ngày chỉ là 1.000 credit. Ngay request đầu tiên `remaining` = 999 < 1000 → `budgetExhaustedUntil` được đặt tới lúc reset (có thể ~24 giờ) → **mọi endpoint xu hướng chuyển sang dữ liệu local** → mọi verdict là `insufficient (LOCAL_CORPUS)`. Với key miễn phí, trend chỉ dùng được ~9.000 credit/ngày rồi cũng rơi về local. Biến `budgetExhaustedUntil` nằm trong bộ nhớ từng process, nên nhiều instance không chia sẻ trạng thái. *Không kiểm tra được `.env` production (bí mật) → cần đội xác nhận.*

---

## 3. Từng thuật toán

### 3.1 Thị phần trong field (cốt lõi của verdict)

- **Vị trí:** `trend.openalex-overview.ts:146-213` (`buildTopics`), `trend.evidence.ts:67-94` (`buildStatistics`), `trend.postgres.ts:347-393`.
- **Input:** `n_t` = số works có `primary_topic.id = T` trong năm `t` (đã áp Data Scope); `N_t` = số works có `primary_topic.field.id = field của T`, cùng scope **trừ** mệnh đề taxonomy (`nonTaxonomyFilter`).
- **Công thức:** `s_t = n_t / max(N_t, n_t) × 100`, chỉ các năm `yearFrom … lastCompleteYear` có `N_t > 0`.
- **Nguồn:** OpenAlex aggregate (overview); OpenAlex hoặc local (chi tiết).
- **Giả định:** primary topic đại diện cho bài; field là quần thể tham chiếu đúng; năm đã qua là năm "hoàn chỉnh".
- **Cơ sở khoa học:** Có. Chia cho quần thể tham chiếu khử record inflation (Nelis 2022 §1.1; Rotolo §4.2 "relatively fast growth … compared to"). Field-relative là biến thể được Nelis cho phép ("discipline-specific PO").
- **Vấn đề có thể gây sai lệch:** xem F2, F4, F8, F10.

### 3.2 Mann–Kendall

- **Vị trí:** `trend.statistics.ts:36-61` (`mannKendall`).
- **Công thức:** `S = Σ sgn(x_j − x_i)`; `Var(S)` có hiệu chỉnh ties; `Z` có continuity correction; p hai phía từ phân phối chuẩn; `τ = S / (n(n−1)/2)`. Trả `null` khi `n < 3` hoặc `Var(S) = 0`.
- **Đối chiếu:** đúng với Helsel et al. (2020). Unit test có (`trend.statistics.test.ts`, 14 test).
- **Giả định không được kiểm tra:** chuỗi độc lập (không tự tương quan); xấp xỉ chuẩn kể cả khi `n ≤ 10` (spec §4.3 đã tự ghi nhận cả hai).
- **Vấn đề:** p có thể nhỏ hơn thực tế với chuỗi thị phần trơn (tự tương quan dương) → verdict "rising/declining" có thể quá lạc quan. Không có số liệu đo mức ảnh hưởng.

### 3.3 Sen's slope và CI95

- **Vị trí:** `trend.statistics.ts:68-121`.
- **Công thức:** trung vị các độ dốc cặp; CI theo phương pháp hạng: `C = z_{1−α/2}√Var(S)`, hạng dưới `(N'−C)/2`, hạng trên `(N'+C)/2 + 1`, nội suy tuyến tính. Đơn vị: điểm %/năm của thị phần.
- **Đối chiếu:** đúng với Gilbert (1987) §16.5, Helsel et al. (2020).

### 3.4 Benjamini–Hochberg

- **Vị trí:** `trend.statistics.ts:142-156`; dùng ở `trend.openalex-overview.ts:197` (qua các topic ứng viên), `:267` (qua các keyword), `trend.postgres.ts:386`.
- **Đối chiếu:** đúng.
- **Vấn đề:** "họ giả thuyết" (family) là **tập ứng viên của một request**. Đổi `limit` (10 → 50) làm đổi số ứng viên (`candidateLimit = min(200, max(30, limit×3))`, `:157`) → đổi q-value → **cùng một topic có thể đổi verdict chỉ vì người dùng đổi số dòng hiển thị**.

### 3.5 Verdict và xếp hạng

- **Vị trí:** `trend.verdict.ts:90-116` (`classifyTrend`), `:126-141` (`compareByTrend`).
- **Quy tắc:** local → insufficient; `n < 5` → insufficient; tổng bài < 30 → insufficient; `p* < 0.05` và `S > 0` → rising; `S < 0` → declining; còn lại → stable. `p*` = q-value ở overview, p-value ở trang chi tiết. Confidence `high` khi `p* < 0.01` và `n ≥ 8`.
- **Xếp hạng "trend":** rising (theo `relativeChangePct = Sen / median(s_t) × 100` giảm dần) → stable → declining → insufficient.
- **Cơ sở:** `MIN_YEARS = 5` là suy ra toán học (đúng: n = 4 không thể đạt p < 0.05 với xấp xỉ chuẩn). `MIN_PAPERS = 30`, ngưỡng confidence là **quy ước dự án** (code và spec đều ghi rõ). `relativeChangePct` là quy ước trình bày, không phải kiểm định.
- **Test:** `trend.verdict.test.ts` (17 test) phủ từng dòng quy tắc.

### 3.6 Từ khóa nổi lên (log odds ratio)

- **Vị trí:** `trend.openalex-overview.ts:243-297` (overview), `trend.evidence.ts:101-132` (chi tiết), `trend.statistics.ts:183-194`.
- **Input:** các năm hoàn chỉnh chia đôi thành kỳ A (đầu) và B (sau); với mỗi keyword trong top 50 của mỗi kỳ (`group_by=keywords.id`), đếm số bài chứa keyword ở A và B; tổng `totalA`, `totalB` = số bài của **toàn scope** (overview) hoặc của **topic** (chi tiết).
- **Công thức:** log OR với +0.5 (Haldane), SE Woolf, z, p hai phía; BH trên các keyword; xếp theo `z` giảm dần; lấy 10 keyword `z > 0`.
- **Vấn đề:**
  - Overview: `totalA`/`totalB` là **hàng triệu bài** → SE rất nhỏ → gần như mọi keyword đều có q ≈ 0. Xếp theo `z` thì keyword **phổ biến** đứng đầu dù mức tăng tương đối nhỏ (z tăng theo √N). Đây là xếp hạng theo độ lớn mẫu, không theo tốc độ nổi lên.
  - OpenAlex Keywords được **sinh lại bằng mô hình mới (v3, cập nhật 05/10/2026)**, danh mục "not fixed", ID có thể gộp/tách. Khoảng 11% works không có keyword nhưng vẫn nằm trong mẫu số `totalA/B`.
  - Chia đôi cửa sổ là quy ước, không có căn cứ trong 4 bài.

### 3.7 PP(top 10%)

- **Vị trí:** `trend.openalex-overview.ts:100-103`, `trend.openalex-detail.ts:234-246`, `trend.evidence.ts:87-91`.
- **Công thức:** số works có `citation_normalized_percentile.is_in_top_10_percent = true` / số works × 100; 10% là mức trung bình thế giới.
- **Cơ sở:** Waltman & Schreiber (2013). Tốt hơn tổng/trung bình trích dẫn vì đã chuẩn hóa theo năm, loại, subfield.
- **Vấn đề:** các năm gần (1–3 năm cuối) có cửa sổ trích dẫn ngắn → percentile chưa ổn định; OpenAlex tính percentile theo **subfield của primary topic**, nên đã **thay đổi cho hầu hết works khi đổi classifier tháng 10/2026**.

### 3.8 Chỉ số đếm thô (deprecated nhưng vẫn tính và vẫn dùng)

- **Vị trí:** `trend.formulas.ts:49-101`: `yoyGrowthPct` (mẫu số kẹp ≥ 1 → 0→5 thành +500%), `cagrPct` (3 năm), `linearSlope` (OLS bài/năm). `computeMetrics` loại năm chưa hoàn chỉnh.
- **Vấn đề:** đều chịu **record inflation bias** (Nelis 2022). Shared types đã đánh dấu `@deprecated` (`packages/shared-types/src/trend.ts:76-102`) nhưng:
  - Web gắn nhãn **"Hot"** cho keyword khi `growthRatePct > 100` (`apps/web/src/pages/trends.tsx:287`) và **"Hot Signal"** khi `> 50` với ≥ 15 bài (`apps/web/src/features/trends/components/topics-tab.tsx:207-213`) — trái với spec §7.2 "không còn nơi nào … gắn nhãn theo YoY".
  - `trends.tsx:284` hiển thị `+${growthRatePct}%`: nếu YoY âm thì ra **"+-12.3%"**. Ở OpenAlex, keyword được chọn theo `z` của hai kỳ, nên YoY năm cuối có thể âm.
  - Module Gaps dùng CAGR thô để quyết định "parent topic đang tăng" (`apps/backend/src/modules/gaps/gap-evidence.ts:118-120`); `evaluation.service.ts` cũng gọi `computeMetrics`.

### 3.9 Topic resolution

- **Vị trí:** `trend.openalex-detail.ts:202-218` (`resolveOpenAlexTopic`), `:163-174` (`searchTopicsByName`), `:425-459` (candidates).
- **Logic:** (1) topicId tường minh → `/topics/{id}`; (2) tên → tra bảng local `paper_topics`; (3) tìm `display_name.search` và **chỉ nhận tên khớp chính xác** (không phân biệt hoa thường). Candidates: `display_name.search`, sắp theo `works_count`, rồi lọc `minPapers`.
- **Đánh giá:** khớp chính xác là chọn lựa an toàn (tránh "Topic Modeling" → "Geological …" như code ghi chú).
- **Giới hạn:** chỉ resolve được **Topic** (4.516). Người dùng gõ "Artificial Intelligence" sẽ không ra topic vì đó là **subfield 1702** — không có đơn vị phân tích ở cấp subfield/field. Không có ánh xạ keyword → topic.
- **Lỗi nhỏ (local):** `trend.service.ts:22` lọc `openalexTopicId: { contains: topicId }` → so khớp chuỗi con (ví dụ "T1002" khớp "T10028"). Ảnh hưởng thấp vì ID OpenAlex hiện đều 5 chữ số.

### 3.10 Lựa chọn khoảng thời gian

- Mặc định OpenAlex: `yearTo = năm hiện tại`, `yearFrom = yearTo − 10` (11 năm dương lịch, 10 năm hoàn chỉnh) — `trend.openalex-overview.ts:74-76`, `trend.openalex-detail.ts:87-91`, `trend.service.ts:19-21`.
- Mặc định PostgreSQL: `yearFrom = yearTo − 5` (`trend.postgres.ts:24`) → **cửa sổ khác nhau tùy nguồn**.
- `lastCompleteYear = min(yearTo, năm hiện tại − 1)`. Không tính đến độ trễ index của OpenAlex (Nelis đã bỏ 3 năm gần nhất vì lý do tương tự). Thị phần giảm nhẹ ảnh hưởng nhưng không loại bỏ (độ trễ khác nhau theo loại tài liệu).
- Web: `DEFAULT_TREND_YEAR_FROM = năm hiện tại − 10` (`apps/web/src/pages/trends.insights.ts:99-100`).
- Không có lựa chọn **baseline** (field cố định; không có global/domain/subfield).

### 3.11 Thu thập dữ liệu công bố

- OpenAlex path: không tải bản ghi, chỉ đếm (`group_by`). Loại mặc định: `article|review|preprint|conference-paper|book-chapter` (`trend.openalex-scope.ts:40`) — đúng khuyến nghị OpenAlex là lọc theo loại (dataset có thể chiếm hàng chục triệu bản ghi). Rủi ro: preprint và bản xuất bản của cùng nghiên cứu có thể bị đếm hai lần nếu OpenAlex chưa gộp (chưa đo được mức độ).
- Local path: các bài đã sync/ingest (`papers`, `paper_topics`, `paper_keywords`). `paper_topics` có cột `is_primary` (`apps/backend/prisma/scholarly.prisma:200`), nhưng truy vấn xu hướng local **không lọc `is_primary`** (F4).

### 3.12 Caching

- Phản hồi OpenAlex thô: Redis, 7 ngày, best-effort, key = hash(path, params) (`trend.openalex-client.ts:65-79`).
- Không cache kết quả đã tính, không lưu lịch sử. Một overview chưa cache tốn ~80 request (theo chú thích `trend.openalex-overview.ts:28-31`).
- Giải thích LLM được lưu (`trend_explanation`), cache LLM 7 ngày.

---

## 4. Các luồng sản phẩm hiện có

| Màn hình | Nguồn | Hiển thị gì |
|---|---|---|
| **Trang chủ** (`home.postgres.ts:14`) | **Chỉ PostgreSQL**, `limit 6`, cửa sổ 5 năm | Biểu đồ tổng bài, top topic. Vì nguồn local nên **mọi verdict = insufficient** → thứ tự thực chất là **số bài trong kho đã sync**, không phải xu hướng khoa học (F3) |
| **/trends – Overview/Topics** | OpenAlex → fallback local | Verdict, q-value, Sen, CI, relative change; keyword nổi lên; nhãn Hot/Hot Signal (F5) |
| **/trends – Compare** | `getOpenAlexCompare` (`trend.openalex-detail.ts:389-418`) | **Chuỗi số bài thô** + chỉ số deprecated; verdict được **mượn từ dữ liệu overview theo tên** (`compare-tab.tsx:277-294`) → topic không nằm trong top overview không có verdict. Có câu khuyến nghị "Focus on this direction" dựa trên verdict + PP(top10) (`compare-tab.tsx:~344`) — mạnh hơn mức bằng chứng cho phép |
| **/trends/:topic** | Chi tiết: OpenAlex có scope; thống kê: `computeTopicStatistics` | Biểu đồ + bằng chứng thống kê (F2) |
| **AI tab** | LLM với số liệu được whitelist (`buildAllowedTrendNumbers`) | Giải thích có kiểm tra số — thiết kế tốt |

---

## 5. Kiểm thử và kiểm chứng

- Đã chạy `vitest run src/modules/trends` ngày 2026-10-21: **10 file, 107 test, tất cả pass** (log cảnh báo "db down"/"OpenAlex 503" là kịch bản fallback có chủ đích).
- Có test cho: công thức MK/Sen/CI/BH/log OR, từng dòng verdict, scope builder, OpenAlex overview/detail (mock fetch), evidence fallback, LLM explain validation.
- Web: `trends.insights.test.ts`, `trend-helpers.test.ts`.
- **Thiếu:**
  - Test **nhất quán** giữa overview và trang chi tiết (cùng topic, cùng scope → cùng verdict).
  - Test với **đường cơ sở tham chiếu thật** (golden dataset): chưa có bộ dữ liệu đã biết đáp án (ví dụ lấy từ bảng của Nelis 2022 hoặc ví dụ của Kleinberg).
  - Test cho logic ngân sách theo header thật của OpenAlex.
  - Đánh giá thực nghiệm (backtest) xem "rising" có dự đoán đúng các năm sau hay không.

---

## 6. Danh sách phát hiện (ID dùng trong 03–05)

| ID | Mức | Phát hiện | Bằng chứng |
|---|---|---|---|
| **F1** | Cao (có điều kiện) | Ngưỡng ngân sách 1.000 credit chặn OpenAlex ngay khi không có API key; với key chỉ dùng ~90% | `trend.openalex-client.ts:19,112-119`; header thực tế `X-RateLimit-Limit: 1000` |
| **F2** | Cao | Trang chi tiết: verdict tính trên quần thể **khác** biểu đồ (bỏ qua Data Scope), dùng p thay q, và có thể **trộn nguồn** (chi tiết local + thống kê OpenAlex hoặc ngược lại) → khác verdict với overview | `trend.service.ts:50-57`; `trend.evidence.ts:138-162` (chỉ `DEFAULT_WORK_TYPES_CLAUSE`); `trend.openalex-detail.ts:321-323` (có scope) |
| **F3** | Cao | Trang chủ chỉ dùng dữ liệu local → "xu hướng" trên trang chủ là thứ tự kích thước kho dữ liệu | `home.postgres.ts:14`; `trend.verdict.ts:103` |
| **F4** | Trung bình | Local đếm mọi topic gán cho bài (tối đa 3+), OpenAlex chỉ đếm primary → định nghĩa đơn vị khác nhau giữa hai nguồn | `trend.postgres.ts:67-87`; `trend.service.ts:22`; `trend.evidence.ts:242-258` |
| **F5** | Trung bình | Nhãn "Hot"/"Hot Signal" dựa trên YoY thô, ngưỡng 100%/50% không có nguồn; hiển thị "+-x%" | `trends.tsx:284,287`; `topics-tab.tsx:207-213` |
| **F6** | Trung bình (giới hạn thiết kế) | Chỉ kiểm định 30–200 topic **lớn nhất** → không thể phát hiện topic nhỏ đang nổi; family BH phụ thuộc `limit` | `trend.openalex-overview.ts:157-161` |
| **F7** | Trung bình | Keyword nổi lên xếp theo `z` với N hàng triệu → ưu tiên keyword phổ biến; keyword OpenAlex vừa đổi mô hình | `trend.openalex-overview.ts:277-280`; tài liệu OpenAlex Keywords (2026-10-05) |
| **F8** | Cao (khoa học) | Không tái lập được: không lưu snapshot/phiên bản dữ liệu; OpenAlex đổi classifier topic **tháng 10/2026** và keyword v3; không ghi `corpus` | `trend.openalex-client.ts:14-15`; tài liệu OpenAlex Topics |
| **F9** | Trung bình | MK giả định độc lập; p xấp xỉ chuẩn khi n ≤ 10 | `trend.statistics.ts:36-61`; spec §4.3 |
| **F10** | Thấp–TB | `lastCompleteYear = năm trước` bỏ qua độ trễ index | `trend.openalex-overview.ts:76` |
| **F11** | Thấp–TB | PP(top10%) năm gần chưa ổn định, đổi theo classifier | §3.7 |
| **F12** | Thấp | `contains` khi lọc topicId local | `trend.service.ts:22` |
| **F13** | Thấp | Cửa sổ mặc định khác nhau: OpenAlex 10, local 5 | `trend.postgres.ts:24` vs `trend.openalex-overview.ts:34` |
| **F14** | Thấp | Chú thích trỏ tới file không tồn tại `apps/web/src/features/trends/trend-methodology.ts` | `trend.statistics.ts:6` |
| **F15** | Thấp | Code chết từ thời MongoDB | `trend.filters.ts:48-130` |
| **F16** | Trung bình (ngoài module) | Gaps dùng CAGR thô để kết luận "đang tăng" | `gaps/gap-evidence.ts:118-120` |
| **F17** | Thấp–TB | Compare chỉ so chuỗi thô; verdict mượn theo tên từ overview; câu khuyến nghị mạnh | `trend.openalex-detail.ts:389-418`; `compare-tab.tsx:277-294,~344` |
| **F18** | Thấp | Gửi `mailto` đã bị OpenAlex bỏ qua | `trend.openalex-client.ts:73` |

---

## 7. OpenAlex Audit (Phase 3)

Nguồn: help.openalex.org (đọc ngày 2026-10-21: API overview, Grouping, Authentication, Pricing, Example costs, Works corpus, Topics, Keywords, Citations, Work attributes, Deprecations) và 4 request đọc-only không key tới api.openalex.org để kiểm tra header và thứ tự group_by.

| # | Hạng mục | Tài liệu OpenAlex nói gì | Code hiện tại | Kết luận |
|---|---|---|---|---|
| 1 | Domain/Field/Subfield/Topic | 4 domain, 26 field, 252 subfield, 4.516 topic; topic là cấp chi tiết nhất | Đơn vị = Topic; tham chiếu = Field | Đúng. Thiếu khả năng phân tích ở cấp Subfield/Field |
| 2 | Primary topic vs topics | Mô hình Qwen3-8B đọc title + abstract + tên nguồn; `primary_topic` = topic xác suất cao nhất; `topics` = top 3, score là xác suất hiệu chỉnh; ~10% works không có topic | OpenAlex: `primary_topic.*` (đúng, không đếm trùng). Local: mọi topic (F4). Relationships: `topics.id` (đúng mục đích đồng xuất hiện) | Giữ primary cho đếm; sửa local |
| 3 | Works API & đếm | `meta.count` chính xác; `group_by` tối đa 200 nhóm/trang; trang đầu theo count giảm dần (kiểm tra thực tế); cursor theo key | Dùng trang đầu, `per_page=200` | Đúng cho năm (≤ 200 năm) và top-N; **không** dùng được để liệt kê đầy đủ 4.516 topic (cần cursor) |
| 4 | Lọc/nhóm theo năm | `publication_year` thường là ngày online đầu tiên | `publication_year:a-b` + `group_by=publication_year` | Đúng. Không dùng tháng (ngày thiếu → 01-01) |
| 5 | Tổng hợp nhiều topic | Một work có đúng 1 primary topic | Overview tính từng topic riêng; thị phần các topic trong field cộng ≤ 100% | Đúng. Nếu sau này gộp nhiều topic thành "chủ đề người dùng" phải dùng filter OR `primary_topic.id:A|B` trong **một** request để không đếm trùng |
| 6 | Đếm trùng 1 publication | `topics.id`, `keywords.id`, `authorships.author.id` là đa trị — tài liệu Grouping không nói rõ một work được đếm vào nhiều nhóm hay không (theo bản chất đa trị thì có) | Keyword/author dùng như danh sách top, không cộng dồn | Chấp nhận được; **không được cộng** các nhóm đa trị để ra tổng |
| 7 | Citation & độ trễ | `cited_by_count` theo khớp tham chiếu (có thể thấp hơn thực); FWCI = cửa sổ năm xuất bản + 3 năm, chuẩn hóa theo năm/loại/subfield; percentile là cùng thông tin dạng phân vị | Dùng `is_in_top_10_percent`; không dùng tổng trích dẫn | Đúng hướng; cần cảnh báo năm gần (F11) |
| 8 | Coverage & missing | Core > 320 triệu works; expansion ~190 triệu (dataset, repository) chỉ khi `corpus=all`; ~10% không có topic; ~11% không có keyword | Loại mặc định 5 type; không gửi `corpus` | Đúng (core mặc định). Tổng OpenAlex theo năm (5 type) giảm ở 2021–2022 rồi tăng lại (8,17 tr → 7,74 tr → 8,15 tr) — dấu hiệu biến động phủ dữ liệu, càng cho thấy phải chuẩn hóa theo tham chiếu |
| 9 | Rate limit & cache | Không key: $0,10/ngày ≈ 1.000 credit, 10 req/s, chung theo IP; key miễn phí: $1/ngày ≈ 10.000 credit, 30 req/s; header `X-RateLimit-Remaining` tính bằng credit, có thêm `-USD` | Ngưỡng 1.000 credit; cache 7 ngày | F1 |
| 10 | Thay đổi phân loại gần đây | **10/2026**: classifier mới thay classifier cũ (danh sách topic giữ nguyên, **assignment đổi**, thay đổi lớn nhất ở works không abstract, không tiếng Anh, dataset); FWCI/percentile đổi theo. Classifier cũ còn ở `/text/topics?version=1` tới 13/01/2027; topic cũ đóng băng ở release v2.0.0 (05/10/2026). Keywords v3 (05/10/2026), danh mục thay đổi liên tục, "store keyword IDs with the date you fetched them" | Không ghi phiên bản; cache 7 ngày có thể trộn số liệu trước/sau khi đổi | F8 |
| 11 | Tái lập thống kê lịch sử | Không có tham số "as-of date" cho API; chỉ snapshot (S3) mới cố định | Tính lại mỗi lần, không lưu | **Không tái lập được**. Cần lưu chuỗi đã dùng + ngày lấy + phiên bản |

### 7.1 Pipeline hiện tại có hỗ trợ GGT và các thuật toán khác không?

| Thuật toán | Dữ liệu cần | Đã có trong pipeline? | Thiếu gì |
|---|---|---|---|
| **GGT field-relative** | `n_t` (topic), `N_t` (field) theo năm | **Có** — chính là hai chuỗi đang dùng cho thị phần (`trend.openalex-overview.ts:166,174-177`) | Chỉ cần hàm tính + trả về; không tốn thêm request |
| **GGT global** (đúng mặc định của Nelis) | `PO_t` toàn OpenAlex cùng scope | **Gần có** — `baseYears` của overview (`:98`) là tổng scope; trang chi tiết đã có nhánh "corpus" khi không biết field | 1 request/scope, dùng lại cho mọi topic |
| **Kleinberg (batched)** | `r_t = n_t`, `d_t = N_t` | **Có dữ liệu** | Hàm Viterbi 2 trạng thái + hiệu chỉnh tham số (01 §3.3) |
| **EScore-style** | Đếm keyword theo năm, tổng theo năm, số tác giả theo keyword | **Một phần** — đã có đếm keyword theo kỳ (`openAlexKeywordCounts`) | Chuỗi năm đầy đủ cho mỗi keyword (1 request/keyword), kiểm tra tác giả (1 request/keyword) → tốn credit, phải chạy nền |
| **Rotolo (giải thích)** | Kết quả của các thuật toán trên + PP(top10) | **Có phần lớn** | Lớp trình bày "thuộc tính nào có bằng chứng" |
