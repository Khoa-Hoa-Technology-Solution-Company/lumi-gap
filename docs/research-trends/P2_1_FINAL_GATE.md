# P2.1 — Final Release Gate & Live Canary (Checkpoint 2)

> Ngày: 2026-10-23 (UTC 04:58–05:30). Nhánh `feat/research-trends-p0`.
> Một lần thu thập OpenAlex thật, được duyệt, vào DB thử cô lập.
> Không làm P2.2. Không deploy. Không động tới DB dev hay production. Không sửa mobile.

## Quyết định: **READY FOR P2.2** (đề xuất, chờ duyệt)

- Lần chạy thật duy nhất đã thu đủ dữ liệu, qua mọi kiểm tra bắt buộc và được kích hoạt.
- Analytics khớp một cài đặt độc lập trên toàn bộ 17.704 dòng. Các chênh lệch còn lại đều ≤ 2,4 × 10⁻⁷ và đã giải thích được (§7).
- 0 hồi quy.
- Hai quyết định thiết kế được duyệt đã ghi thành yêu cầu bắt buộc của P2.2 (§10).
- **Không tự bắt đầu P2.2.**

## 1. Git

| | |
|---|---|
| Nhánh | `feat/research-trends-p0` (không push, merge, rebase hay đổi nhánh) |
| Commit P2.1 | **`5be50d5`** feat(research-trends): P2.1 resumable OpenAlex snapshot worker and precomputed analytics. 20 file, gồm `PHASE_P2_1_REPORT.md` |
| Các commit trước | `5c3788c` (cổng P2.0), `bd88032` (P0 + P1 + P2.0) |
| Kiểm tra trước commit | 20 đường dẫn đều thuộc P2.1. 0 file mobile, 0 `.env`. Key và dạng che của key: 0 lần trong diff đã stage. Các giá trị khớp `.env` trong `env.ts` đều là mặc định có từ HEAD |
| Chưa commit (cổng này) | `P2_1_FINAL_GATE.md`, `evidence/p2_1_live_canary_2026-10-23.json`, `evidence/p2_1_verify_live.py`, mục P2.2 của `05_IMPLEMENTATION_PLAN.md`, đính chính `PHASE_P2_1_REPORT.md` (8 kiểm tra, không phải 9) |

## 2. An toàn môi trường và DB (preflight, 2026-10-23T05:04–05:08Z)

| Kiểm tra | Kết quả |
|---|---|
| PostgreSQL thử cô lập | Container `lumigap-p1-verify-pg`, chỉ nghe `127.0.0.1:55434`, DB `lumigap_p1_test` |
| Redis thử cô lập | `lumigap-p1-verify-redis`, `127.0.0.1:56380`, DB 12 (queue của canary) |
| `DATABASE_URL` thực tế | Đọc qua chính `config/env.ts` của app: host `localhost`, port `55434`, DB `lumigap_p1_test`, user `p1test`. dotenv không ghi đè biến đã đặt; `prisma7.config.ts` dùng `process.env.DATABASE_URL` |
| DB dev / production | **Không kết nối.** Container dev `lumi-gap-postgres-1` (5433) và `lumi-gap-redis-1` (6379) đang chạy do Docker Desktop tự khởi động lại; phiên này không truy cập chúng |
| Migration trên DB thử | 94/94 hoàn tất, mới nhất `20261023000100_trend_snapshots` |
| Suite worker trước khi chạy thật | 41/41 PASS (integration 21, budget 3, analytics 6, client 11); `trend_snapshots` = 0 sau suite |
| Key OpenAlex | Có (22 ký tự), không in. `/rate-limit` trả 200, nên key hợp lệ. Không có dấu hiệu bị lộ: key chưa từng in ra hay ghi vào file, log hay commit |
| Quota trước khi chạy | Đã dùng 1.073 / 10.000, còn 8.927. 1.073 = 761 của tiến trình khác trước 03:57Z + 312 của cổng P2.0 sáng nay |
| Trần 30% và dự trữ 20% | Trần 3.000; dự trữ 2.000. Lần chạy được tiêu 3.000 (trần là giới hạn ràng buộc); dự kiến 335. Hôm nay + dự kiến = 14,1% quota |
| Cron | Không đặt (`TRENDS_COLLECTION_CRON = null`), nên worker không tự lên lịch |

## 3. Request OpenAlex thật và credit

- **Cách chạy:** tiến trình `worker:trends` thật (`tsx src/workers/trends.worker.ts`) với env của DB và Redis thử.
  - Đúng **1 job**: `p2.1-live-canary-2026-10-23`, `attempts: 1` để BullMQ không tự retry.
  - Sau khi job xong, worker được dừng: 3 tiến trình của phiên này, kiểm theo command line.

| Đo | Giá trị |
|---|---|
| Job enqueue → kết quả | 05:08:13.8Z → 05:12:37.6Z (`activated`) |
| Thu thập | 05:08:14.442Z → 05:12:26.801Z (4 phút 12 giây) |
| Request (worker ghi) | **333** |
| Credit (header `x-ratelimit-credits-used` từng trang) | **333**; mọi trang = 1 credit |
| Đối soát `/rate-limit` | 1.073 → 1.406 = **+333** (khớp tuyệt đối; không có usage lạ trong lúc chạy) |
| 429 / lỗi / tạm dừng / retry | 0 / 0 / 0 / 0 |
| Dự kiến P2.0 | 333–335, thực tế 333 |

Chi phí theo đơn vị: danh mục 23 trang (4.516 topic); topic 240 (24/năm, gồm trang rỗng cuối); domain 20; field 20; subfield 30.

## 4. Danh tính và trạng thái snapshot

| Trường | Giá trị |
|---|---|
| `id` | `2ad0ad73-87a8-400c-95e1-7f600b79033b` |
| `snapshot_key` | `32ee1510d3189c97:2016-2025:p2.1-collect-v1:2026-10-23` |
| Scope | `type:article\|review\|preprint\|conference-paper\|book-chapter`, `corpus = core` |
| Cửa sổ | 2016–2025 (`last_complete_year = 2025`) |
| Phiên bản | `collection_version = p2.1-collect-v1`, `analytics_version = p2.1-analytics-v1` |
| Trạng thái | `collecting` → `validated` (05:12:27.657Z) → **`active`** (05:12:37.586Z), `is_active = true` |
| Lease | Đã nhả (`null`) |
| Số snapshot active của scope | **1** (index unique một phần trong DB bảo đảm) |
| Snapshot dở dang được coi là hoàn chỉnh | Không có; đây là snapshot duy nhất của DB |
| Provenance | `first_fetched_at` 05:08:14.442Z, `last_fetched_at` 05:12:26.801Z; mỗi trang có `fetched_at` |

## 5. Topic, count theo năm và đối soát taxonomy

| Năm | Đã phân loại | Chưa phân loại (`unknown`) | Topic có công trình |
|---|---:|---:|---:|
| 2016 | 8.018.439 | 259.705 | 4.414 |
| 2017 | 7.814.425 | 216.198 | 4.414 |
| 2018 | 7.811.997 | 228.613 | 4.413 |
| 2019 | 8.117.915 | 213.968 | 4.413 |
| 2020 | 8.464.609 | 228.798 | 4.411 |
| 2021 | 7.985.471 | 185.928 | 4.413 |
| 2022 | 7.505.977 | 233.883 | 4.411 |
| 2023 | 7.916.246 | 234.078 | 4.415 |
| 2024 | 8.543.158 | 196.406 | 4.412 |
| 2025 | 9.745.828 | 171.259 | 4.412 |

- **Danh mục:** 4.516 topic. 4.426 topic có ít nhất một công trình trong cửa sổ, mọi topic được đếm đều có trong danh mục.
- **Đơn vị:** 5 domain-group/năm (4 + unknown), 27 field-group (26 + unknown), 253 subfield-group (252 + unknown).
- **Đối soát:**
  - Σ topic = Σ domain = Σ field = Σ subfield mỗi năm.
  - `unknown` bằng nhau ở 4 cấp.
  - Σ nhóm (kể cả unknown) = `meta.count` của từng đơn vị.
  - Tổng theo cây danh mục = count từng domain/field/subfield.
  - Tất cả sai lệch 0 (§6).

## 6. Kết quả validation (`trend_snapshots.validation`)

| Kiểm tra | Kết quả | Vấn đề |
|---|---|---|
| `all_years_and_levels_present` | PASS | 0 |
| `cursor_pages_complete` | PASS | 0 (41/41 đơn vị hoàn tất, trang cuối không còn cursor, chuỗi cursor liền) |
| `groups_reconcile_with_meta_count` | PASS | 0 |
| `classified_unclassified_reconcile` | PASS | 0 |
| `topics_in_catalogue` | PASS | 0 |
| `taxonomy_levels_reconcile` | PASS | 0 |
| `no_duplicate_unit_year_rows` | PASS | 0 |
| `baseline_data_present` | PASS | 0 |

Không quy tắc nào bị nới lỏng. Code validation giữ nguyên như commit `5be50d5`.

## 7. Analytics thống kê

**Kiểm chứng độc lập** (`evidence/p2_1_verify_live.py`):
- Cài đặt Python riêng, không dùng code của app, chỉ dựa trên định nghĩa gốc (Mann 1945, Kendall 1975, Sen 1968, Benjamini–Hochberg 1995, Nelis 2022 Eq (i)) và quy tắc verdict đã công bố.
- Tính lại từ count thô đã lưu cho **mọi** topic × baseline, rồi so với dòng đã lưu.

| Đo | Kết quả |
|---|---|
| Dòng kết quả | 17.704 = 4.426 topic × 4 baseline (global, domain, field, subfield); 0 dòng thiếu, 0 dòng thừa |
| Share (n, N, %) | 0 lệch |
| MK S, z, τ, phương pháp p | 0 lệch. p chính xác 17.593 dòng; xấp xỉ chuẩn 81 dòng (chuỗi có giá trị trùng) |
| MK p (chính xác) | 0 lệch |
| MK p (xấp xỉ chuẩn, 81 dòng) | ≤ **1,4 × 10⁻⁷**: P1 dùng xấp xỉ erf Abramowitz–Stegun 7.1.26 (sai số ≤ 1,5 × 10⁻⁷); bộ kiểm dùng `erfc` chính xác |
| BH q và kích thước họ | Kích thước họ 0 lệch; q lệch ≤ **2,4 × 10⁻⁷** ở 65 dòng, cùng nguyên nhân |
| Sen slope, thay đổi tương đối | 0 lệch |
| Sen CI95 | 0 lệch khi dùng cùng z của P1 (1,9599628 từ `normalQuantile`); so với z chính xác (1,9599640) lệch ≤ **8,8 × 10⁻⁷ khoảng slope**. App tính lại cho đúng giá trị đã lưu |
| Verdict và confidence | **0 lệch** (các chênh lệch trên không đổi verdict nào) |
| GGT năm, mean, SEM, số năm | 0 lệch |
| Điều kiện Nelis, nhóm ngưỡng | 0 lệch; `stability_checked = false` ở mọi dòng |

**Họ BH:**
- global: 1 họ gồm 4.426 topic;
- domain: 4 họ (610, 842, 1.435 và 1.539 topic; tổng 4.426);
- field: 26 họ (11 … 726 topic);
- subfield: 252 họ (0 … 213 topic). 30 họ có kích thước 0, chính là 30 subfield chỉ có một topic, nên không có p-value (§7 dưới).

**Verdict theo baseline:**

| Baseline | rising | stable | declining | insufficient |
|---|---:|---:|---:|---:|
| global | 833 | 1.649 | 1.922 | 22 |
| domain | 801 | 1.633 | 1.970 | 22 |
| field | 781 | 1.812 | 1.811 | 22 |
| subfield | 823 | 1.890 | 1.691 | 22 |

- 22 topic `insufficient` (`TOO_FEW_PAPERS`, < 30 bài) ở mọi baseline. Baseline khác nhau cho phân bố verdict khác nhau, đúng như rủi ro đã biết.
- **Thống kê thiếu hoặc không xác định** (đúng theo định nghĩa, không phải lỗi):
  - 30 dòng không có MK, tất cả ở baseline subfield: đó là topic **duy nhất** của subfield (30 subfield trong danh mục), share = 100% mọi năm nên phương sai = 0, q null, verdict "stable". P2.2 không nên trình bày là "ổn định" (§10).
  - 8 dòng không có mean GGT: T13311, T14286, chỉ có công trình ở năm 2025.
- **GGT lớn từ nền nhỏ:** 26 topic có mean GGT > 100% (baseline global), ví dụ T12916 ≈ 18.672%, năm thấp nhất 1 bài. **Không topic nào** trong số đó có nhóm Nelis (cần ≥ 50 bài mỗi năm và mọi GGT năm < 100%).
- **Nhóm ngưỡng Nelis (baseline field):** 4.191/4.426 topic đủ điều kiện. Đây vẫn là nhóm theo ngưỡng, **chưa kiểm tra ổn định**, không phải kết luận "consistent".
- **Provenance:** `fetchedAt` (snapshot: 05:08:14Z–05:12:27Z; từng trang), `collection_version = p2.1-collect-v1`, `analytics_version = p2.1-analytics-v1`, nguồn OpenAlex `api.openalex.org` với `corpus = core`.
- Đây là dữ liệu API sống tại thời điểm trên, **không** phải snapshot lịch sử tái lập được.

## 8. So với bằng chứng P2.0

| So sánh | Kết quả |
|---|---|
| Lần thu thập P2.0 ngày 2026-10-23 03:57–04:00Z (~70 phút trước) | **0 khác biệt** ở 44.138 ô topic × năm, 50 ô domain, 270 ô field, 2.530 ô subfield; tổng và `unknown` từng năm giống hệt; số topic mỗi năm giống hệt. OpenAlex không cập nhật giữa hai lần |
| Lần thu thập P2.0 ngày 2026-10-22 | Khác biệt bằng chính khác biệt P2.0 đã báo cáo (`PHASE_P2_0_REPORT.md` §14): 24–43% topic đổi count mỗi năm; tổng ròng +0,002% … +0,030% |
| Chi phí | P2.0 đo 310 (không danh mục) + 23 danh mục = 333; P2.1 thực tế 333 |
| Analytics so với tính lại P2.0 (baseline global, 10-23) | Cùng dữ liệu, nên cùng verdict: rising 833, stable 1.649, declining 1.922, insufficient 22 |

## 9. Test và hồi quy

| Gate | Kết quả |
|---|---|
| Suite worker + snapshot + client (trước khi chạy thật) | 41/41 PASS |
| Backend vitest đầy đủ (DB thử thứ hai `lumigap_p21_test`, 94 migration, `TRENDS_INTEGRATION=1`) | **1.521 pass / 0 fail / 399 skip** (bằng P2.1 trước canary) |
| Integration theo cờ (7 file, `--maxWorkers=1`) | 152 pass / 1 skip (bằng P1 / P2.1) |
| Typecheck backend | PASS |
| Lint backend | 0 error, 5 warning, đều có từ trước |
| Build backend | PASS |
| Validation snapshot thật | 8/8 PASS (§6) |

- Suite chạy trên **DB thứ hai** vì test worker xóa `trend_snapshots` giữa các test; cách này giữ nguyên snapshot canary làm bằng chứng.
- Sau đó snapshot canary vẫn là snapshot active duy nhất trong `lumigap_p1_test`.

## 10. Quyết định thiết kế được duyệt (đã ghi vào `05_IMPLEMENTATION_PLAN.md` §P2.2)

1. **Provenance:** chấp nhận lưu ở cấp snapshot và cấp trang; không thêm cột lặp. **Bắt buộc ở P2.2:** API gắn provenance của snapshot với mọi kết quả trả về.
2. **Nhãn Nelis:** khi `stabilityChecked = false`, web **không** hiển thị nhãn không điều kiện như "Consistent growth". Dữ liệu API và công thức GGT giữ nguyên. **Bắt buộc ở P2.2.**
3. *Đề xuất, chưa duyệt:* đánh dấu "baseline không thông tin" cho topic là topic duy nhất của subfield (30 trường hợp), thay vì "stable".

## 11. Rủi ro còn lại

1. **Mới có một lần chạy thật.** Tiếp tục lại sau gián đoạn, tạm dừng vì ngân sách và 429 mới được kiểm chứng trên mock, chưa xảy ra trên API thật.
2. **Key dùng chung:** 761 credit/ngày do tiến trình khác chưa xác định. Ngân sách đọc usage thật trước mỗi lần chạy và theo header từng trang.
3. **Xấp xỉ số của P1** (erf, quantile chuẩn): sai số ≤ 2,4 × 10⁻⁷ ở p/q, không đổi verdict nào. Ghi nhận, không sửa công thức.
4. **Trần 30%** đếm credit của các lần chạy worker (`trend_snapshot_pages`). Các script đọc-only của P2.0 (312 credit hôm nay) không nằm trong bảng đó. Nếu tính cả, hôm nay vẫn chỉ 645/3.000.
5. **Dữ liệu sống:** count đổi hằng ngày; verdict sát ngưỡng có thể đổi (P2.0: 7/4.426).
6. **Baseline khác nhau cho kết luận khác nhau** (§7). P2.2 phải luôn ghi baseline và cửa sổ.
7. **Giới hạn khoa học giữ nguyên:** mean ± SEM chỉ tái tạo 4/12 giá trị Nelis; quy tắc ổn định 50% chưa xác minh; GGT không thay MK/Sen/BH.
8. **Migration chỉ có trên DB thử.** Áp dụng lên DB dev/production và deploy worker cần duyệt riêng (ngoài phạm vi).
9. Container dev tự chạy lại khi Docker Desktop khởi động. Không bị phiên này động tới, nhưng chủ máy nên biết.

## 12. Mobile

- sha256 của 235 file `apps/mobile` + `apps/flutter_mobile` trước P2.1 và sau cổng này: **trùng từng byte**. `git status` của 2 thư mục: rỗng.
- Không chạy Flutter/Dart. Không dùng lệnh git phá hủy.

## 13. Khuyến nghị cuối: **READY FOR P2.2**

Đề xuất chuyển sang P2.2 với các yêu cầu bắt buộc ở §10 (1, 2). Cần quyết định đề xuất §10.3 trước hoặc trong P2.2.

**Dừng. Không bắt đầu P2.2. Chờ review.**
