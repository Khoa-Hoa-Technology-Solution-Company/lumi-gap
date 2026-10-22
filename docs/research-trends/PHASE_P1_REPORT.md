# PHASE P1 — GGT Analytics & Baseline (Checkpoint 2)

> Nhánh `feat/research-trends-p0` @ `5a9d228`, thay đổi **chưa commit** (P0 + P1 cùng nằm trong working tree).
> Ngày: 2026-10-22. Phạm vi: đúng P1.0–P1.3 của `05_IMPLEMENTATION_PLAN.md` (bản Checkpoint 1.5). **Không làm P2. Không chạm mobile.**
> Nhãn: **[GỐC]** = có trong bài báo / file tác giả; **[SUY LUẬN]** = lựa chọn của chúng tôi khi nguồn không nói rõ; **[QUY ƯỚC]** = quy ước kỹ thuật.

## 0. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| P1.0 Golden dataset G1 | Xong. GGT năm tính lại khớp **chính xác** (sai lệch 0) giá trị tác giả lưu trong S1/S2 trên 43 sheet. Mean ± SEM: chỉ **4/12** giá trị in trong bài tái tạo được. |
| P1.1 Series provider + baseline, sửa C2 | Xong. Một định nghĩa N_t cho overview và trang topic, OpenAlex và local. C2 kiểm chứng trên PostgreSQL thật (ma trận 2 scope × 2 baseline). |
| P1.2 GGT engine | Xong (`trend.ggt.ts`). Không áp dụng quy tắc ổn định 50%. MK/Sen/BH không đổi. |
| P1.3 Tích hợp API + bỏ kết luận dựa trên tăng trưởng thô | Xong trong phạm vi Backend + Web. API chỉ **thêm** trường (`ggt`, `baseline`, `baselineLevel`). |
| Quality gates | Backend, integration, web: không có hồi quy do P1. Lỗi còn lại đều có sẵn từ trước (xem §4). |
| Mobile | **Không đổi** (hash nội dung và manifest 235 file trùng khớp trước/sau). |

## 1. Danh sách thay đổi

### Backend — `apps/backend/src/modules/trends/`
- **Mới** `trend.baseline.ts`: `resolveBaseline` (global/domain/field/subfield, mặc định field, fallback về global kèm `fallbackFrom`), mệnh đề OpenAlex `primary_topic.{level}.id:<id>` / `primary_topic.id:!null`, SQL local `localBaselineYearCounts` (chỉ `is_primary = TRUE`), `unclassifiedSharePct`, `assertBaselineContainsUnit` (400).
- **Mới** `trend.series.ts`: `buildShareRows` — chuỗi share n_t/N_t dùng chung cho mọi đường đi.
- **Mới** `trend.ggt.ts`: `annualGgt`, `summarizeGgt`, `ggtClass`, `computeGgt`.
- `dto/trends.schema.ts`: tham số `baseline` (tùy chọn; mặc định `field` trong code).
- `trend.openalex-overview.ts`, `trend.evidence.ts`, `trend.postgres.ts`: dùng baseline + series chung; gắn `ggt` vào `TrendingTopic` và `TopicTrendStatistics`; trả `baselineLevel`.
- `trend.service.ts`: trang topic local lấy bài qua SQL có **Data Scope** (trước P1 trang topic bỏ qua scope) và N_t từ baseline chung.

### Backend — ngoài trends (P1.3)
- `gaps/gap-evidence.ts`: `parentGrowth` bỏ cờ `rising` (trước đây suy ra từ CAGR > `GAP_PARENT_RISING_MIN`); chỉ còn số mô tả.
- `gaps/gaps.service.ts`: bỏ tham số ngưỡng; chọn topic cha có tăng trưởng thô lớn hơn **chỉ để hiển thị ngữ cảnh**.
- `gaps/gaps-directions.ts`: prompt đổi "rising parent topic" thành "parent topic with the larger raw paper-count growth (descriptive, not a trend test)"; `DIRECTIONS_PROMPT_VERSION` `directions-v3` → `directions-v4`.
- `reports/report.prompt.ts` + `rag.service.ts`: khối TREND METRICS thêm `trendVerdict` (verdict, confidence, p, Sen, baseline) và `ggt`; luật hệ thống 12: số thô chỉ mô tả, chỉ nói rising/declining khi `trendVerdict.verdict` nói vậy. `PROMPT_VERSION` → `report-v8-trend-verdict`.
- `mcp/mcp.tools.ts`: mô tả `get_trends` nêu verdict + GGT; YoY/CAGR/momentum là số thô mô tả.
- `config/env.ts`: `GAP_PARENT_RISING_MIN` ghi chú **deprecated, không còn được đọc**; giữ lại để `.env` cũ vẫn hợp lệ (không xóa thành phần có sẵn).

### Shared types — `packages/shared-types/src/trend.ts`
- `TREND_BASELINE_LEVELS`, `TrendBaselineLevel`, `DEFAULT_TREND_BASELINE = "field"`, `TrendBaseline`.
- `TrendGgt`, `TrendGgtYear`, `TrendGgtClass`, `TrendGgtNullReason`.
- Thêm (tùy chọn): `TopicTrendStatistics.baseline`, `.ggt?`; `TrendingTopic.ggt?`; `TrendsOverview.baselineLevel?`.

### Web — `apps/web/src/`
- `features/trends/components/trend-evidence-panel.tsx`: tên quần thể theo từng cấp, cảnh báo fallback, tỷ lệ công trình không có primary topic (global); mục **GGT** trong phần "Supplementary information: does not affect the conclusion" (mean ± SEM, số năm, nhóm Nelis hoặc lý do không xếp nhóm, GGT từng năm, ghi chú quy tắc 50% không được áp dụng).
- `features/gaps/components/gap-detail-drawer.tsx`, `gap-evidence-summary.tsx`: "Growth Trend" (màu xanh + mũi tên đi lên) → "Parent raw growth" màu trung tính + tooltip "Not a trend test"; không có dữ liệu hiển thị "—" thay vì "0%".
- `features/papers/components/paper-detail/paper-reading-context-card.tsx`: "Growth" → "Raw growth" + dòng "Raw paper counts… Not a trend test."
- `i18n/locales/trend-verdict.ts`: 27 chuỗi mới (en + vi).

### Test và fixture
- Mới: `fixtures/g1-ggt-nelis-2022.json` (+ mục "Golden dataset G1" trong `fixtures/README.md`), `trend.ggt.test.ts` (18 test), `trend.baseline.test.ts`.
- Cập nhật: `trend.evidence.test.ts`, `trend.consistency.test.ts`, `trend.openalex-overview.test.ts`, `trend.local.integration.test.ts`, `gaps/__tests__/gap-evidence.test.ts`, `gaps/__tests__/gaps-directions.test.ts`, `reports/__tests__/report.prompt.test.ts`, web `trend-provenance-ui.test.tsx`, `quality-reading-modes.test.tsx`.

**Không có migration, không đổi schema DB, không sửa file mobile.**

## 2. P1.0 — Golden dataset G1

**Nguồn [GỐC]:** Nelis JLD et al. (2022) *PLOS ONE* 17(5): e0268433, doi:10.1371/journal.pone.0268433, CC BY 4.0. File S1 (`journal.pone.0268433.s001.xlsx`), S2 (`…s002.xlsx`), S3 (template), S4 (R).

| Lĩnh vực trong G1 | File, sheet | Năm |
|---|---|---|
| Microplastics | S2, `Microplastics` | 1991–2020 |
| NAFLD | S2, `NAFLD` | 1970–2020 |
| Proteomics | S2, `Proteomics` | 2000–2020 |
| Sensor arrays | S1, `Sensor arrays` | 1997–2020 |
| Climate Change | S1, `Climate Change` | 1997–2020 |

Mỗi dòng: `{year, unitCount (n), baselineCount (N), authorsGgtFraction}`; N = C − I đúng như template S3 **[GỐC]**.

**Đã xác minh**
- GGT năm theo Eq (i) tính lại từ số đếm thô = cột GGT tác giả lưu trong file, **sai lệch tối đa 0** trên 43 sheet S1/S2 (năm đầu sheet bị loại vì ô của tác giả tham chiếu dữ liệu ngoài sheet).
- 4 giá trị in trong bài tái tạo được bằng **trung bình cộng + SEM mẫu (n−1)**: NAFLD 1999–2005 = 29 ± 3; Proteomics 2008–2018 = 1,2 ± 1,4; Microplastics 2005–2011 = 4 ± 8; Climate Change 2009–2018 = 12 ± 2.

**Chưa xác minh / không tái tạo được (ghi trung thực trong fixture `claims[]`)**
- 8/12 giá trị in không tái tạo được với bất kỳ thống kê ứng viên nào (SEM mẫu, SEM tổng thể, quy ước cửa sổ a..b hay a+1..b). Ví dụ Microplastics 2012–2018 "51% ± 4%": trung bình tính được 52,3% (a..b) / 53,3% (a+1..b).
- Bài tự mâu thuẫn: tóm tắt ghi Microplastics "51% ± 10%", thân bài "51% ± 4%".
- Quy ước cửa sổ không nhất quán giữa các giá trị tái tạo được: NAFLD, Proteomics, Microplastics 2005–2011 dùng năm a..b; Climate Change dùng a+1..b.
- S3 không có công thức mean/SEM. ⇒ mean ± SEM vẫn là **[SUY LUẬN]**, được hỗ trợ một phần (4/12).
- Ví dụ tính tay `handExamples`: chuỗi sạch 6 năm (mean 17,1155…, SD 8,6462…, SEM 3,8667…) và chuỗi biên (thiếu năm, n_{y−1} = 0, N = 0, n giảm về 0 → −103,846%).

## 3. Kiểm chứng P1.1–P1.3

### 3.1 C2 — overview và trang topic dùng cùng N_t
- **Trước P1:** overview chia cho mọi bài trong scope, trang topic chia cho quần thể field; lệch có sẵn ở trường hợp không scope (13/10 vs 13/6), P0.4 làm lệch thêm ở trường hợp có scope field.
- **Sau P1:** cả hai dùng `trend.baseline.ts`. N_t = bài trong Data Scope **bỏ mệnh đề taxonomy**, có **primary** topic thuộc cùng domain/field/subfield.
- **Bằng chứng (PostgreSQL thật, DB `lumigap_p1_test`):** `trend.local.integration.test.ts` **8/8 PASS**, gồm ma trận {field-scoped, unscoped} × {field, domain}: MK, Sen, `total` (= a+b với field, a+b+g với domain), `count` (= a) và **GGT** trùng nhau giữa overview và trang topic; GGT từng năm khớp công thức tính tay từ dữ liệu seed. Thêm test Data Scope của trang topic (scope review-only → 404; scope article → tổng = Σa). DB để lại sạch (0 bài).
- `global` không nằm trong ma trận integration vì DB dùng chung với các suite chạy song song; được kiểm bằng unit test.

### 3.2 GGT so với G1 (`trend.ggt.test.ts`, 18/18 PASS)
| Acceptance (05 §P1.2) | Trạng thái | Bằng chứng |
|---|---|---|
| (1) Khớp G1, sai số ≤ 0,1 điểm % | **PASS** (GGT năm, sai số 1e−9) / **PARTIAL** (mean ± SEM: 4/12) | 5 test lĩnh vực + 4 test claim + test đếm claim (12, khớp 4) |
| (2) Thuộc tính GGT = r × (1 + g_O) | **PASS** | 200 chuỗi giả ngẫu nhiên tất định |
| (3) Không có hằng số "50 điểm %" | **PASS** | Test đọc mã nguồn: dòng `= 50` duy nhất là `GGT_MIN_PAPERS_PER_YEAR` (số bài) |
| (4) Nhãn Nelis luôn kèm chú thích điều kiện ổn định chưa kiểm tra | **PASS** | API `stabilityChecked: false`; web luôn hiển thị ghi chú |
| Mẫu số 0, thiếu năm, dữ liệu thiếu | **PASS** | `nullReason`: MISSING_PREVIOUS_YEAR, ZERO_PREVIOUS_UNIT, ZERO_PREVIOUS_BASELINE, ZERO_BASELINE |

Quyết định đã ghi trong code:
- Năm đầu cửa sổ không có GGT **[QUY ƯỚC]** (chỉ dùng năm trong cửa sổ, tức a+1..b).
- N_y = 0 → null, không coi là "văn liệu giảm 100%" **[QUY ƯỚC]**.
- Nhóm Nelis chỉ gán khi **mọi** GGT năm < 100% **và mọi** năm ≥ 50 bài **[SUY LUẬN thận trọng]**.
- Biên chặt đúng như bài in; khoảng −10…−5% và giá trị đúng bằng biên → `unclassified`.
- Quy tắc "< 50% year-to-year variation" **không áp dụng**, vì tác giả không định nghĩa cách đo. Chỉ trả `yearToYearChanges` (điểm %) để hiển thị.

### 3.3 Verdict không đổi
- MK/Sen/BH không bị sửa trong P1. Test "the verdict depends on the share only": hai chuỗi cùng share, GGT khác nhau (văn liệu nhân đôi mỗi năm) → verdict giống hệt.
- Test `trend.verdict`, `trend.statistics`, `trend.openalex-overview`, `trend.consistency` của P0 vẫn PASS.

### 3.4 Đối chiếu acceptance P1.1 và P1.3
| Criterion | Status | Evidence | Remaining Risk |
|---|---|---|---|
| P1.0: golden có nguồn (file, sheet, dòng) | PASS | `g1-ggt-nelis-2022.json` mỗi lĩnh vực ghi file + sheet; dòng = năm | Mean ± SEM chỉ được hỗ trợ 4/12 |
| P1.1 (1) `baseline=field` giống hệt P0 | **PARTIAL** | OpenAlex: chuỗi filter giống hệt P0 (cùng số, cùng cache entry) — `trend.baseline.test.ts`, `trend.consistency.test.ts`. Local: N_t **cố ý thay đổi** (sửa C2: chỉ primary topic của field, thay cho mọi bài trong scope) | Số liệu local trước/sau P1 khác nhau với cùng truy vấn; đây là chủ đích nhưng cần duyệt |
| P1.1 (2) `global` dùng 1 request cho mọi topic | PASS | `trend.openalex-overview.test.ts` "baseline=global: one population request" | — |
| P1.1 (3) baseline không chứa unit → 400 | PASS (hàm) | `assertBaselineContainsUnit` + test | API hiện chỉ có unit = topic, mọi cấp đều chứa topic nên đường 400 chưa có endpoint dùng tới |
| P1.3 (1) API trả `ggt` | PASS | overview OpenAlex + local, topic OpenAlex + local; test consistency: GGT overview = GGT topic | Response cũ đã cache/lưu không có `ggt` (trường tùy chọn; web xử lý được — test "renders without GGT") |
| P1.3 (2) Không còn quyết định/nhãn dựa trên `growthRatePct`, `cagr3yPct`, `momentum` (backend + web) | PASS | Grep §3.5 | Mobile vẫn còn (ngoài phạm vi, §6) |
| P1.3 (3) Test Gaps cập nhật và xanh | PASS | `gap-evidence.test.ts`, `gaps-directions.test.ts` PASS; 6 suite persistence gaps PASS trên DB cô lập | — |
| Exit: verdict chỉ từ MK/BH | PASS | §3.3 | — |

### 3.5 Grep raw growth (backend + web, trừ test và file locale)
So sánh hoặc sắp xếp theo `growthRatePct|cagr3yPct|cagrPct|momentum`, còn lại:
- `evaluation/evaluation.service.ts:233`: fixture kiểm tra công thức đúng (không phải kết luận khoa học) → giữ.
- `gaps/gaps.service.ts:172`: chọn topic cha nào **để hiển thị** (nhãn "larger raw growth"); không quyết định tín hiệu gap.
- `gaps-directions.ts:78`, `gap-detail-drawer.tsx:234`, `gap-evidence-summary.tsx:130`: chỉ chọn dấu "+".
- `trend.verdict.ts buildRecommendedComparisons`: chọn theo verdict; các số thô chỉ đi kèm (trường deprecated, giữ để tương thích).
- `gap-closure/retro.ts`: tái hiện quy tắc cũ cho phân tích hồi cứu (đúng mục đích của file), không đổi.
- `trend-explain.prompt.ts`: đã cấm dùng số deprecated từ P0.

## 4. Quality gates

Môi trường: Docker riêng `lumigap-p1-verify-pg` (PostgreSQL + pgvector, cổng 55434, DB `lumigap_p1_test`, 93 migration có sẵn được apply) và `lumigap-p1-verify-redis` (cổng 56380, DB 15). Không kết nối DB dev/production (container dev đang dừng).

| Gate | Kết quả | So với P0 |
|---|---|---|
| shared-types `tsc` | PASS | — |
| Backend typecheck (`tsc --noEmit`) | PASS | — |
| Backend lint (`eslint src`) | PASS: 0 error, 5 warning (đều có sẵn, ví dụ import thừa `YearlyCount` trong `trend.postgres.ts` có từ HEAD) | không thêm |
| Backend build (`tsc -p tsconfig.build.json`, xuất ra thư mục tạm) | PASS | — |
| Backend vitest đầy đủ (DB cô lập, `TRENDS_INTEGRATION=1`) | Lần 1: 1487 pass / 0 fail / 399 skip. Lần cuối (sau khi thêm 4 test): 1488 pass / 3 fail / 399 skip; 3 lỗi là timeout ở `academic-forum-activity`, `identity-account`, `forum.persistence`, `gap-sweep` (thời lượng ghi nhận ~25 158 000 ms, tức máy ngủ giữa lần chạy). Chạy lại riêng 4 file: **55/55 PASS** → ENVIRONMENT (FLAKY), không phải hồi quy. Tổng sau P1: **1491 pass / 0 fail / 399 skip** | P0: 1456 / 0 / 399 |
| Integration theo cờ (7 file, `--maxWorkers=1 --minWorkers=1`) | 7/7 file, 152 pass, 1 skip, 0 fail | P0: 148/148 |
| Web typecheck (`tsc -b`) | PASS | — |
| Web lint | Toàn bộ `src`: 4 error + 105 warning, **tất cả ở file P1 không động tới** (4 error: rule `react-hooks/exhaustive-deps` không có definition, cấu hình có sẵn). Các file P1 sửa (`trend-evidence-panel`, `gap-detail-drawer`, `gap-evidence-summary`, `paper-reading-context-card`, `trend-verdict.ts`, 2 file test): 0 problem | không thêm |
| Web vitest | 893 pass / 11 fail | P0: 890 / 10 |
| Web build (`node scripts/build.mjs`) | PASS | — |

**Phân loại 11 lỗi web**
- `project-workspace-navigation` ×8: PRE-EXISTING (giống P0).
- `locales.test.ts` "covers static UI text": PRE-EXISTING. 58 chuỗi thiếu, **trùng khớp từng dòng** với danh sách base (`comm`: 0 chuỗi mới) → P1 không thêm chuỗi thiếu.
- `locales.test.ts` "aligned with English": PRE-EXISTING; diff duy nhất `"Created"`, giống base.
- `onboarding-language.test.tsx`: FLAKY — chạy riêng 3/3 lần PASS; chỉ fail khi chạy cả bộ (tương tự `academic-onboarding` đã ghi ở P0).

**Hồi quy so với `5a9d228`:** không chạy lại worktree base trong P1, vì code base không đổi kể từ lần đo P0 (cùng môi trường, `P0_RELEASE_READINESS.md`). So sánh dựa trên số liệu base/P0 đã đo. Backend không còn test fail; lỗi web nằm trong tập có sẵn + 1 flaky.

**Test cũ có assertion bị sửa (thay đổi hành vi có chủ đích):**
- `gap-evidence.test.ts`: bỏ kiểm `rising` (cờ đã bị bỏ).
- `report.prompt.test.ts`: phiên bản prompt v7 → v8.
- `quality-reading-modes.test.tsx`: "Growth +14.2%" → "Raw growth +14.2%".
- `trend.evidence.test.ts`, `trend.consistency.test.ts`: input taxonomy/scopeWhere và truy vấn có Data Scope (P1.1).

**Không chạy:** kiểm tra trực tiếp GGT/baseline trên OpenAlex live (tùy chọn, để tránh tốn ngân sách API) → **NOT VERIFIED live**. Kiểm chứng P1 dựa trên G1, unit test và PostgreSQL thật.

## 5. Rủi ro còn lại
1. **Mean ± SEM là [SUY LUẬN]:** chỉ tái tạo được 4/12 giá trị in. Không nên trình bày nhãn Nelis như kết luận; hiện chỉ nằm trong phần bổ sung.
2. **Số liệu local đổi theo C2:** cùng truy vấn local, share/verdict có thể khác trước P1 (N_t nhỏ hơn: chỉ primary topic của field). Đây là sửa lỗi, nhưng người dùng có thể thấy số khác.
3. **Trang topic local áp dụng Data Scope:** truy vấn có scope loại hết bài của topic giờ trả 404, thay vì hiển thị số ngoài scope như trước.
4. **Bump prompt version:**
   - `directions-v4`: bấm "generate" trên gap đã có directions v3 sẽ sinh lại và **trừ credit lần nữa**.
   - `report-v8`: báo cáo mới không dùng lại cache LLM cũ.
   - Cả hai làm theo quy ước CLAUDE.md §6 (đổi wording ⇒ bump).
5. **`GAP_PARENT_RISING_MIN` không còn được đọc** nhưng vẫn khai báo trong `env.ts` và `docs/environment-variables.md`. Nên xóa ở một thay đổi riêng nếu được duyệt.
6. **GGT khi n nhỏ:** GGT năm có thể rất lớn hoặc âm sâu (n giảm về 0 → −100% − g_O). Điều kiện ≥ 50 bài chặn việc xếp nhóm nhưng không ẩn số liệu.
7. **Baseline global:** `unclassifiedSharePct` chỉ có trên đường OpenAlex topic; overview global và đường local không trả tỷ lệ này.
8. Dữ liệu đã lưu trước P1 có `baseline.level = "corpus"` và không có `ggt`; web xử lý cả hai.

## 6. Mobile — xác nhận không thay đổi
- Snapshot **trước** P1 và **sau** P1, cùng lệnh, trên nhánh `feat/research-trends-p0` @ `5a9d228`:
  - `git status --porcelain --untracked-files=all -- apps/flutter_mobile`: rỗng trước và sau (0 byte).
  - Hash nội dung 223 file `apps/flutter_mobile` (trừ build, `.dart_tool`, `.gradle`): `fd850e8eab441f2f834689437dfb1d48fd94722f3d16194e221eec3ffc5c7a95` trước = sau.
  - Manifest sha256 của 235 file trong `apps/mobile` và `apps/flutter_mobile` (kể cả file bị ignore): **giống hệt từng byte** (`cmp`).
  - `git diff --stat -- apps/flutter_mobile apps/mobile`: rỗng.
- Không chạy Flutter/Dart build, analyze hay test; không chạy formatter nào trên mobile; không dùng `git clean`, `git reset --hard`.
- **Đánh giá ảnh hưởng tới mobile (chỉ đọc):** P1 chỉ **thêm** trường (`ggt`, `baseline`, `baselineLevel`). Mobile parse theo khóa đã biết và bỏ qua `statistics`/`classification` → an toàn. Thay đổi N_t local (C2) có thể làm số mobile hiển thị khác, nhưng mobile không hiển thị share.
- **OUT OF SCOPE (cần sửa mobile, không thực hiện):** mobile vẫn hiển thị tăng trưởng thô như kết luận (`home_screen.dart`: màu/mũi tên theo `momentum`, câu "is growing rapidly"). Đề xuất sửa đã ghi ở `PHASE_P0_REPORT.md` §7.4.

## 7. Trạng thái
- P1.0–P1.3 xong, chưa commit. Không có migration. Không có thay đổi mobile.
- Container `lumigap-p1-verify-pg`/`-redis` còn chạy để kiểm chứng lại nếu cần; container dev (`lumi-gap-postgres-1`, `lumi-gap-redis-1`) giữ nguyên trạng thái dừng.
- **Dừng sau P1. Chưa bắt đầu P2. Chờ duyệt.**
