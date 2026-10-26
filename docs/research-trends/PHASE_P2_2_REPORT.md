# PHASE P2.2 — Discover Trends API & Web UI (Checkpoint 2)

> Ngày: 2026-10-23. Nhánh `feat/research-trends-p0`. Nền: `3a2b4e7` (cổng P2.1 và bằng chứng canary, đã commit ở bước 0, trên `5be50d5`).
> Thay đổi P2.2 **chưa commit**.
> Phạm vi: chỉ P2.2 của `05_IMPLEMENTATION_PLAN.md`. Không làm P3/P4/P5, không deploy, không migration lên DB dev hay production, không sửa mobile.

## 0. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| API | `GET /api/v1/trends/discover`: chỉ đọc snapshot OpenAlex **active**, không gọi OpenAlex, không tính lại; provenance ở response và ở **mọi** item |
| Danh sách | Trending, Fastest Growing, Trending by Field. Không có Emerging, Hot Right Now, burst hay EScore; API từ chối các giá trị đó (400) |
| Không có snapshot | Trạng thái `unavailable` rõ ràng (`NO_ACTIVE_SNAPSHOT` hoặc `SNAPSHOT_STORE_UNAVAILABLE`). **Không** dùng số liệu local thay thế |
| Web | Tab mới "Discover trends" trong trang Trends; khối giới thiệu trên trang chủ; badge "Not assessable"; dải ngưỡng Nelis thay nhãn "Consistent …" |
| Kiểm chứng trên snapshot thật | 36/36 kiểm tra PASS (đọc-only, qua HTTP) |
| Test | Backend 1.539 pass / 0 fail / 399 skip (P2.1: 1.521, +18 test mới). Web 899 pass / 17 fail, đều là lỗi có sẵn hoặc flaky đã phân loại, 0 lỗi mới |
| Mobile | Không đổi (235 file trùng từng byte) |
| Quyết định | **CONDITIONAL** (§11) |

## 1. Files changed

**Backend (`apps/backend/src/modules/trends/`):**
- Mới:
  - `trend.discover.service.ts`: đọc snapshot active, quy tắc xếp hạng, `assessabilityOf`, trạng thái unavailable;
  - `__tests__/trend.discover.test.ts` (7 unit test);
  - `__tests__/trend.discover.integration.suite.ts` (11 integration test).
- Sửa:
  - `dto/trends.schema.ts`: thêm `TrendsDiscoverQuerySchema`.
  - `trend.controller.ts` (`discover`), `trend.routes.ts`: thêm `/discover`, đặt **trước** `/:topic`.
  - `__tests__/trend.snapshot.integration.test.ts`: chỉ thêm `import` của suite Discover, để hai suite cùng xóa/kích hoạt snapshot chạy tuần tự trong một file (§9).

**Shared types (`packages/shared-types/src/trend.ts`):** `TREND_DISCOVER_COLLECTIONS`, `TrendSnapshotProvenance`, `TrendAssessability`, `TrendDiscoverItem`, `TrendDiscoverFieldGroup`, `TrendsDiscoverResponse`. Chỉ thêm, không đổi kiểu cũ.

**Web (`apps/web/src/`):**
- Mới:
  - `features/trends/components/discover-tab.tsx`;
  - `features/home/components/home-discover-trends.tsx`;
  - `features/trends/trend-ggt-labels.ts`;
  - `features/trends/__tests__/trend-discover-ui.test.tsx` (12 test).
- Sửa:
  - `features/trends/api/trends.api.ts` (`discover`), `hooks/use-trends.ts` (`useTrendsDiscover`);
  - `pages/trends.tsx`: tab `discover`, `?tab=discover`;
  - `components/trend-verdict-badge.tsx`: `isTrendNotAssessable`, badge "Not assessable";
  - `components/trend-evidence-panel.tsx`: `NotAssessableNotice`, dải ngưỡng Nelis;
  - `features/home/components/home-discovery.tsx`, `home-discovery.css`;
  - `i18n/locales/trend-verdict.ts`: 48 chuỗi en/vi; 8 chuỗi đã có bản dịch nên giữ nguyên.
- Test cập nhật:
  - `trend-provenance-ui.test.tsx`: nhãn Nelis mới, có chủ đích.
  - `guest-home.test.tsx`, `research-home.test.tsx`: mock hook Discover theo đúng quy ước của hai file, vốn mock mọi hook của trang chủ.

**Không đổi:**
- Công thức P1, worker và collector P2.1, schema và migration;
- các endpoint cũ: `/trends`, `/trends/:topic`, `/trends/compare`, …;
- toàn bộ mobile.

## 2. Kiến trúc API và hợp đồng response

`GET /api/v1/trends/discover`

| Tham số | Giá trị | Mặc định |
|---|---|---|
| `collection` | `trending` \| `fastest_growing` \| `by_field` (khác → 400) | `trending` |
| `baseline` | `global` \| `domain` \| `field` \| `subfield` (`by_field` luôn dùng `field`) | `field` |
| `page`, `pageSize` | 1…10.000, 1…100 | 1, 20 |
| `perField` | 1…20 (`by_field`, không có `fieldId`) | 5 |
| `fieldId` | id ngành OpenAlex (`by_field`: xếp hạng đầy đủ của một ngành, có phân trang) | — |

**Response** (`TrendsDiscoverResponse`, bọc trong envelope `{ success, data }`):
- `status`, `unavailableReason`, `collection`, `baselineLevel`;
- `provenance` (`TrendSnapshotProvenance`) và `rankingRule` (văn bản quy tắc);
- `page`, `pageSize`, `total` (số topic đủ điều kiện trên **toàn snapshot**), `items`, `fields` (by_field);
- `excluded: { insufficientData, notAssessable, ggtConditionsNotMet? }`.

**Item** (`TrendDiscoverItem`):
- `rank`, `topicId`, `topicName`;
- `taxonomy` (domain/field/subfield id + tên), `baselineUnit {level, id, name}`;
- `totalPapers`, `yearsUsed`, `shareSeries`;
- `verdict`, `confidence`, `assessability`;
- `mannKendall {s, z, tau, pValue, pValueMethod}`, `qValue`, `qFamilyKey`, `qFamilySize`;
- `senSlopePctPoints`, `senSlopeCi95`, `relativeChangePct`;
- `ggt {meanPct, semPct, years, conditionsMet, nelisThresholdGroup, stabilityChecked: false}`;
- **`provenance`** (cùng giá trị với response).

**Provenance:**
- `source: "openalex"`, `snapshotId`, `snapshotStatus: "active"`;
- `scopeFilter`, `workTypes`, `corpus`, `baselineLevel`;
- `yearFrom`, `yearTo`, `lastCompleteYear`;
- `firstFetchedAt`, `lastFetchedAt`, `activatedAt`;
- `collectionVersion`, `analyticsVersion`;
- `historicalCountsMayChange: true`.

Thông tin họ BH đi kèm từng item (`qFamilyKey`, `qFamilySize`).

**Tương thích:**
- Chỉ thêm endpoint và kiểu mới; không đổi response nào đang có.
- Không có endpoint cạnh tranh với `/trends`: Discover chỉ phục vụ snapshot tính sẵn (scope mặc định, cửa sổ của snapshot), còn `/trends` vẫn phục vụ Data Scope tùy chọn.
- Không có engine thống kê thứ hai.

## 3. Đọc snapshot và hành vi khi không có

- **Chỉ một nguồn:**
  - Đọc `trend_snapshots` với `scope_hash` của scope mặc định, `is_active = true`, `status = 'active'`.
  - Index unique một phần (P2.1) bảo đảm có nhiều nhất một snapshot như vậy, nên mọi item của một response cùng `snapshotId`.
  - Không gọi OpenAlex, không đọc kho local.
- **Không tính lại:**
  - verdict, p, q, Sen, GGT là giá trị đã lưu;
  - xếp hạng và phân trang bằng `ORDER BY … OFFSET/LIMIT` trên toàn bộ dòng của snapshot, nên `pageSize` hay `page` không thể đổi thống kê.
- **Không có snapshot active** → `status: "unavailable"`, `unavailableReason: "NO_ACTIVE_SNAPSHOT"`, `items: []`, `provenance: null`.
- **Bảng snapshot chưa tồn tại** (migration P2.1 chưa áp dụng, như ở DB dev/production hiện nay) → `SNAPSHOT_STORE_UNAVAILABLE`, không trả lỗi 500.
- **Không có fallback local**, có chủ đích: số bài trong thư viện không phải xu hướng nghiên cứu (P0.3). Web nói rõ điều này; khối trang chủ không hiển thị gì.
- **Snapshot chưa hoàn tất** (`collecting`, `paused_budget`, `validated` chưa kích hoạt, `validation_failed`) **không bao giờ** được trả về (test 9).

## 4. Thuật toán xếp hạng và điều kiện

Hằng số `DISCOVER_RANKING_RULES`, trả trong `rankingRule`:

| Danh sách | Điều kiện | Thứ tự |
|---|---|---|
| **Trending** | `verdict = rising` đã lưu (MK trên share, BH q < 0,05 trong **toàn bộ** họ baseline của snapshot); p và q khác null | `relativeChangePct` (Sen / median share, %/năm) giảm dần → `q` tăng dần → `topicId` |
| **Fastest Growing** | Như Trending + `ggt_conditions_met` (mọi GGT năm < 100% và ≥ 50 bài mỗi năm) + mean GGT và SEM khác null | mean GGT giảm dần → `q` → `topicId` |
| **Trending by Field** | Baseline field; mỗi ngành OpenAlex: các topic rising theo quy tắc Trending. Họ BH = mọi topic của ngành có p | Ngành theo tên; trong ngành theo quy tắc Trending |

- **Không xếp hạng:**
  - verdict `insufficient`;
  - mọi dòng không có p (không đánh giá được, §7);
  - Fastest Growing loại thêm topic không đạt điều kiện Nelis.
- `excluded` cho biết số lượng từng loại.
- Quy tắc Trending dùng lại thứ tự của overview hiện có (`compareByTrend`: rising theo `relativeChangePct`), thêm `q` và `topicId` để thứ tự tái lập được tuyệt đối.

## 5. Chức năng web

- **Tab "Discover trends"** (`/trends?tab=discover`):
  - chọn danh sách (3 nút), chọn quần thể tham chiếu (Global/Domain/Field/Subfield; khóa ở "Field" cho Trending by Field);
  - mô tả danh sách, ghi chú provenance, danh sách topic có phân trang;
  - by_field: thẻ cho từng ngành, mở xếp hạng đầy đủ của một ngành;
  - dòng "Not ranked: …", quy tắc xếp hạng;
  - trạng thái đang tải, lỗi (thử lại), chưa có snapshot, danh sách rỗng.
- **Dòng topic:**
  - hạng; tên topic có liên kết `/trends/<tên>?topicId=<id>` (helper `getTopicTrendTarget` có sẵn);
  - ngành › chuyên ngành; badge verdict (component có sẵn);
  - "Share change x%/year · q = … (Benjamini–Hochberg across N topics) · n papers";
  - Fastest Growing có thêm "Mean GGT x% ± y% over n years (descriptive; stability not verified)".
- **Trang chủ:** khối "Rising in research (OpenAlex)" trong mục "See the field".
  - 3 topic Trending (baseline field) kèm ngành, share %/năm, q, cửa sổ năm, ngày thu thập, lưu ý số liệu lịch sử có thể đổi, liên kết tới tab Discover.
  - **Không hiển thị gì** khi không có snapshot.
- **Evidence panel và badge** (trang chi tiết topic và các danh sách dùng badge): xem §7.
- **Thiết kế:** dùng lại card, badge, skeleton, cỡ chữ và màu có sẵn; bố cục responsive (lưới 1 → 2 cột cho ngành). Không thay workflow nào khác.

## 6. Baseline, provenance và độ mới

Mọi response có dữ liệu (và mọi item) mang provenance. Web hiển thị ở đầu danh sách:

> "Data: OpenAlex snapshot · *các loại công trình* · 2016–2025 · Reference population: *Field* · Collected *ngày giờ*"
> "OpenAlex revises historical counts; these numbers are the state of the API when they were collected."

- Baseline đã chọn được dùng nhất quán: request, provenance, `baselineUnit` của từng item, họ BH (`qFamilyKey = <baseline>:<đơn vị>`).
- Tab ghi rõ Discover **không** phụ thuộc bộ lọc Data Scope của trang (snapshot dùng các loại công trình mặc định).

## 7. Quyết định an toàn khoa học

1. **Nhãn Nelis chưa xác minh (§4.1):**
   - Khi `stabilityChecked = false`, web **không** hiển thị "Consistent growth", "Consistent strong growth", …
   - Evidence panel hiển thị "Nelis threshold band (stability not verified)" với dải theo biên ("Mean GGT between 15% and 40%").
   - Discover không hiển thị nhóm; chỉ hiển thị mean GGT ± SEM kèm "(descriptive; stability not verified)".
   - API giữ nguyên mã nội bộ (`nelisThresholdGroup`) để tương thích. Test 11 và test evidence panel kiểm rằng không có chữ "consistent".
2. **Baseline không thông tin (§4.2):**
   - `assessability` (API) và `isTrendNotAssessable` (web) tính từ số đã lưu, không đổi thuật toán.
   - Topic là topic duy nhất của quần thể tham chiếu (share = 100% mọi năm, p và q null) được ghi `not_assessable_sole_member`. Verdict cũ "stable" vẫn trả nguyên giá trị.
   - Badge hiển thị **"Not assessable"** thay cho "Stable". Evidence panel hiển thị "Trend not assessable against this baseline" và giải thích rằng topic là toàn bộ quần thể tham chiếu, đây không phải bằng chứng ổn định, nên chọn baseline rộng hơn.
   - Các trường hợp này **không bao giờ** được xếp hạng và được đếm trong `excluded.notAssessable`.
3. **Phân biệt 5 lớp thông tin:**
   - số bài thô ("n papers", chỉ là ngữ cảnh, không dùng để xếp hạng);
   - share (share change %/năm);
   - verdict thống kê (badge + q + họ BH);
   - GGT mô tả (chỉ ở Fastest Growing, ghi "descriptive");
   - nhóm ngưỡng Nelis chưa xác minh (không hiển thị như kết luận).
4. **p hoặc q null:** hiển thị "q not available"; không suy ra ý nghĩa thống kê. "Stable" không được trình bày như bằng chứng tăng trưởng bằng 0.
5. **Không có Emerging, Hot, burst hay EScore**, và không có tuyên bố "phổ biến theo thời gian thực".

## 8. Kết quả kiểm chứng trên snapshot thật

`evidence/p2_2_verify_discover.mts`, kết quả ở `evidence/p2_2_discover_canary_2026-10-23.json`:
- Chạy đọc-only qua `createApp()` (HTTP GET) trên snapshot canary `2ad0ad73…` trong DB thử `lumigap_p1_test`; trước và sau: snapshot vẫn active, 17.704 dòng.
- **36/36 PASS.**

| Đo | global | domain | field | subfield |
|---|---:|---:|---:|---:|
| Trending (= số dòng rising đã lưu, đều có p và q) | 833 | 801 | 781 | 823 |
| `excluded.insufficientData` | 22 | 22 | 22 | 22 |
| `excluded.notAssessable` | 0 | 0 | 0 | **30** |
| Phân trang 7 so với 100: cùng thứ tự và cùng p/q/verdict/hạng/họ | ✓ | ✓ | ✓ | ✓ |
| Thứ tự đúng quy tắc; kích thước họ BH = số topic có p trong đơn vị | ✓ | ✓ | ✓ | ✓ |

- **Fastest Growing (field):** 743 topic = rising ∩ hai điều kiện Nelis ∩ mean ± SEM; 38 topic rising bị loại vì không đạt điều kiện.
  - Thứ tự theo mean GGT. Không topic nào có mean GGT > 100%; đó là các topic nền nhỏ, không bao giờ đạt điều kiện.
  - Ba hạng đầu: T12128 "AI in Service Interactions" 45,8% ± 10,5% (9 năm); T13053 40,1% ± 9,4%; T10883 39,1% ± 5,7%.
- **Trending by Field:** 26 nhóm = 26 ngành của danh mục. Mỗi ngành: số topic, kích thước họ BH (11 … 726) và số rising (tổng 781) khớp dữ liệu đã lưu; mọi topic thuộc đúng ngành và đúng họ `field:<id>`.
- **30 topic là topic duy nhất của subfield:** tất cả được ghi `not_assessable_sole_member`, không xuất hiện trong bất kỳ trang Trending (subfield) nào, và được đếm trong `excluded.notAssessable = 30`.
- **Giá trị không hỗ trợ** (`collection=emerging`) → 400.
- **Ba hạng đầu Trending** (field):
  1. T13424 "Ukraine: War, Education, Health": +247%/năm, q = 0,041;
  2. T14414 "Artificial Intelligence in Education": +70,8%/năm, q = 2,9 × 10⁻⁶;
  3. T11297 "Ferroptosis and cancer prognosis": +52,2%/năm, q = 1,8 × 10⁻⁵.
  - Xem rủi ro §10.1.

## 9. Test và vấn đề

**Bản đồ test acceptance (bước 6):**

| # | Nội dung | Test |
|---|---|---|
| 1 | Nguồn và provenance đúng | integration "1–2"; snapshot thật (provenance = snapshot active, cả trên item) |
| 2 | Không trộn hai nguồn | integration "1–2" (mọi item cùng `snapshotId`, `source = openalex`); unit (không fallback) |
| 3 | `limit` không đổi verdict, p, q | integration "3–4" (`pageSize` 1/2/3/100); snapshot thật (7 so với 100, 4 baseline) |
| 4 | Phân trang không đổi họ BH | integration "3–4"; snapshot thật (kích thước họ = số topic có p trong đơn vị) |
| 5 | Trending chỉ gồm rising đủ điều kiện | integration "5"; snapshot thật |
| 6 | Điều kiện GGT của Fastest Growing | integration "6" (T10008 < 50 bài bị loại); snapshot thật |
| 7 | By Field: taxonomy và baseline đúng | integration "7"; snapshot thật (26 ngành) |
| 8 | Không có snapshot → unavailable trung thực | integration "8"; unit (bảng chưa có → `SNAPSHOT_STORE_UNAVAILABLE`); web "8"; trang chủ không hiển thị gì |
| 9 | Snapshot chưa hoàn tất không bao giờ được xuất bản | integration "9" (snapshot `validated` chưa kích hoạt → unavailable) |
| 10 | Hiển thị baseline và cửa sổ năm | web "10" |
| 11 | Không hiển thị nhãn Nelis "consistent" chưa xác minh | web "11" + test evidence panel cập nhật |
| 12 | 30 trường hợp không thông tin không được trình bày là "stable" | integration "12"; unit assessability; web "12" (badge + panel); snapshot thật (30/30) |
| 13 | Liên kết mang đúng topic id | integration "13"; web "13" |
| 14 | Trang và route khác vẫn hoạt động | integration "14" (`/trends/topic-candidates` không bị `/discover` che); toàn bộ suite backend và web |

**Kết quả:**

| Gate | Kết quả |
|---|---|
| Typecheck shared-types / backend / web | PASS / PASS / PASS |
| Lint backend | 0 error, 5 warning, đều có từ trước (= P2.1) |
| Lint web | 109 problems (4 error, 105 warning), **giống hệt** P1. 4 error là rule `react-hooks/exhaustive-deps` không có definition trong `ai-evaluation.tsx` và `quality-project-mode.tsx` (cấu hình có sẵn); file P2.2: 0 problem |
| Build backend / web | PASS / PASS |
| Backend vitest đầy đủ (DB thử `lumigap_p21_test`) | **1.539 pass / 0 fail / 399 skip** (+18: 11 integration + 7 unit) |
| Worker + Discover integration (một file) | 32/32 |
| Integration theo cờ (7 file) | 152 pass / 1 skip (= P2.1) |
| Web UI test mới | 12/12 (Discover, badge, panel, trang chủ) + 10/10 test provenance đã cập nhật |
| Web vitest đầy đủ | **899 pass / 17 fail** (P2.1: 893 / 11) |
| E2E Playwright cho Discover | **Không có test nào**, chưa viết: không chạy |

**Phân loại 17 lỗi web** (so với baseline đã lập):
- `project-workspace-navigation` ×8: có từ trước (P0/P1).
- `locales.test.ts` ×2: có từ trước. 58 chuỗi thiếu, trùng khớp từng dòng với baseline (0 chuỗi mới); diff alignment chỉ có `"Created"`, như baseline.
- `onboarding-language` ×6 và `academic-onboarding` ×1: **flaky**. Chạy riêng 3/3 lần PASS (31/31); P2.2 không sửa file nào của chúng. Ở P0/P1 đã ghi nhận là flaky khi tải nặng; lần này nhiều test bị ảnh hưởng hơn.
- Lần chạy đầu có thêm 17 lỗi (`guest-home` ×6, `research-home` ×11) **do P2.2 gây ra**: khối trang chủ mới dùng React Query trong khi hai file test này render không có `QueryClientProvider`. Đã sửa bằng cách mock hook Discover theo quy ước của hai file; sau đó 17/17 PASS.

**Vấn đề phát hiện và đã sửa trong P2.2:**
- Hai suite integration (worker P2.1 và Discover) cùng xóa và kích hoạt snapshot của scope mặc định. Khi vitest chạy song song theo file, chúng ảnh hưởng nhau: 9 lỗi trong lần chạy đầy đủ đầu tiên; mỗi suite chạy riêng đều PASS.
- Đã sửa: suite Discover thành `*.suite.ts`, được import bởi file test worker, nên chạy tuần tự trong cùng file. Sau đó cả suite backend PASS.

## 10. Rủi ro và vấn đề chưa giải quyết

1. **Trending ưu tiên topic nền nhỏ.**
   - Quy tắc dùng lại của overview (`relativeChangePct` = Sen / median share) đưa lên đầu các topic xuất hiện từ share rất nhỏ. Hạng 1 (field) là T13424 với +247%/năm.
   - Kết quả có ý nghĩa thống kê thật (q = 0,041), nhưng đây là hiện tượng nền nhỏ tương tự GGT lớn.
   - Không tự đổi quy tắc đã duyệt. Đề xuất (cần duyệt): sắp theo Sen slope (điểm %/năm) hoặc đặt ngưỡng share trung vị tối thiểu cho Trending.
2. **Chưa có snapshot trên DB dev hay production** (migration P2.1 chưa áp dụng ở đó). Discover sẽ trả `SNAPSHOT_STORE_UNAVAILABLE` cho tới khi được duyệt áp dụng migration và chạy worker. Không deploy trong P2.2.
3. **Không có E2E** cho Discover; chỉ có test component và integration HTTP.
4. **Ngôn ngữ khác en/vi** (de/es/fr…) dùng cơ chế dự phòng sẵn có; không thêm bản dịch (cùng tình trạng như các chuỗi P1).
5. **Kết quả theo baseline khác nhau** (P2.0, P2.1). UI luôn ghi baseline; người dùng có thể đổi baseline và thấy thứ hạng khác.
6. **Dữ liệu sống:** verdict sát ngưỡng có thể đổi qua ngày (P2.0: 7/4.426). Discover hiển thị q và ngày thu thập.
7. **Giới hạn khoa học giữ nguyên:**
   - mean ± SEM chỉ tái tạo 4/12 giá trị Nelis;
   - quy tắc ổn định 50% chưa xác minh;
   - GGT chỉ mô tả và không thay MK/Sen/BH;
   - xấp xỉ số của P1 (≤ 2,4 × 10⁻⁷ ở p/q) không đổi verdict nào.

## 11. Mobile

- sha256 của 235 file `apps/mobile` + `apps/flutter_mobile` trước và sau P2.2: **trùng từng byte**. `git status` của 2 thư mục: rỗng.
- Không chạy Flutter/Dart; không dùng lệnh git phá hủy.

## 12. Quyết định: **CONDITIONAL**

- Mọi acceptance P2.2 (14 nhóm test) đạt; 0 hồi quy backend; 0 lỗi web mới.
- Snapshot thật được phục vụ đúng: 36/36 kiểm tra.
- **Điều kiện trước khi đưa tới người dùng:**
  1. Duyệt (hoặc điều chỉnh) quy tắc xếp hạng Trending, do hiện tượng nền nhỏ (§10.1).
  2. Duyệt riêng việc áp dụng migration P2.1 và chạy `worker:trends` trên môi trường thật. Ngoài phạm vi P2.2; trước đó Discover hiển thị "not available".

**Dừng ở P2.2. Không bắt đầu P3/P4/P5. Chưa commit thay đổi P2.2. Chờ review.**
