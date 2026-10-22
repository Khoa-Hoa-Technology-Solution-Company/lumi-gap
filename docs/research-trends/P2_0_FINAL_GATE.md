# P2.0 — Final Gate Review (Checkpoint 2)

> Ngày: 2026-10-22 (kiểm tra lúc 02:18–02:25 UTC). Nhánh `feat/research-trends-p0` @ `5a9d228`, chưa commit.
> Đọc kèm: `05_IMPLEMENTATION_PLAN.md` (đã hiệu chỉnh 2026-10-22), `PHASE_P2_0_REPORT.md` (§11–§13), `PHASE_P1_REPORT.md`.
> Không triển khai P2.1. Không tạo worker, migration hay bảng. Không ghi DB. Không sửa code ứng dụng. Không động tới mobile.

## Quyết định: **CONDITIONAL**

Mọi tiêu chí P2.0 (đã hiệu chỉnh) đều PASS, **trừ một**: phép đo ổn định qua hai lần thu thập cách nhau ≥ 24 giờ. Tiêu chí này **PENDING**, vì lần thứ hai chưa được phép chạy.
- Sớm nhất: **2026-10-23T02:13:44Z**.
- Không chạy sớm, không tạo dữ liệu thay thế.

⇒ **Chưa đề xuất chuyển sang P2.1.** Khi lần thứ hai chạy xong và §1–§2 được điền bằng số liệu thật, cổng sẽ được đánh giá lại.

## 1. Kết quả so sánh hai lần thu thập — **PENDING**

| | Lần 1 | Lần 2 |
|---|---|---|
| Thời điểm | 2026-10-22 02:10:09Z → 02:13:44Z | **chưa chạy** |
| File | `evidence/p2_0_fullrun_snapshot_2026-10-22.json` | — |
| Phạm vi | Scope mặc định, 2016–2025, topic + domain + field + subfield | cùng phạm vi |

**Preflight lúc 2026-10-22T02:20:09Z** (`evidence/p2_0_preflight.mjs`, exit 1):

| Kiểm tra | Giá trị | Đạt |
|---|---|---|
| Key cấu hình, không in giá trị | có (22 ký tự) | ✓ |
| Key hoạt động (`/rate-limit`) | 200 | ✓ |
| Quota còn lại | 9.344 / 10.000 credit (đã dùng hôm nay 656) | ✓ |
| Chi phí dự kiến ≤ 30% quota ngày | 335 ≤ 3.000 | ✓ |
| Tổng hôm nay + chi phí ≤ 30% | 991 ≤ 3.000 | ✓ |
| **≥ 24 giờ kể từ lần 1** | **0,11 giờ** | **✗** |

Bằng chứng duy nhất về biến động qua ngày hiện có (đã báo cáo trong `PHASE_P2_0_REPORT.md` §9): **tổng theo năm** 2026-10-21 → 2026-10-22, chưa theo topic.
- Tổng tăng +69 … +2.080 mỗi năm.
- Số chưa phân loại thay đổi −26 … +23.
- Năm 2025 biến động nhiều nhất.

## 2. Thay đổi theo Topic / năm — **PENDING**

Chưa có dữ liệu lần 2. Khi có, `evidence/p2_0_compare.mjs` báo các mục sau. Ngưỡng "đáng kể" là **[QUY ƯỚC]** chỉ để báo cáo, không phải quyết định khoa học: |Δ| ≥ 20 bài **và** |Δ| ≥ 2% count lần 1, hoặc topic xuất hiện/biến mất trong năm.
- Theo từng năm:
  - tỷ lệ topic thay đổi (tăng/giảm, xuất hiện/biến mất);
  - Δ tổng đã phân loại và Δ `unknown`;
  - Σ|Δ| theo topic, tính theo % tổng đã phân loại.
- Phân vị biến động tương đối p50/p90/p99/max của các ô topic × năm; 15 ô thay đổi lớn nhất theo tuyệt đối và theo tương đối (với count ≥ 50).
- Danh sách topic có biến động đáng kể.
- Domain/field/subfield: số đơn vị thay đổi, |Δ| lớn nhất, đơn vị mới/mất.
- Nhất quán cây taxonomy trong lần 2: Σ mỗi cấp và `unknown` so với Σ topic.

**Kiểm thử công cụ** (không phải dữ liệu quan sát, không lưu vào `evidence/`):
- So lần 1 với chính nó → 0 thay đổi, 0 lệch taxonomy.
- Bản sửa nhân tạo trong thư mục tạm (+100 một topic và các cấp cha, −1 một topic năm 2025, xóa một topic năm 2024) → phát hiện đủ 3 thay đổi; topic bị xóa được đánh dấu "đáng kể" −100%; lệch taxonomy 4.483 ở cả 3 cấp.

## 3. Tổng request và chi phí (P2.0, 2026-10-22)

| Hoạt động | Request | Credit | USD |
|---|---:|---:|---:|
| Probe (xác thực, độ đầy đủ, baseline, danh mục topic, 4 topic) | 188 | 186 | 0,0186 |
| Engine P1 trên dữ liệu thật (16 tổ hợp, qua client app) | không đếm riêng | ≈ 80 (bao gồm cả phần chưa giải thích được, xem dưới) | ≈ 0,008 |
| Lần thu thập đầy đủ 1 | 310 | 310 (đối soát quota khớp) | 0,031 |
| `/rate-limit` (×4) | 4 | 0 | 0 |
| Final gate: preflight | 1 | 0 | 0 |
| **Tổng của key hôm nay** (theo `/rate-limit`) | | **656** | **0,0656** (6,6% quota) |

- 20 credit đã dùng trước P2.0, và ≈ 60 credit trong lúc probe chạy, không đến từ script P2.0. Có thể key dùng chung với tiến trình khác; **chưa xác nhận**.
- **Lần 2 dự kiến:** 310–335 credit (≈ 3,1–3,4%), dưới trần 30%.

## 4. Nghiệm thu từng tiêu chí (bản kế hoạch đã hiệu chỉnh)

| Criterion | Status | Evidence | Remaining Risk |
|---|---|---|---|
| API key hoạt động: cursor trang 2 → 200 | PASS | `PHASE_P2_0_REPORT.md` §2 | Usage chưa giải thích được trên key |
| Đủ topic (Σ nhóm = `!null`; unknown = `null`; ≤ 4.516) | PASS | §5: 10/10 năm, sai lệch 0 | — |
| Không dùng `meta.count` làm tổng đã phân loại | PASS | §4 | — |
| Thứ tự trang theo key | PASS | §3 | Chỉ kiểm tại ranh giới trang |
| Ngân sách lần chạy đầy đủ ≤ 30% | PASS | §8: 310 credit = 3,1%, đối soát quota | Chỉ đúng với thiết kế `group_by` theo năm |
| Bảo vệ ngân sách của OpenAlex client (thay tiêu chí worker) | PASS | Header thật đơn vị credit; 15/15 test client (dưới 20% dừng, 429 hết ngân sách không retry + khóa, 429 tốc độ retry, key chỉ ở header) | 429 chỉ kiểm bằng giả lập |
| Ổn định: 2 lần ≥ 24 giờ, báo khác biệt | **PENDING** | §1: preflight từ chối (0,11 giờ) | Chạy từ 2026-10-23T02:13:44Z |
| Baseline nhất quán (bổ sung) | PASS | `PHASE_P2_0_REPORT.md` §6 | — |
| GGT trực tiếp so với engine P1 (bổ sung) | PASS | `PHASE_P2_0_REPORT.md` §7: 16/16 khớp tuyệt đối | Kết quả phụ thuộc baseline |
| Worker dừng sạch / tiến độ / chạy tiếp | **CHUYỂN SANG P2.1** | §5 | Chưa kiểm, không đánh PASS |

## 5. Điều kiện đã chuyển hợp lệ sang P2.1

**Thay đổi** (được yêu cầu trong chat 2026-10-22, đã ghi vào `05_IMPLEMENTATION_PLAN.md`: ghi chú đầu file, bảng P2.0, mục P2.1):
- P2.0 chỉ kiểm chứng API, quota, cursor, chi phí và cơ chế bảo vệ ngân sách của OpenAlex client.
- Tiêu chí "giả lập `Remaining` thấp → worker dừng sạch, ghi tiến độ, chạy tiếp hôm sau" được **gỡ khỏi P2.0** và thành acceptance **bắt buộc** của P2.1.
- P2.1 phải có integration test (DB/Redis cô lập, OpenAlex giả lập), chạy **trước** mọi lần worker gọi OpenAlex thật:
  1. Quota thấp giữa chừng → dừng sạch, không ghi dở, lưu checkpoint.
  2. 429 hết ngân sách → dừng tới reset, không retry; 429 tốc độ → retry có backoff, không mất trang.
  3. Job bị ngắt giữa các trang cursor → không có snapshot nửa vời được coi là hoàn chỉnh.
  4. Khôi phục từ checkpoint ("hôm sau", quota mới) → không lấy lại phần đã xong; kết quả giống hệt một lần chạy liền mạch.
  5. Idempotency: chạy lại cùng job/ngày không tạo dòng trùng, không đổi kết quả.

**Lý do:**
- Tiêu chí cũ đo một thành phần chỉ được phép tạo ở P2.1. Ở P2.0 nó không bao giờ đạt được, vi phạm quy tắc §0.2 của kế hoạch ("Acceptance criteria độc lập… không có tiêu chí kiểu 'sẽ đúng sau khi P2 xong'").
- Phần kiểm được ở P2.0, tức cơ chế bảo vệ ngân sách của client, được giữ lại làm tiêu chí thay thế và đã PASS.
- Các test worker **chưa chạy và không được đánh PASS**.

**Không có điều kiện nào khác được chuyển.** Tiêu chí ổn định vẫn thuộc P2.0 và đang PENDING.

## 6. Vấn đề khoa học chưa giải quyết

1. **GGT năm** khớp dữ liệu bổ sung của tác giả và khớp tính độc lập trên dữ liệu thật. **[ĐÃ XÁC MINH]** Công thức không đổi trong P2.0 (`trend.ggt.ts` sửa lần cuối 2026-10-21T15:43Z, trong P1).
2. **Mean ± SEM** chỉ tái tạo 4/12 giá trị in. **[SUY LUẬN, hỗ trợ một phần]**
3. **Tiêu chí ổn định 50% của Nelis** chưa xác minh, không áp dụng.
4. **GGT không thay Mann–Kendall.** Verdict vẫn chỉ từ MK/Sen/BH trên share (`trend.verdict.ts`, `trend.statistics.ts` không đổi kể từ P0/P1).
5. **Xếp hạng theo mean GGT** ("Fastest Growing", P2.2) cần nhãn rõ và kiểm chứng thêm. Dữ liệu thật cho thấy baseline đổi được cả mean GGT (22,8–29,4% cho cùng một topic) lẫn verdict (declining ↔ stable). Mọi kết quả phải ghi **baseline và cửa sổ thời gian**.
6. **Xung đột với yêu cầu "không gắn nhãn 'consistent growth' khi chưa xác minh ổn định" — cần quyết định, chưa sửa:**
   - Từ P1, API trả `nelisClass` (ví dụ `consistent_growth`).
   - Panel bằng chứng trên web (`trend-evidence-panel.tsx`, mục GGT trong phần "Supplementary information") hiển thị nhãn "Consistent growth"…, kèm ghi chú "50% year-to-year stability rule … is not applied".
   - Đây là mã P1 có sẵn; P2.0 không sửa code ứng dụng.
   - **Đề xuất:** trước P2.2, đổi cách hiển thị thành "Nhóm theo ngưỡng Nelis (chưa kiểm tra ổn định)", hoặc ẩn nhóm. Giữ `nelisClass` trong API (chỉ thêm trường như `stabilityChecked`, đã có), không đổi công thức.
7. Dữ liệu OpenAlex là API **sống**: phân loại topic bằng mô hình có thể đổi khi chạy lại; năm gần nhất (2025) vẫn được bổ sung hằng ngày. Không có snapshot lịch sử cố định.

## 7. Bảo toàn dữ liệu và mobile

- Giữ nguyên mọi bằng chứng: `evidence/p2_0_openalex_2026-10-22.json`, `evidence/p2_0_fullrun_snapshot_2026-10-22.json`, `evidence/p2_0_fullrun.mjs`.
- Thêm `evidence/p2_0_preflight.mjs` và `evidence/p2_0_compare.mjs`: đọc-only, không ghi DB; compare không gọi mạng.
- 0 lần xuất hiện API key (kể cả dạng che một phần) trong `docs/research-trends/`.
- **Mobile:** `git status` của `apps/flutter_mobile`, `apps/mobile` rỗng; manifest sha256 235 file trùng từng byte với snapshot trước P1. Không chạy Flutter/Dart; không dùng lệnh git phá hủy.

## 8. Bước tiếp theo (cần người duyệt)

1. Từ **2026-10-23T02:13:44Z**, chạy từ `docs/research-trends/evidence/`:
   `node p2_0_preflight.mjs ../../../.env p2_0_fullrun_snapshot_2026-10-22.json`; chỉ khi exit 0 mới chạy tiếp.
   `node p2_0_fullrun.mjs ../../../.env p2_0_fullrun_snapshot_<ngày>.json`.
   `node p2_0_compare.mjs p2_0_fullrun_snapshot_2026-10-22.json p2_0_fullrun_snapshot_<ngày>.json p2_0_compare_<ngày>.json`.
   Sau đó điền §1–§2 và đánh giá lại cổng.
2. Quyết định về nhãn "consistent_*" trên web (§6.6) trước P2.2.
3. Không bắt đầu P2.1 cho tới khi cổng được đánh giá lại và được duyệt.
