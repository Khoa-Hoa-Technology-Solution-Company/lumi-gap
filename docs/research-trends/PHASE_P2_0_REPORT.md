# PHASE P2.0 — OpenAlex Data & Budget Verification Gate (Checkpoint 2)

> Ngày đo: **2026-10-22** (UTC 02:04–02:14). Chỉ đọc: chỉ có request GET tới `api.openalex.org`.
> Không ghi DB, không tạo worker, không tạo migration hay bảng, không sửa code ứng dụng. Không làm P2.1.
> Bằng chứng (không chứa API key): `evidence/p2_0_openalex_2026-10-22.json` (probe + so sánh GGT), `evidence/p2_0_fullrun_snapshot_2026-10-22.json` (lần chạy đầy đủ), `evidence/p2_0_fullrun.mjs` (script đọc-only để lặp lại phép đo).
> Scope dùng cho mọi phép đo, trừ khi ghi khác: scope mặc định của app `type:article|review|preprint|conference-paper|book-chapter` (`DEFAULT_WORK_TYPES_CLAUSE`).

## 1. Git và môi trường

- Nhánh `feat/research-trends-p0` @ `5a9d228`. Không commit, push hay merge.
- 84 đường dẫn thay đổi hoặc chưa theo dõi:
  - 83 là thay đổi P0 + P1 đã báo cáo, vẫn còn nguyên;
  - 1 là thư mục mới `docs/research-trends/evidence/` của P2.0.
- Không có thay đổi lạ ngoài P0/P1/P2.0. Không có file staged.
- Không dùng lệnh git phá hủy.
- **Mobile:**
  - `git status` của `apps/flutter_mobile`, `apps/mobile`: rỗng.
  - Manifest sha256 235 file trùng **từng byte** với snapshot trước P1.
  - Không chạy Flutter/Dart.
- **Môi trường:**
  - Script Node 22 (`fetch`), tuần tự, nghỉ 120 ms giữa các request.
  - Lần chạy engine P1 dùng code ứng dụng **không sửa**, với Redis cô lập (`lumigap-p1-verify-redis`, DB 14) và `DATABASE_URL` trỏ DB thử `lumigap_p1_test`.
  - Không kết nối DB dev/production.

## 2. Xác thực API

- **Tài liệu hiện hành** (help.openalex.org, đọc 2026-10-22):
  - Key gửi bằng `api_key` hoặc `Authorization: Bearer`.
  - "required for cursor paging past the first page".
  - Header `X-RateLimit-Limit / -Remaining / -Credits-Used / -Reset`.
  - Giới hạn tốc độ 30 req/s với free key.
  - `group_by` tối đa 200 nhóm/trang, sắp theo `key`, nhóm unknown chỉ có khi thêm `:include_unknown`.
  - `meta.count` = số works khớp filter; `groups_count` chỉ đếm trong trang.
- **Cấu hình:** `OPENALEX_API_KEY` có trong `.env` (1 dòng, 22 ký tự). **Không in, không ghi giá trị.**
  - Script gửi key chỉ qua header `Authorization`, không đặt trong URL.
  - Kiểm tra sau chạy: 0 lần xuất hiện của key trong mọi file output.
  - Endpoint `/rate-limit` trả về một dạng che một phần của key; trường đó **bị loại** khỏi bằng chứng.
- **Kết quả:**

| Kiểm tra | Kết quả |
|---|---|
| `/rate-limit` có key | 200. Ngân sách ngày **$1 = 10.000 credit**; `list` = 1 credit = $0,0001; `singleton` = 0; reset 00:00 UTC |
| Trang 1 cursor `group_by` (2024) | 200 |
| **Trang 2 cursor có key** | **200**, 200 nhóm |
| Trang 2 cursor **không** key | 401 `"API key required for cursor paging"` (đúng tài liệu) |

## 3. Cursor pagination

- **Probe:** 4 năm (2016, 2020, 2024, 2025) có scope mặc định, cộng năm 2024 không scope.
- **Lần chạy đầy đủ:** 10 năm × 4 cấp.

| Đo | Kết quả |
|---|---|
| Số trang `primary_topic.id:include_unknown` mỗi năm | **24** = 23 trang dữ liệu + 1 **trang cuối rỗng** (0 nhóm, `next_cursor = null`). Trang rỗng vẫn tính 1 credit |
| Trùng key giữa các trang | 0 |
| Thứ tự | Trang đầu bắt đầu bằng `unknown`, sau đó key topic tăng dần (`T10001…T10199`, rồi `T10200…T10399`, …); ở mọi ranh giới trang, key tăng đơn điệu. **Không** theo count. Chỉ kiểm tra tại ranh giới trang; thứ tự bên trong trang không được kiểm riêng |
| Số trang cấp domain / field / subfield mỗi năm | 2 / 2 / 3 (gồm trang rỗng cuối) |
| `/topics` (danh mục) | 23 trang, **4.516** topic |

## 4. Đã phân loại và chưa phân loại

Cùng filter, đo bằng `per_page=1` (`meta.count`) và bằng `group_by` theo năm:

| Năm | Tổng (`meta.count`) | `primary_topic.id:!null` | `primary_topic.id:null` | Chưa phân loại | Tổng − (!null + null) |
|---|---:|---:|---:|---:|---:|
| 2016 | 8.277.944 | 8.018.260 | 259.684 | 3,14% | 0 |
| 2017 | 8.030.206 | 7.814.149 | 216.057 | 2,69% | 0 |
| 2018 | 8.040.088 | 7.811.594 | 228.494 | 2,84% | 0 |
| 2019 | 8.331.649 | 8.117.737 | 213.912 | 2,57% | 0 |
| 2020 | 8.693.155 | 8.464.451 | 228.704 | 2,63% | 0 |
| 2021 | 8.171.016 | 7.985.114 | 185.902 | 2,28% | 0 |
| 2022 | 7.739.217 | 7.505.418 | 233.799 | 3,02% | 0 |
| 2023 | 8.149.618 | 7.915.621 | 233.997 | 2,87% | 0 |
| 2024 | 8.738.335 | 8.541.959 | 196.376 | 2,25% | 0 |
| 2025 | 9.914.030 | 9.742.868 | 171.162 | 1,73% | 0 |

- **`meta.count` ≠ tổng đã phân loại.** Trong mọi lần chạy, `meta.count` của `group_by` − Σ nhóm topic = **đúng** nhóm `unknown` (sai lệch 0).
- Không scope (2024): chưa phân loại **5,17%** (566.420 / 10.962.953), cao hơn nhiều so với 2,25% của scope mặc định. Các loại công trình ngoài 5 loại mặc định ít được gán topic hơn.
- **Code:** baseline global dùng `primary_topic.id:!null` (`trend.baseline.ts:57`); các cấp khác lọc theo `primary_topic.{level}.id`, nên chỉ gồm công trình đã phân loại. Không có mẫu số nào dùng `meta.count`. `unclassifiedSharePct` báo phần bị loại.

## 5. Độ đầy đủ topic (lần chạy đầy đủ, 10 năm)

| Năm | Nhóm topic (≠ unknown) | Σ nhóm topic − `!null` | `unknown` − `null` | Σ topic − Σ domain / field / subfield |
|---|---:|---:|---:|---|
| 2016 | 4.414 | 0 | 0 | 0 / 0 / 0 |
| 2017 | 4.414 | 0 | 0 | 0 / 0 / 0 |
| 2018 | 4.413 | 0 | 0 | 0 / 0 / 0 |
| 2019 | 4.413 | 0 | 0 | 0 / 0 / 0 |
| 2020 | 4.411 | 0 | 0 | 0 / 0 / 0 |
| 2021 | 4.413 | 0 | 0 | 0 / 0 / 0 |
| 2022 | 4.411 | 0 | 0 | 0 / 0 / 0 |
| 2023 | 4.415 | 0 | 0 | 0 / 0 / 0 |
| 2024 | 4.412 | 0 | 0 | 0 / 0 / 0 |
| 2025 | 4.412 | 0 | 0 | 0 / 0 / 0 |

- Số nhóm ≤ 4.516 topic của danh mục. Khoảng 100–105 topic không có công trình nào trong năm/scope đó.
- Nhóm `unknown` có cùng giá trị ở cả 4 cấp group_by. Không gặp key lạ nào ngoài `unknown` và ID topic hợp lệ.
- Năm 2024 không scope cũng khớp tuyệt đối: Σ topic 10.396.533 = `!null`; unknown 566.420 = `null`.

## 6. Nhất quán baseline (2024, scope mặc định)

| Kiểm tra | Kết quả |
|---|---|
| Global = Σ topic = `!null` | 8.541.959 ở mọi cách tính |
| Domain: 4 nhóm, Σ = `!null` | sai lệch 0; unknown 196.376 |
| Field: 26 nhóm, Σ = `!null` | sai lệch 0 |
| Subfield: 252 nhóm, Σ = `!null` | sai lệch 0 |
| **Thành viên đơn vị:** gộp count 4.412 topic theo cây domain/field/subfield lấy từ `/topics`, so với count `group_by` cấp đó | **0 lệch** ở 4 domain, 26 field, 252 subfield; 0 topic thiếu metadata |
| Corpus | Scope mặc định không có tham số `corpus`. P0 (2026-10-21) đã ghi nhận: có/không `corpus=core` cho cùng số liệu (fixture `openalex-recorded-2026-10-21.json`). Không đo lại hôm nay |
| Loại công bố | Mọi phép đo dùng đúng 5 loại mặc định của app; engine P1 dựng scope bằng `buildOpenAlexScope({})` và tạo ra **đúng** chuỗi filter này |

## 7. So sánh GGT trực tiếp trên dữ liệu thật

- **Topic chọn tự động** từ danh sách 2024 theo count: hạng 1, hạng ~10%, hạng ~50%, và topic đầu tiên có 50 ≤ count < 120.
- **Cửa sổ:** 2016–2025, `lastCompleteYear = 2025`.
- **Cách so sánh:** đếm độc lập (`group_by=publication_year`), tính GGT bằng một cài đặt Python riêng; rồi chạy engine P1 thật (`computeOpenAlexTopicStatistics`) cho 4 baseline.

**Kết quả: 16/16 tổ hợp (4 topic × 4 baseline × 10 năm) khớp tuyệt đối.**
- Sai lệch tối đa: n = 0, N = 0, GGT năm = 0.
- Mean/SEM: 7,1 × 10⁻¹⁵ (sai số dấu phẩy động).
- Engine chạy 74 giây sau probe; count không đổi trong khoảng đó.

| Topic | Baseline | Mean GGT ± SEM (%) | Nhóm Nelis (máy gán) | Verdict MK | p |
|---|---|---|---|---|---|
| T10036 Advanced Neural Network Applications | global | 29,40 ± 6,20 | consistent_strong_growth | rising | < 0,001 |
| | domain | 29,01 ± 6,25 | consistent_strong_growth | rising | < 0,001 |
| | field | 24,54 ± 6,76 | consistent_strong_growth | rising | < 0,001 |
| | subfield | 22,77 ± 6,35 | consistent_strong_growth | rising | < 0,001 |
| T10279 Urinary Bladder and Prostate Research | global | −2,18 ± 1,88 | no_consistent_growth | declining | 0,0047 |
| | domain | −2,75 ± 2,18 | no_consistent_growth | declining | 0,0091 |
| | field | −2,73 ± 2,26 | no_consistent_growth | declining | 0,0091 |
| | subfield | −2,16 ± 0,87 | no_consistent_growth | declining | < 0,001 |
| T14515 International Law and Aviation | global | 0,16 ± 5,65 | no_consistent_growth | stable | 0,108 |
| | domain | 0,67 ± 5,58 | no_consistent_growth | stable | 0,291 |
| | field | 0,51 ± 5,57 | no_consistent_growth | stable | 0,216 |
| | subfield | 1,83 ± 5,61 | no_consistent_growth | stable | 0,728 |
| T14297 Plant-Derived Bioactive Compounds | global | −2,82 ± 5,06 | no_consistent_growth | **declining** | 0,029 |
| | domain | −3,21 ± 5,40 | no_consistent_growth | **declining** | 0,017 |
| | field | 1,58 ± 5,32 | no_consistent_growth | **stable** | 0,862 |
| | subfield | 2,74 ± 5,61 | no_consistent_growth | **stable** | 1,000 |

**Input chính xác, ví dụ T10036 với baseline field** (đầy đủ cho mọi tổ hợp trong `evidence/p2_0_openalex_2026-10-22.json` → `ggtComparison.rows`):
- n (2016→2025) = 2.649, 3.805, 6.156, 9.320, 11.130, 13.949, 15.920, 20.004, 25.134, 29.908.
- N = 441.644, 417.336, 449.766, 479.037, 496.529, 496.966, 501.695, 561.251, 652.308, 806.006.
- GGT 2017→2025 = 49,14; 54,02; 44,89; 15,77; 25,24; 13,18; 13,78; 9,42; −4,57.

**Phát hiện cần lưu ý** (không phải lỗi code, nhưng ảnh hưởng thiết kế P2.2):
- **Baseline đổi được verdict.** T14297 là "declining" với global/domain nhưng "stable" với field/subfield. Mean GGT của T10036 dao động 22,8–29,4% theo baseline. Một bảng xếp hạng phải luôn ghi baseline.
- **Nhãn "consistent_*" được gán dù SEM lớn so với mean.** Ví dụ T14515: 0,16 ± 5,65; T14297: 1,58 ± 5,32. Điều kiện ổn định 50% của Nelis không được kiểm tra (`stabilityChecked: false`), nên chữ "consistent" chưa được chứng minh.

## 8. Đo request và ngân sách

| Lần chạy | Request | Credit | USD | Thời gian | Trạng thái |
|---|---:|---:|---:|---|---|
| Probe (xác thực, độ đầy đủ 5 năm/scope, baseline, danh mục topic, 4 topic) | 188 | 186 (+1 keyless, +1 `/rate-limit` miễn phí) | 0,0186 | 133 s; trung vị 538 ms/request, p95 1.046 ms | 187 × 200, 1 × 401 (cố ý) |
| Engine P1 trên dữ liệu thật (16 tổ hợp) | không đo riêng (client app không ghi log request); 40 khóa cache | — | — | — | không lỗi |
| **Lần chạy đầy đủ** (10 năm × topic/domain/field/subfield, scope mặc định) | **310** | **310** | **0,031** | **214 s**; trung vị 440 ms | 310 × 200, 0 × 429 |

- **Đối soát quota:** `/rate-limit` trước và sau lần chạy đầy đủ cho 346 → 656 credit, tức **đúng 310**.
- **Mỗi request** `list`/`group_by` (kể cả trang rỗng cuối) = **1 credit = $0,0001**. Header thật: `x-ratelimit-cost-usd`, `-credits-used`, `-limit` (10000), `-limit-usd` (1), `-remaining`, `-remaining-usd`, `-reset`, `-onetime-remaining`, `-prepaid-remaining-usd`. `meta.cost_usd` cũng có.
- **Chi phí một lần thu thập đầy đủ**, scope mặc định, 10 năm, 4 cấp: **310 credit = 3,1% quota ngày**. Cộng danh mục `/topics` (23 credit, gần như tĩnh) và 2 request global theo năm: ≈ **335 credit ≈ 3,4%**.
  - Mỗi scope thêm ≈ +312 credit. Ngưỡng 30% (3.000 credit) cho phép ≈ 9 scope/ngày, chưa kể phần dự trữ 20% của client.
  - **Thiết kế phải dùng `group_by` topic theo năm.** Cách lấy chuỗi năm cho từng topic (`group_by=publication_year` × 4.516 topic) tốn ≈ 4.516 credit ≈ **45%**, vượt ngưỡng 30%.
- **Tốc độ:** tuần tự ~1,4 req/s, xa giới hạn 30 req/s; không gặp 429.
- **Usage chưa giải thích được:** 20 credit đã dùng trước khi probe chạy (sau 00:00 UTC), và ≈ 60 credit dùng thêm trong lúc probe chạy (`Remaining` giảm 245 so với 185 request tính phí).
  - Khi không có request nào của tôi (35 s), usage đứng yên. Lần chạy đầy đủ đối soát khớp tuyệt đối.
  - Có thể key được dùng chung với một tiến trình khác (ví dụ một bản deploy), nhưng **chưa xác nhận**. Ngân sách P2.1 cần tính phần này.
- **Tổng tiêu thụ trong khoảng P2.0 hôm nay:** ≈ 636 credit ($0,064, kể cả ≈ 60 credit chưa giải thích được) trên 656 credit đã dùng của key, ≈ 6,6% quota ngày.

## 9. Độ đầy đủ, ổn định và giới hạn dữ liệu

- **Topic bị thiếu:** 1,73–3,14%/năm công trình (scope mặc định) không có primary topic, nên nằm ngoài mọi N_t. Tỷ lệ này thay đổi theo năm, có thể làm lệch nhẹ baseline global giữa các năm.
- **Nhóm lạ:** không có; chỉ `unknown` và ID topic.
- **Lọc năm:** `publication_year:Y` và `group_by=publication_year` cho cùng tổng (0 lệch).
- **Dao động trong ngày:** probe (02:04) so với lần chạy đầy đủ (02:10): count 4.412 topic năm 2024 **không đổi**.
- **Dao động qua ngày** (2026-10-21, ghi ở P0, so với 2026-10-22; cùng filter, tổng theo năm):

| Năm | Δ tổng | Δ chưa phân loại | Δ đã phân loại |
|---|---:|---:|---:|
| 2016 | +205 | 0 | +205 |
| 2019 | +88 | −26 | +114 |
| 2023 | +780 | +6 | +774 |
| 2024 | +1.148 | +12 | +1.136 |
| 2025 | +2.080 | +14 | +2.066 |

- **Năm gần nhất còn tăng mạnh nhất** (+0,02%/ngày cho 2025). Số liệu `lastCompleteYear = 2025` vẫn đang được bổ sung.
- Đây mới là **tổng theo năm**. Lần chạy đầy đủ theo topic thứ hai (≥ 1 ngày) **chưa có**.
- **Thời điểm thu thập:** mọi số liệu ở đây là trạng thái API **sống** tại thời điểm ghi trong bằng chứng, **không** phải snapshot lịch sử cố định. OpenAlex cập nhật hằng ngày và có thể phân loại lại topic: topic được gán bằng mô hình máy học, có thể đổi khi OpenAlex chạy lại bộ phân loại.
- **Thứ tự phân trang:** theo key. P2.1 không được giả định trang đầu chứa các topic lớn nhất.

## 10. Các điểm khoa học chưa giải quyết (giữ nguyên từ P1)

1. Công thức GGT năm **khớp** dữ liệu bổ sung của tác giả (sai lệch 0 trên 43 sheet) và hôm nay khớp tính độc lập trên dữ liệu thật. **[ĐÃ XÁC MINH]**
2. Mean ± SEM chỉ tái tạo **4/12** giá trị in trong bài. **[SUY LUẬN, được hỗ trợ một phần]**
3. Tiêu chí ổn định "< 50% year-to-year variation" của Nelis **chưa xác minh, không áp dụng**. Nhãn "consistent_*" vì vậy chưa chứng minh được tính "consistent" (§7: SEM lớn).
4. GGT **không** thay verdict Mann–Kendall. Verdict vẫn chỉ từ MK/Sen/BH trên share; có test (P1).
5. Danh sách "Fastest Growing" theo mean GGT (P2.2) cần nhãn rõ: baseline, cửa sổ, mean ± SEM, "mô tả, chưa kiểm định ổn định". Cần thêm kiểm chứng trước khi coi là kết luận khoa học. §7 cho thấy thứ hạng và verdict phụ thuộc baseline.

## 11. Acceptance criteria P2.0 (05_IMPLEMENTATION_PLAN.md, bản Checkpoint 1.5)

| Criterion | Status | Evidence | Remaining Risk |
|---|---|---|---|
| API key hoạt động: cursor trang 2 → 200, không 401 | **PASS** | §2: trang 2 có key 200 (200 nhóm); không key 401 | Có usage chưa giải thích được, có thể key dùng chung (§8) |
| Đủ topic: cursor `primary_topic.id:include_unknown` tới hết; nhóm ≠ unknown ≤ 4.516; Σ nhóm = `!null`; unknown = `null` | **PASS** | §5: 10/10 năm, sai lệch 0; 4.411–4.415 nhóm ≤ 4.516 | — |
| Không dùng `meta.count` làm tổng đã phân loại | **PASS** | §4: `meta.count` − Σ topic = unknown, chính xác; code dùng `!null` | — |
| Thứ tự trang theo key, không theo count | **PASS** | §3: `unknown`, rồi key tăng; ranh giới trang đơn điệu | Thứ tự bên trong trang chỉ suy ra từ ranh giới + đối soát tổng |
| Ngân sách lần chạy đầy đủ ≤ 30% quota ngày | **PASS** | §8: 310 credit thực đo (đối soát quota) = 3,1%; ≈ 3,4% gồm danh mục | Chỉ đúng với thiết kế `group_by` theo năm; thiết kế theo topic ≈ 45% → không đạt |
| ~~Kiểm soát ngân sách: giả lập `Remaining` thấp → worker dừng sạch, ghi tiến độ, chạy tiếp hôm sau~~ | **CHUYỂN SANG P2.1** (hiệu chỉnh kế hoạch 2026-10-22, được duyệt trong chat) | Không chạy, không đánh PASS. Xem `P2_0_FINAL_GATE.md` §5 và `05_IMPLEMENTATION_PLAN.md` §P2.1 | Phải đạt ở P2.1 trước khi worker gọi OpenAlex thật |
| Bảo vệ ngân sách của OpenAlex client (tiêu chí thay thế, hiệu chỉnh 2026-10-22) | **PASS** | Header thật dùng đơn vị credit (`x-ratelimit-limit: 10000`, `-remaining`, `-credits-used: 1`), khớp logic `Remaining / Limit` của client. Test client 15/15 PASS (chạy lại 2026-10-22), gồm: dừng dưới 20%; dùng `Limit` thật của key; 429 hết ngân sách → 0 retry + khóa tới reset; 429 tốc độ → retry; key chỉ ở header | 429 chỉ kiểm bằng phản hồi giả lập; không gặp 429 thật và không cố ý gây ra |
| Ổn định: 2 lần chạy cách nhau ≥ 1 ngày, báo cáo khác biệt | **PASS** (cập nhật 2026-10-23) | Lần 2 chạy 2026-10-23T03:57:10Z → 04:00:50Z, cách lần 1 **25,72 giờ**, sau khi preflight PASS. Đã báo cáo khác biệt theo topic × năm, theo cấp và theo analytics (§14). Lần 1 (2026-10-22): `p2_0_preflight.mjs` từ chối lúc 02:20Z vì mới qua 0,11 giờ | Biến động nhỏ nhưng thường xuyên, xem §14 |
| Baseline nhất quán (yêu cầu bổ sung của Checkpoint này) | **PASS** | §6: 4/26/252 đơn vị, 0 lệch; thành viên topic → cây phân loại 0 lệch | — |
| So sánh GGT trực tiếp với engine P1 (yêu cầu bổ sung) | **PASS** | §7: 16/16 tổ hợp khớp tuyệt đối | Kết quả khoa học phụ thuộc baseline (§7) |

## 12. Quyết định cổng

> **Cập nhật 2026-10-23 (§14): READY FOR P2.1** (đề xuất, chờ duyệt). Mọi tiêu chí P2.0 đã hiệu chỉnh đều PASS. Lần thu thập thứ hai đã chạy và được so sánh. Tiêu chí worker đã chuyển hợp lệ sang P2.1. Phần dưới đây giữ nguyên như lúc viết để làm lịch sử.

**CONDITIONAL — chưa sẵn sàng bắt đầu P2.1.** *(quyết định ban đầu, 2026-10-22)*

> **Cập nhật 2026-10-22 (final gate, §13):** dòng (2) dưới đây đã được chuyển hợp lệ sang P2.1 theo hiệu chỉnh kế hoạch được duyệt. Chỉ còn dòng (1) PENDING. Quyết định vẫn là **CONDITIONAL** (`P2_0_FINAL_GATE.md`).

Theo kế hoạch: "Nếu một dòng không đạt → báo cáo và dừng, không làm P2.1+". Hai dòng bắt buộc chưa đạt (tại thời điểm báo cáo ban đầu):
1. **Ổn định (PENDING):** cần lần chạy đầy đủ thứ hai cách lần thứ nhất ≥ 1 ngày (từ 2026-10-23 UTC), so với `p2_0_fullrun_snapshot_2026-10-22.json`, và báo cáo khác biệt theo topic và năm. Chi phí ≈ 310 credit.
2. **Kiểm soát ngân sách của worker (BLOCKED):** tiêu chí đo một worker chưa tồn tại. Đây là mâu thuẫn trong kế hoạch, không phải lỗi dữ liệu. **Đề xuất (cần duyệt, chưa áp dụng):** chuyển tiêu chí này thành acceptance bắt buộc của P2.1, với test giả lập `Remaining` thấp trước khi worker chạy thật. Không tự đổi tiêu chí đã duyệt.

Mọi dòng còn lại PASS với bằng chứng số: key, đủ topic, `meta.count`, thứ tự, ngân sách 3,1%, baseline, GGT trên dữ liệu thật.

**Dừng ở P2.0. Không bắt đầu P2.1. Chờ duyệt.**

## 13. Cập nhật final gate (2026-10-22, 02:18–02:25Z)

- **Hiệu chỉnh kế hoạch (được duyệt trong chat):**
  - Tiêu chí "worker dừng sạch / ghi tiến độ / chạy tiếp" chuyển sang acceptance bắt buộc của P2.1, với 5 nhóm integration test: quota thấp, 429, job bị ngắt, khôi phục checkpoint, idempotency.
  - P2.0 thay bằng "Bảo vệ ngân sách của OpenAlex client": **PASS** (§11).
  - Lý do: tiêu chí cũ kiểm một thành phần chỉ được tạo ở P2.1, vi phạm quy tắc §0.2 "Acceptance criteria độc lập".
- **Lần thu thập thứ hai: PENDING.** Kiểm tra lúc 2026-10-22T02:20:09Z:
  - Key hoạt động (`/rate-limit` 200), quota còn 9.344/10.000 credit.
  - Chi phí dự kiến 335 credit ≤ trần 30% (3.000). Tổng hôm nay + chi phí = 991 ≤ 3.000.
  - **Nhưng mới qua 0,11 giờ** kể từ lần thứ nhất ⇒ không chạy. Không tạo dữ liệu thay thế.
- **Công cụ cho lần thứ hai** (`evidence/`):
  - `p2_0_preflight.mjs`: key, quota, trần 30%, ≥ 24 giờ; exit 1 nếu một điều kiện sai.
  - `p2_0_fullrun.mjs`: không đổi.
  - `p2_0_compare.mjs`: so sánh từng topic × năm, các cấp domain/field/subfield, tỷ lệ topic thay đổi, phân vị biến động, topic có biến động đáng kể, nhất quán cây taxonomy của lần thứ hai.
  - Đã kiểm `p2_0_compare.mjs` bằng 2 phép thử công cụ (không phải dữ liệu quan sát): (a) so lần thứ nhất với chính nó → 0 thay đổi; (b) một bản sửa nhân tạo trong thư mục tạm → phát hiện đúng +100, −1, topic biến mất và lệch taxonomy 4.483.
- Chi tiết và quyết định: `P2_0_FINAL_GATE.md`.

## 14. Lần thu thập thứ hai và so sánh (2026-10-23)

**Trình tự** (từ commit `bd88032`, working tree sạch):
- Preflight lúc 2026-10-23T03:57:02Z: PASS (exit 0).
  - 25,72 giờ kể từ lần 1.
  - Key hoạt động; còn 9.239/10.000 credit.
  - Đã dùng hôm nay 761 + dự kiến 335 = 1.096 ≤ trần 3.000.
- Lần thu thập 2: `p2_0_fullrun.mjs`.
- So sánh: `p2_0_compare.mjs`.
- Kiểm tra tổng: 2 request `!null` / `null`.
- Ổn định analytics: tính lại bằng engine P1 không sửa, trên 2 snapshot, không gọi mạng.

**Bằng chứng mới** (bằng chứng lần 1 giữ nguyên):
- `evidence/p2_0_fullrun_snapshot_2026-10-23.json`
- `evidence/p2_0_compare_2026-10-23.json`
- `evidence/p2_0_analytics_stability_2026-10-23.json`

### 14.1 Chi phí lần 2
| | Request | Credit | USD | Thời gian | Trạng thái |
|---|---:|---:|---:|---|---|
| Lần thu thập 2 | 310 | 310 | 0,031 | 220,5 s (trung vị 628 ms) | 310 × 200 |
| Kiểm tra tổng `!null` / `null` | 2 | 2 | 0,0002 | — | 2 × 200 |
| Preflight (`/rate-limit`, ×2) | 2 | 0 | 0 | — | 200 |

- Đối soát quota: 761 → 1.071 credit trong lần thu thập, đúng 310.
- **761 credit đã được dùng trong ngày (từ 00:00 UTC) trước khi phiên này chạy bất kỳ request nào.** Đây là bằng chứng mạnh rằng key được một tiến trình khác dùng chung. Mức đó vẫn trong trần 30%, nhưng P2.1 phải đọc `credits_used` trước mỗi lần chạy (như preflight), không giả định cả quota dành cho trends.

### 14.2 Độ đầy đủ và nhất quán taxonomy (lần 2)
- Số nhóm topic mỗi năm **giống hệt** lần 1: 4.414, 4.414, 4.413, 4.413, 4.411, 4.413, 4.411, 4.415, 4.412, 4.412. 0 topic xuất hiện hoặc biến mất.
- 10/10 năm: Σ nhóm topic = `primary_topic.id:!null` và `unknown` = `primary_topic.id:null`, sai lệch 0 (đo độc lập lúc 04:02Z).
- 10/10 năm × 3 cấp: Σ domain / field / subfield = Σ topic; `unknown` bằng nhau ở cả 4 cấp. 0 lệch.
- Không có đơn vị domain/field/subfield mới hoặc mất.

### 14.3 Biến động theo năm (lần 1 → lần 2)
| Năm | Topic thay đổi | Tăng / giảm | Δ đã phân loại | Δ chưa phân loại | Σ\|Δ topic\| (% đã phân loại) |
|---|---:|---|---:|---:|---:|
| 2016 | 1.077 / 4.414 (24,4%) | 583 / 494 | +179 (+0,002%) | +21 | 1.437 (0,018%) |
| 2017 | 1.141 / 4.414 (25,9%) | 620 / 521 | +276 (+0,004%) | +141 | 1.706 (0,022%) |
| 2018 | 1.301 / 4.413 (29,5%) | 735 / 566 | +403 (+0,005%) | +119 | 1.913 (0,025%) |
| 2019 | 1.260 / 4.413 (28,6%) | 670 / 590 | +178 (+0,002%) | +56 | 1.694 (0,021%) |
| 2020 | 1.291 / 4.411 (29,3%) | 680 / 611 | +158 (+0,002%) | +94 | 1.800 (0,021%) |
| 2021 | 1.253 / 4.413 (28,4%) | 717 / 536 | +357 (+0,004%) | +26 | 1.781 (0,022%) |
| 2022 | 1.315 / 4.411 (29,8%) | 779 / 536 | +559 (+0,007%) | +84 | 1.883 (0,025%) |
| 2023 | 1.393 / 4.415 (31,6%) | 845 / 548 | +625 (+0,008%) | +81 | 2.037 (0,026%) |
| 2024 | 1.537 / 4.412 (34,8%) | 995 / 542 | +1.199 (+0,014%) | +30 | 2.507 (0,029%) |
| 2025 | 1.906 / 4.412 (43,2%) | 1.377 / 529 | +2.960 (+0,030%) | +97 | 4.542 (0,047%) |

- 13.474 ô topic × năm thay đổi. |Δ| tương đối: p50 0,060%, p90 0,20%, p99 0,62%, max 6,94%.
- **Khoảng 500–600 topic giảm số bài mỗi năm, kể cả năm cũ (2016):** OpenAlex có xóa, gộp hoặc phân loại lại công trình, chứ không chỉ thêm mới. Chuỗi năm không đơn điệu theo thời gian thu thập.
- **Biến động đáng kể** (|Δ| ≥ 20 và ≥ 2%, [QUY ƯỚC]): chỉ 2 ô. T12671 năm 2024: 1.336 → 1.396 (+60, +4,49%). T12375 năm 2024: 490 → 524 (+34, +6,94%).
- |Δ| tuyệt đối lớn nhất khác đều ở năm 2025 và < 0,6%, ví dụ T14309: 26.320 → 26.372 (+0,20%).
- Domain: thay đổi tối đa 0,058% (2025). Field: tối đa 0,066%. Subfield: tối đa 1,72% (đơn vị nhỏ).

### 14.4 Ảnh hưởng tới analytics P1
Engine P1 không sửa; baseline global (Σ topic đã phân loại); cửa sổ 2016–2025; BH trên 4.426 topic.

| Đo | Kết quả |
|---|---|
| Verdict lần 1 / lần 2 | rising 834 / 833; stable 1.646 / 1.649; declining 1.924 / 1.922; insufficient 22 / 22 |
| **Verdict đổi** | **7 / 4.426 (0,16%)**: declining→stable 4, stable→declining 2, rising→stable 1 |
| q của các topic đổi verdict | Mọi trường hợp nằm ở ngưỡng: q 0,0459 ↔ 0,0702 (α = 0,05) |
| Confidence đổi (cùng verdict) | 265 |
| Nhóm Nelis đổi | 5, đều do mean GGT nằm sát biên −5% (−4,99 ↔ −5,00) |
| \|Δ mean GGT\| (điểm %) | p50 0,004; p90 0,023; p99 0,10; max 11,1 |

- **7 verdict đổi chỉ có 2 cặp q.** p Mann–Kendall chính xác (n = 10) có nhiều giá trị trùng, nên một thay đổi nhỏ làm cả một khối topic có cùng p vượt qua α cùng lúc qua bước BH.
- Max \|Δ mean GGT\| 11,1 điểm: T12916 có 5, 6, 2, 1 bài rồi 1.683 bài, nên mean GGT ≈ 18.660%. +1 bài đổi mean 11 điểm (0,06% tương đối). Topic này không được xếp nhóm Nelis (< 50 bài/năm, GGT năm ≥ 100%).

### 14.5 Hệ quả cho P2.1 (ghi nhận, chưa triển khai)
- Snapshot phải ghi `fetchedAt`. Không coi một lần chạy là lịch sử cố định. Không giả định count chỉ tăng.
- Verdict sát ngưỡng có thể đổi qua ngày mà không có thay đổi khoa học. P2.2 nên hiển thị q, không trình bày việc đổi verdict ở ngưỡng như một xu hướng mới.
- Kiểm tra quota phải tính phần đã dùng bởi tiến trình khác (§14.1).

### 14.6 Quyết định cổng (cập nhật)
**READY FOR P2.1**, đề xuất, **chờ duyệt**. Xem `P2_0_FINAL_GATE.md`.
