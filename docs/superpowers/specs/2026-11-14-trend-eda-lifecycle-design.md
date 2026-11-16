# Trend EDA & Lifecycle Design — Xu hướng nghiên cứu ngành CNTT theo quy trình EDA

> Spec cho implementation plan. Ngày viết: 2026-11-14 (bản 2, rút gọn, chia ba đợt). Trạng thái: **chờ duyệt**.
> Branch: `tori-67-refactor-research-trends`.
> Kế thừa và thay thế một phần: [2026-10-16-trend-methodology-design.md](2026-10-16-trend-methodology-design.md) (gọi tắt "spec 10-16").
> Phạm vi code: `apps/backend/src/modules/trends/`, `apps/backend/src/workers/notification.worker.ts`, `packages/shared-types/src/trend.ts`, `apps/web/src/features/trends/`, `apps/web/src/features/docs/content/trends/`, `apps/web/src/pages/`.

**Cam kết của spec này là Đợt 1.** Đợt 2 được mô tả đủ để lên kế hoạch. Đợt 3 chỉ là danh sách việc để sau, chưa cam kết.

---

## 1. Vấn đề và quyết định

**Yêu cầu.** Phần Xu hướng phải đi theo quy trình EDA: hiểu dữ liệu → thống kê mô tả bằng công thức → trực quan hoá → phát hiện bất thường → rút ra kết luận. Kết luận phải có đủ **tăng, bão hoà, giảm**, không bỏ sót **chủ đề nhỏ đang tăng mạnh** và nhận ra được **hướng mới nổi**.

**Hiện trạng (2026-11-14).**

- Verdict do Mann–Kendall trên **thị phần** quyết định, độ lớn bằng Sen's slope + CI95, hiệu chỉnh Benjamini–Hochberg (`trend.verdict.ts`, `trend.statistics.ts`), theo spec 10-16.
- `growthRatePct`, `cagr3yPct`, `momentum` (`trend.formulas.ts`) còn trong response nhưng đã `@deprecated`.
- Chỉ có 4 verdict: `rising | stable | declining | insufficient`.
- Ứng viên chọn theo quy mô (`GLOBAL_CANDIDATES = 30` + `PER_STRATUM = 3`, tối đa 200), nên chủ đề nhỏ dễ bị bỏ sót.
- Mẫu số thị phần là field của từng chủ đề, áp cho mọi ngành.
- Chưa có bước mô tả, phân phối, outlier nào.

**Quyết định.**

| # | Quyết định | Lý do | Đợt |
|---|---|---|---|
| D1 | Giữ Mann–Kendall + Sen's slope + BH làm phép kiểm định của bước kết luận | EDA là quy trình khám phá, tự nó không cho kết luận có độ tin cậy. Nelis et al. (2022) và Griffiths & Steyvers (2004) cũng kết luận bằng xu hướng của một tỉ lệ đã chuẩn hoá | 1 |
| D2 | Thêm các bước EDA hợp với chuỗi ~15 điểm/năm; không làm PCA, t-SNE, KDE, pie chart, tách mùa vụ | Không thêm thông tin cho kết luận với dữ liệu này | 1 |
| D3 | Phạm vi cố định là nhóm ngành CNTT (§2), một mẫu số chung | Dự án tập trung CNTT; cùng mẫu số thì so sánh được giữa các chủ đề | 1 |
| D4 | Kiểm định **mọi** chủ đề trong phạm vi (331 chủ đề), không chọn theo quy mô | Không bỏ sót chủ đề nhỏ | 1 |
| D5 | Thêm trạng thái **bão hoà** | Yêu cầu của người dùng | 1 |
| D6 | Xoá hẳn `growthRatePct`, `cagr3yPct`, `momentum` | Đếm thô không dùng để kết luận | 1 |
| D7 | Mọi con số của kết luận lấy từ OpenAlex; DB chỉ liệt kê bài mở được trong ứng dụng | DB là mẫu đã sync, không ngẫu nhiên | 1 |
| D8 | Không thêm bảng, không thêm worker: dùng cache Redis sẵn có và một job làm nóng cache | Giữ đợt 1 nhỏ; lưu lịch sử quét để Đợt 3 | 1 |
| D9 | Mới nổi tìm ở cấp **từ khoá** bên trong phạm vi CNTT, dùng lại tính năng từ khoá đang nổi | Danh sách chủ đề OpenAlex cố định (tạo ngày 2024-01-23): hướng mới không thành chủ đề mới mà được xếp vào chủ đề có sẵn. Ví dụ không có chủ đề "Large Language Models"; bài về nó nằm trong "Natural Language Processing Techniques" hoặc "Topic Modeling" | 2 |

---

## 2. Phạm vi dữ liệu: nhóm ngành CNTT

Khai báo một chỗ: `trend.scope.ts`, export `IT_SCOPE` và `IT_SCOPE_VERSION` (chuỗi, ví dụ `"it-v1"`).

| Lớp | Nội dung | Số chủ đề | Đợt |
|---|---|---|---|
| 1. Lõi | 11 subfield của field Computer Science (17): 1702 AI (65), 1710 Information Systems (54), 1705 Computer Networks and Communications (38), 1707 Computer Vision and Pattern Recognition (38), 1703 Computational Theory and Mathematics (19), 1711 Signal Processing (10), 1712 Software (10), 1708 Hardware and Architecture (9), 1706 Computer Science Applications (8), 1704 Computer Graphics and CAD (7), 1709 Human-Computer Interaction (7) | 265 | 1 |
| 2. Liên quan | 2207 Control and Systems Engineering (44); 1802 Information Systems and Management (7); 2214 Media Technology (6); 2611 Modeling and Simulation (6); 2614 Theoretical Computer Science (3) | 66 | 1 |
| 3. Ứng dụng | Từng chủ đề do admin thêm qua catalogue nghiên cứu (tin sinh học, tin học y tế, e-learning, fintech…) | tuỳ admin | 2 |

Số chủ đề đếm trên OpenAlex ngày 2026-11-14; tổng lớp 1–2 là **331**.

- **Không lấy** 2208 Electrical and Electronic Engineering (7,6 triệu bài, phần lớn không phải CNTT, sẽ lấn át mẫu số).
- **Mẫu số** `N_t` = tổng số bài của cả phạm vi trong năm `t`, cùng bộ lọc loại tài liệu mặc định (`DEFAULT_WORK_TYPES`). Lọc bằng `primary_topic.subfield.id` với 16 giá trị OR; nếu OpenAlex giới hạn tốc độ với danh sách OR dài thì chia thành hai request rồi cộng (kiểm ở bước 0).
- Mỗi response kèm `scopeVersion`. Đổi danh sách = tăng phiên bản; kết luận của hai phiên bản không so sánh với nhau.
- Trang Xu hướng bỏ bộ lọc domain/field ngoài phạm vi; vẫn lọc được theo subfield và chủ đề bên trong phạm vi.

---

## 3. Định nghĩa

- **Thị phần:** `s_t = n_t / N_t × 100` (%), `n_t` = số bài có `primary_topic` là chủ đề đó.
- **Cửa sổ đầy đủ** `W`: 15 năm hoàn chỉnh gần nhất (mặc định; người dùng đổi được, tối thiểu 5). **Cửa sổ gần** `R`: 5 năm hoàn chỉnh cuối của `W`.
- **Năm hoàn chỉnh:** `≤ năm hiện tại − 1`, bỏ năm có `N_t = 0`. Chuỗi năm của mỗi chủ đề đã được lấy cho cả dải 1900–nay và cache 7 ngày (`yearlyShareCounts`), nên cửa sổ 15 năm không tốn thêm request.

| Trạng thái | Định nghĩa | Đợt |
|---|---|---|
| Tăng (`rising`) | Thị phần tăng đơn điệu có ý nghĩa trên `W` và chưa đi ngang | 1 |
| Bão hoà (`saturated`) | Thị phần tăng có ý nghĩa trên `W` nhưng đi ngang trong `R`, ở gần mức đỉnh | 1 |
| Qua đỉnh (`past_peak`) | Thị phần tăng có ý nghĩa trên `W` nhưng cuối kỳ đã tụt xuống dưới một nửa mức đỉnh (ví dụ các chủ đề COVID-19). Thêm ngày 2026-11-14 sau khi chạy `eval:trends` | 1 |
| Giảm (`declining`) | Thị phần giảm đơn điệu có ý nghĩa trên `W` | 1 |
| Ổn định (`stable`) | Không có xu hướng có ý nghĩa | 1 |
| Chưa đủ dữ liệu (`insufficient`) | Không qua cổng dữ liệu (§5.1) | 1 |
| Mới nổi (`emerging`) | Một từ khoá mà phần lớn số bài nằm trong 3 năm gần nhất và tỉ lệ bài đang tăng có ý nghĩa. Là **tín hiệu sớm** | 2 |

---

## 4. Đợt 1 — Quy trình EDA trên trang chi tiết chủ đề

Hàm thuần trong `trend.descriptive.ts` và `trend.outliers.ts`, không I/O, có unit test với chuỗi tính tay. Thứ tự hiển thị trên trang đúng theo thứ tự các mục dưới đây.

### 4.1 Hiểu và kiểm tra dữ liệu

Số năm dùng, `N_t` từng năm, năm bị loại (chưa hoàn chỉnh, `N_t = 0`), số năm chủ đề có `n_t = 0`, nguồn dữ liệu, `scopeVersion`, ngày tính.

### 4.2 Thống kê mô tả

Tính cho chuỗi thị phần `s_t` và chuỗi số bài `n_t`.

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| Mean | `x̄ = (1/n) Σ x_i` | |
| Median, Q1, Q3 | Phân vị, nội suy tuyến tính | |
| Variance | `s² = (1/(n−1)) Σ (x_i − x̄)²` | |
| Standard deviation | `s = √s²` | |
| Min, Max, Range | `max − min` | |
| Hệ số biến thiên | `CV = s / x̄` | So độ phân tán giữa chủ đề lớn và nhỏ |
| Skewness | `g₁ = m₃ / m₂^{3/2}`, `G₁ = g₁ · √(n(n−1)) / (n−2)` | Joanes & Gill (1998); cần `n ≥ 3` |
| Kurtosis (excess) | `g₂ = m₄ / m₂² − 3`, `G₂ = (n−1)/((n−2)(n−3)) · ((n+1)g₂ + 6)` | Joanes & Gill (1998); cần `n ≥ 4`. Hiển thị dạng excess (0 = chuẩn), khác sơ đồ gốc (mốc 3) |

`m_k = (1/n) Σ (x_i − x̄)^k`. Skewness và kurtosis chỉ mang tính mô tả, hiển thị kèm ghi chú "chuỗi ngắn" và **không tham gia kết luận**.

### 4.3 Chuỗi thời gian và phần dư

- Đường xu hướng Theil–Sen: `ŝ_t = a + b·t`, `b` = Sen's slope, `a = median(s_i − b·t_i)`.
- Phần dư `e_t = s_t − ŝ_t`.
- Không làm trơn bằng trung bình trượt trước khi kiểm định (Nelis et al. 2022).

### 4.4 Phát hiện năm bất thường

`|e_t − median(e)| / MAD > 2.5`, với `MAD = 1.4826 · median|e_i − median(e)|` (Leys et al. 2013). Năm bất thường được đánh dấu trên biểu đồ và liệt kê trong phần kết luận như một lưu ý; **không đổi verdict**.

### 4.5 Biểu đồ (Recharts, không thêm thư viện)

| Biểu đồ | Nội dung |
|---|---|
| Chuỗi thời gian | Thị phần theo năm, đường Theil–Sen, năm bất thường, vùng cửa sổ gần `R`, năm chưa hoàn chỉnh |
| Phần dư | Cột `e_t` theo năm |
| Boxplot | Thị phần trên `W` (dựng bằng `ComposedChart` tuỳ biến) |
| Số bài theo năm | `n_t`, dữ liệu mô tả |
| Histogram trích dẫn | Số bài theo dải trích dẫn (facet đã có) |

---

## 5. Đợt 1 — Kết luận

### 5.1 Cổng dữ liệu

`source = "local"` → `LOCAL_CORPUS`; `n < 5` → `TOO_FEW_YEARS`; tổng bài trong `W` `< 30` → `TOO_FEW_PAPERS`. Giữ nguyên spec 10-16.

### 5.2 Đại lượng

- `MK_W`: Mann–Kendall trên `W`; `p*` = q-value BH trên **mọi chủ đề đã kiểm định của phạm vi** (trang chi tiết dùng p-value như hiện tại).
- `r_R = b_R / median(s trên R) × 100`: mức thay đổi tương đối trên cửa sổ gần.
- `peakRatio = median(s của 3 năm cuối) / max(s_t trên W)`.

### 5.3 Quy tắc (xét theo thứ tự)

| # | Điều kiện | Verdict | Reason |
|---|---|---|---|
| 1 | Hỏng cổng §5.1 | `insufficient` | như cũ |
| 2a | `p* < α`, `S > 0`, `n ≥ 10`, `peakRatio < PAST_PEAK` | `past_peak` | `DECLINE_AFTER_PEAK` |
| 2 | `p* < α`, `S > 0`, `n ≥ 10`, `|r_R| < FLAT_PCT`, `peakRatio ≥ NEAR_PEAK` | `saturated` | `PLATEAU_AFTER_INCREASE` |
| 3 | `p* < α`, `S > 0` | `rising` | `SIGNIFICANT_INCREASE` |
| 4 | `p* < α`, `S < 0` | `declining` | `SIGNIFICANT_DECREASE` |
| 5 | Còn lại | `stable` | `NO_SIGNIFICANT_TREND` |

**Độ tin cậy** (`rising`, `saturated`, `past_peak`, `declining`): `high` khi `p* < 0.01` và `n ≥ 8`, ngược lại `medium`. Như spec 10-16.

### 5.4 Ngưỡng

| Hằng số | Giá trị khởi điểm | Loại |
|---|---|---|
| `α`, `MIN_YEARS`, `MIN_PAPERS`, `HIGH_CONFIDENCE_*` | 0.05, 5, 30, 0.01 / 8 | Như spec 10-16 |
| `FULL_WINDOW_YEARS`, `RECENT_WINDOW_YEARS` | 15, 5 | **Quy ước dự án** |
| `FLAT_PCT` | 2 (%/năm) | **Quy ước dự án**, giữ sau lần chạy 2026-11-14 |
| `NEAR_PEAK` | 0.85 | **Quy ước dự án**, giữ sau lần chạy 2026-11-14 |
| `PAST_PEAK` | 0.5 | **Quy ước dự án**, thêm 2026-11-14 |
| `LIFECYCLE_MIN_YEARS` | 10 | **Quy ước dự án**: `saturated` và `past_peak` cần `n ≥ 10` |
| MAD cut-off | 2.5 | Leys et al. (2013) |

Hai ngưỡng "phải hiệu chỉnh" chỉ được chốt sau khi chạy script chỉ đọc `pnpm --filter backend eval:trends` (mới, cùng kiểu `eval:gaps`): in phân phối `r_R` và `peakRatio` của 331 chủ đề cùng danh sách chủ đề rơi vào mỗi trạng thái, để người duyệt đối chiếu với các chủ đề quen thuộc. Giá trị chốt và ngày chạy ghi lại vào bảng này.

**Lần chạy 2026-11-14** (331 chủ đề, `W` = 2011–2025, `it-v1`): 87 chủ đề tăng có ý nghĩa; trong đó `r_R` có trung vị 3,97 (p25 −0,61, p75 9,08) và `peakRatio` có trung vị 0,91 (p25 0,81). Với bộ ngưỡng trên: 71 tăng, 12 bão hoà, 4 qua đỉnh, 169 giảm, 53 ổn định, 22 chưa đủ dữ liệu. `NEAR_PEAK` từ 0,7 đến 0,9 chỉ đổi số bão hoà từ 13 xuống 11; `FLAT_PCT = 3` cho 20 chủ đề bão hoà (thêm các chủ đề blockchain). Một lần quét không có cache mất 184 giây.

### 5.5 Xếp hạng

`sortBy = "trend"`: `rising` → `saturated` → `stable` → `past_peak` → `declining` → `insufficient`. Trong `rising` theo mức thay đổi tương đối `r` giảm dần, trong `declining` theo `r` tăng dần, còn lại theo tổng bài. Vì `r` là tương đối so với thị phần của chính chủ đề, chủ đề nhỏ tăng mạnh đứng trên chủ đề lớn tăng nhẹ.

---

## 6. Đợt 1 — Thay đổi code

### 6.1 Backend

| File | Thay đổi |
|---|---|
| `trend.scope.ts` (mới) | `IT_SCOPE`, `IT_SCOPE_VERSION`, mệnh đề lọc và `N_t` |
| `trend.descriptive.ts` (mới) | §4.2, §4.3 |
| `trend.outliers.ts` (mới) | §4.4 |
| `trend.verdict.ts` | Quy tắc §5.3, hằng số §5.4, `saturated`, thứ tự xếp hạng |
| `trend.openalex-topics.ts` | Bỏ `selectTopicCandidates`, `GLOBAL_CANDIDATES`, `PER_STRATUM`, `MAX_CANDIDATES`; ứng viên là mọi chủ đề của phạm vi; mẫu số theo phạm vi |
| `trend.openalex-overview.ts`, `trend.openalex-detail.ts`, `trend.evidence.ts`, `trend.service.ts` | Cửa sổ 15 năm; khối `eda` ở chi tiết chủ đề; bỏ trường đếm thô |
| `trend.formulas.ts` | Xoá `yoyGrowthPct`, `cagrPct`, `linearSlope`, `computeMetrics`; giữ `fillMissingYears`, `truncateToCompleteYears` |
| `trend.postgres.ts` | Bỏ trường đếm thô; verdict vẫn `insufficient` (`LOCAL_CORPUS`) |
| `workers/notification.worker.ts` | Thêm một job lặp, cùng kiểu job kiểm tra chủ đề đang theo dõi (`TREND_FOLLOW_CRON`), gọi overview của phạm vi để làm nóng cache |
| `config/env.ts` | `TREND_WARM_CRON` (mặc định hằng tuần) |
| `trend-explain.prompt.ts` | Dùng số liệu mới; tăng `TREND_EXPLAIN_PROMPT_VERSION` |
| `trend-follow.service.ts`, `projects/project-trends.service.ts`, `mcp/mcp.tools.ts` | Nhận `saturated`; bỏ trường đếm thô |
| `scripts/` hoặc `modules/trends/` | Script `eval:trends` |

**Không đổi Prisma schema.** `last_verdict` và `verdict` là `VARCHAR(24)` nên nhận được giá trị mới.

**Chi phí request.** Lần đầu: 331 chuỗi chủ đề + chuỗi mẫu số + 4 request thông tin chủ đề. Mỗi request được cache 7 ngày; job làm nóng chạy trước khi cache hết hạn. Khi cache nguội và job chưa chạy, overview tính trực tiếp như hiện tại và sẽ chậm; đây là đánh đổi đã chấp nhận của D8.

### 6.2 API

| Endpoint | Thay đổi |
|---|---|
| `GET /trends` | Phạm vi CNTT, kiểm định mọi chủ đề, verdict mới, `scopeVersion`; bỏ `candidateStrata` và trường đếm thô |
| `GET /trends/:topic` | Thêm khối `eda`: kiểm tra dữ liệu, thống kê mô tả, đường xu hướng, phần dư, năm bất thường, `r_R`, `peakRatio` |
| `GET /trends/compare`, `/topic-candidates`, `/periods` | Phạm vi và mẫu số mới; bỏ trường đếm thô |

Giữ envelope `{ success, data, meta }`, controller mỏng, schema Zod.

### 6.3 Shared types

- `TrendVerdict` thêm `"saturated"`, `"past_peak"`. `TrendReasonCode` thêm `PLATEAU_AFTER_INCREASE`, `DECLINE_AFTER_PEAK`.
- `TrendClassification` thêm `recentRelativeChangePct`, `peakRatio`.
- Kiểu mới: `DescriptiveStats`, `TopicEda`.
- Xoá `TrendMetrics` và các trường `growthRatePct`, `cagr3yPct`, `momentum`; xoá `TrendCandidateStrata`.

### 6.4 Web

- Badge, bộ lọc và màu cho trạng thái bão hoà.
- Trang chi tiết: mục "Phân tích khám phá" theo thứ tự §4.1 → §4.5, cuối cùng là kết luận kèm lý do và lưu ý năm bất thường.
- Trang Tài liệu: cập nhật nội dung và `trend-doc-constants.ts` theo §5.4; thêm mục EDA, bão hoà, phạm vi CNTT.
- i18n `vi.ts`, `en.ts`.

### 6.5 Các bước

| Bước | Nội dung | Kết quả kiểm được |
|---|---|---|
| 0 | `trend.scope.ts` và script `eval:trends` | Biết thời gian và số request của một lần quét; có phân phối để chốt ngưỡng §5.4 |
| 1 | Hàm thuần §4, quy tắc §5.3, shared types, xoá chỉ số đếm thô | Unit test xanh, có chuỗi đối chiếu tính tay |
| 2 | Nối vào API, khối `eda`, job làm nóng cache | Test route; overview trả đủ 331 chủ đề |
| 3 | Web và trang Tài liệu | Kiểm trong trình duyệt |

### 6.6 Tiêu chí chấp nhận

1. Mỗi công thức §4.2–§4.4 có unit test với một chuỗi tính tay.
2. Mỗi dòng §5.3 có unit test; `n = 4` → `insufficient`; local → `insufficient`; `n < 10` không bao giờ `saturated`.
3. `testedTopicCount` của overview bằng số chủ đề của phạm vi có ít nhất 1 bài trong `W`.
4. Không còn `growthRatePct`, `cagr3yPct`, `momentum` trong code, types, prompt, UI.
5. Hai ngưỡng "phải hiệu chỉnh" đã được chốt và ghi vào §5.4 kèm ngày chạy `eval:trends`.
6. Trang Tài liệu hiển thị đúng hằng số backend, ghi rõ ngưỡng nào là quy ước dự án, có danh sách phạm vi và `scopeVersion`.
7. `pnpm typecheck`, `pnpm test`, `pnpm --filter backend runtime:audit:postgres` xanh.

---

## 7. Đợt 2 — Toàn cảnh và mới nổi

Chỉ bắt đầu sau khi Đợt 1 chạy ổn. Vẫn không thêm bảng.

### 7.1 Phân tích giữa các chủ đề (overview)

- Chia chủ đề thành ba nhóm quy mô (tam phân vị theo tổng số bài trong `W`): nhỏ, vừa, lớn; thêm bộ lọc nhóm quy mô.
- Thống kê mô tả (§4.2) của phân phối `r` trên toàn phạm vi và theo nhóm.
- Biểu đồ: histogram và boxplot của `r`, scatter `log₁₀(tổng bài)` × `r` tô màu theo verdict, số chủ đề theo trạng thái.
- **Chủ đề bất thường:** `r` nằm ngoài `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` của nhóm quy mô (Tukey 1977).
- **Nhãn "rõ ràng"** (`clear: true`) cho `rising` / `declining` là chủ đề bất thường của nhóm mình.

### 7.2 Chủ đề ứng dụng (lớp 3)

Admin thêm chủ đề ngoài lớp 1–2 qua catalogue nghiên cứu. Các chủ đề này lọc bằng `primary_topic.id` (thuộc tính khác subfield), nên mẫu số là tổng của hai request. Thêm chủ đề = tăng `IT_SCOPE_VERSION`.

### 7.3 Tín hiệu mới nổi

Dùng lại tính năng từ khoá đang nổi (`risingKeywords`, log odds ratio + BH đã có trong `trend.evidence.ts` và `trend.openalex-overview.ts`), giới hạn vào phạm vi CNTT, thêm hai tiêu chí:

| Tiêu chí | Quy tắc | Nguồn |
|---|---|---|
| Đủ lớn | `≥ EMERGING_MIN_PAPERS = 20` bài trong 3 năm gần nhất | Quy ước dự án |
| Mới | `≥ NOVELTY_SHARE = 70%` số bài của 10 năm nằm trong 3 năm gần nhất | Rotolo et al. (2015): novelty |
| Tăng nhanh | Log odds ratio giữa giai đoạn gần và giai đoạn trước: `z > 0`, q-value BH `< α` (đã có) | Small et al. (2014); Woolf (1955), Haldane (1956) |

Verdict `emerging`, reason `EMERGING_SIGNAL`, hiển thị ở một tab riêng với ghi chú "tín hiệu sớm, không phải dự báo". Hai ngưỡng quy ước cũng được hiệu chỉnh bằng `eval:trends`.

Giới hạn đã biết: chỉ bắt được hướng mới khi OpenAlex đã gán từ khoá cho nó; ứng viên là các từ khoá phổ biến nhất của mỗi giai đoạn nên từ khoá rất hiếm có thể bị sót.

---

## 8. Đợt 3 — Để sau, chưa cam kết

| Việc | Vì sao để sau |
|---|---|
| Worker quét riêng + bảng `trend_scans`, `trend_scan_topics` lưu lịch sử | Chỉ cần khi muốn xem chủ đề chuyển trạng thái theo thời gian hoặc khi cache không đủ nhanh |
| Mới nổi bằng khai thác cụm từ từ tiêu đề/tóm tắt trong DB, xác nhận bằng tìm kiếm văn bản OpenAlex | Tốn khoảng 2.200 request mỗi lần chạy cho 100 ứng viên; cú pháp và giới hạn tìm kiếm chưa kiểm |
| Kiểm định Pettitt (năm đổi chiều) | Chỉ để hiển thị |
| p chính xác của Mann–Kendall khi `n ≤ 10` | Cửa sổ mặc định 15 năm nên ít khi dùng |
| Quy tắc "qua đỉnh" cho chủ đề tăng rồi giảm mà Mann–Kendall không còn ý nghĩa | Bản tối thiểu (`past_peak`) đã đưa lên Đợt 1; trường hợp này vẫn ra `stable` |
| Kiểm định lại sau khi bỏ năm bất thường | Nhân số lần kiểm định; Đợt 1 đã hiển thị năm bất thường |
| Heatmap tương quan ở tab So sánh, biểu đồ tăng trưởng vượt trội | Không liên quan kết luận |
| EDA mức bài báo bằng mẫu ngẫu nhiên từ OpenAlex, hiệu chỉnh tự tương quan | Ngoài phạm vi |

---

## 9. Hạn chế (ghi trên trang Tài liệu)

1. **Ngưỡng bão hoà là quy ước dự án**, được hiệu chỉnh trên dữ liệu thật nhưng không có nguồn công bố.
2. **Chủ đề tăng rồi giảm trong cùng cửa sổ** có thể được xếp `stable` vì Mann–Kendall chỉ bắt xu hướng đơn điệu (xem Đợt 3, quy tắc "qua đỉnh").
3. **Tự tương quan** vẫn chưa hiệu chỉnh (hạn chế 1 của spec 10-16); p vẫn là xấp xỉ chuẩn (hạn chế 6).
4. **OpenAlex đổi bộ phân loại ngày 2026-10-05.** Danh sách chủ đề không đổi nhưng việc gán bài và bộ từ khoá đã đổi. Bài trong DB sync trước ngày đó có thể mang chủ đề cũ; số đếm OpenAlex dùng phân loại mới cho mọi năm.
5. **Phạm vi do dự án định nghĩa.** Mảng ứng dụng CNTT ngoài lớp 1–2 chưa được tính cho tới Đợt 2.
6. **Skewness, kurtosis trên chuỗi ngắn** dao động mạnh, chỉ mang tính mô tả.
7. **Mới nổi (Đợt 2) là tín hiệu sớm**, không dự báo được hướng đó sẽ tiếp tục.
8. Các hạn chế 4, 5 của spec 10-16 (phân loại tự động, mô tả quá khứ) vẫn đúng.

---

## 10. Câu hỏi còn mở

1. **Follow và snapshot cũ** tính theo mẫu số field: giữ nguyên và đánh dấu "phương pháp cũ" (đề xuất), hay tính lại?
2. **Chủ đề đang theo dõi nằm ngoài phạm vi CNTT:** ngừng kiểm tra và báo cho người dùng, hay giữ cách tính cũ cho riêng chúng?
3. **Tần suất job làm nóng cache:** hằng tuần (đề xuất) hay hằng ngày, tuỳ số đo ở bước 0 và ngân sách OpenAlex dùng chung với sync.
4. **Danh sách chủ đề lớp 3** (Đợt 2) ban đầu do ai chọn.

---

## 11. Tài liệu tham khảo

**Khung phương pháp (giữ từ spec 10-16):** NSF/NCSES *Science & Engineering Indicators*; Helsel et al. (2020), doi:10.3133/tm4A3; Mann (1945); Kendall (1975); Sen (1968); Benjamini & Hochberg (1995); Gilbert (1987); Woolf (1955); Haldane (1956).

**Bổ sung (DOI đã kiểm qua Crossref ngày 2026-11-13 và 2026-11-14):**

- Nelis, J. L. D. et al. (2022). The General Growth Tendency: A tool to improve publication trend reporting by removing record inflation bias and enabling quantitative trend analysis. *PLoS ONE* 17(5): e0268433. doi:10.1371/journal.pone.0268433
- Bornmann, L., & Mutz, R. (2015). Growth rates of modern science. *JASIST* 66(11): 2215–2222. doi:10.1002/asi.23329
- Griffiths, T. L., & Steyvers, M. (2004). Finding scientific topics. *PNAS* 101(suppl. 1): 5228–5235. doi:10.1073/pnas.0307752101
- Joanes, D. N., & Gill, C. A. (1998). Comparing measures of sample skewness and kurtosis. *The Statistician* 47(1): 183–189. doi:10.1111/1467-9884.00122
- Leys, C. et al. (2013). Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median. *Journal of Experimental Social Psychology* 49(4): 764–766. doi:10.1016/j.jesp.2013.03.013
- Donthu, N. et al. (2021). How to conduct a bibliometric analysis: An overview and guidelines. *Journal of Business Research* 133: 285–296. doi:10.1016/j.jbusres.2021.04.070
- Rotolo, D., Hicks, D., & Martin, B. R. (2015). What is an emerging technology? *Research Policy* 44(10): 1827–1843. doi:10.1016/j.respol.2015.06.006 (Đợt 2)
- Small, H., Boyack, K. W., & Klavans, R. (2014). Identifying emerging topics in science and technology. *Research Policy* 43(8): 1450–1467. doi:10.1016/j.respol.2014.02.005 (Đợt 2)
- Pettitt, A. N. (1979). A non-parametric approach to the change-point problem. *Applied Statistics* 28(2): 126–135. doi:10.2307/2346729 (Đợt 3)

**Không có DOI hoặc chưa kiểm:** Tukey, J. W. (1977). *Exploratory Data Analysis*. Addison-Wesley. NIST/SEMATECH e-Handbook of Statistical Methods, ch. 1 (Heckert & Filliben). Tài liệu OpenAlex về Topics: https://help.openalex.org/data/topics.md.

**Cần đọc toàn văn trước khi ghi lên trang Tài liệu** (mới đối chiếu thư mục và tóm tắt phương pháp): Nelis (2022), Leys (2013) ngưỡng 2.5, Joanes & Gill (1998) công thức `G₁`, `G₂`.
