# P2.0 — Final Gate Review (Checkpoint 2)

> Lập 2026-10-22. **Cập nhật 2026-10-23** sau lần thu thập thứ hai.
> Nhánh `feat/research-trends-p0`. Commit nền: `bd88032` (P0 + P1 + P2.0 đến 2026-10-22). Cập nhật này chưa commit.
> Đọc kèm: `05_IMPLEMENTATION_PLAN.md` (hiệu chỉnh 2026-10-22), `PHASE_P2_0_REPORT.md` (§11–§14), `PHASE_P1_REPORT.md`.
> Không triển khai P2.1. Không tạo worker, migration hay bảng. Không ghi DB. Không sửa code ứng dụng. Không động tới mobile.

## Quyết định: **READY FOR P2.1** (đề xuất, chờ duyệt)

- Mọi tiêu chí P2.0 (bản kế hoạch đã hiệu chỉnh) đều **PASS** với bằng chứng số.
- Tiêu chí "worker dừng sạch / ghi tiến độ / chạy tiếp" đã được **chuyển hợp lệ** sang P2.1 (§5). Nó chưa chạy và không được đánh PASS.
- Đề xuất chuyển sang P2.1. **Không tự triển khai.**

Lịch sử: ngày 2026-10-22 quyết định là CONDITIONAL, vì preflight lúc 02:20Z từ chối lần thu thập thứ hai (mới 0,11 giờ, cần ≥ 24 giờ).

## 1. Kết quả so sánh hai lần thu thập

| | Lần 1 | Lần 2 |
|---|---|---|
| Thời điểm (UTC) | 2026-10-22 02:10:09 → 02:13:44 | 2026-10-23 03:57:10 → 04:00:50 |
| Cách nhau | — | **25,72 giờ** (bắt đầu lần 2 so với kết thúc lần 1) |
| File | `evidence/p2_0_fullrun_snapshot_2026-10-22.json` | `evidence/p2_0_fullrun_snapshot_2026-10-23.json` |
| Phạm vi | Scope mặc định (`type:article\|review\|preprint\|conference-paper\|book-chapter`), 2016–2025, topic + domain + field + subfield | giống hệt |
| Request / credit / thời gian | 310 / 310 / 214 s | 310 / 310 / 220,5 s |

**Preflight lần 2** (2026-10-23T03:57:02Z, `p2_0_preflight.mjs`, exit 0):

| Kiểm tra | Giá trị | Đạt |
|---|---|---|
| Key cấu hình, không in giá trị | có (22 ký tự) | ✓ |
| Key hoạt động (`/rate-limit`) | 200 | ✓ |
| ≥ 24 giờ kể từ lần 1 | 25,72 giờ | ✓ |
| Quota còn lại | 9.239 / 10.000 | ✓ |
| Chi phí dự kiến ≤ 30% quota ngày | 335 ≤ 3.000 | ✓ |
| Đã dùng hôm nay + chi phí ≤ 30% | 761 + 335 = 1.096 ≤ 3.000 | ✓ |

**Độ đầy đủ và nhất quán (lần 2):**
- Số nhóm topic mỗi năm giống hệt lần 1 (4.411–4.415). 0 topic xuất hiện hoặc biến mất.
- 10/10 năm: Σ topic = `!null`, `unknown` = `null` (đo độc lập, 2 request, sai lệch 0).
- 10/10 năm × 3 cấp: Σ domain / field / subfield = Σ topic, `unknown` bằng nhau. 0 lệch.
- Không có đơn vị mới hoặc mất ở các cấp.

**Biến động tổng:**
- Mỗi năm 24–43% topic có count khác, nhưng Δ ròng của tổng đã phân loại chỉ +0,002% … +0,030%. Chưa phân loại thay đổi +21 … +141.
- Năm càng gần càng biến động: 2025 có 43,2% topic thay đổi, +2.960 bài.

## 2. Thay đổi theo Topic / năm

Chi tiết từng năm: `PHASE_P2_0_REPORT.md` §14.3. Dữ liệu đầy đủ: `evidence/p2_0_compare_2026-10-23.json`.

| Đo | Kết quả |
|---|---|
| Ô topic × năm thay đổi | 13.474 |
| \|Δ\| tương đối của các ô thay đổi | p50 0,060%; p90 0,20%; p99 0,62%; max 6,94% |
| Topic giảm count (mỗi năm) | 494–611, **kể cả năm 2016**: OpenAlex xóa, gộp hoặc phân loại lại, không chỉ thêm |
| Biến động đáng kể (\|Δ\| ≥ 20 và ≥ 2%, [QUY ƯỚC]) | **2 ô**: T12671 (2024) 1.336 → 1.396 (+4,49%); T12375 (2024) 490 → 524 (+6,94%) |
| \|Δ\| tuyệt đối lớn nhất khác | Đều ở năm 2025 và < 0,6%; ví dụ T14309 26.320 → 26.372 |
| Domain / field / subfield | Thay đổi tối đa 0,058% / 0,066% / 1,72% |

**Ảnh hưởng tới analytics P1** (engine không sửa; baseline global; cửa sổ 2016–2025; BH trên 4.426 topic; `evidence/p2_0_analytics_stability_2026-10-23.json`):
- **Verdict đổi: 7 / 4.426 (0,16%).** Tất cả nằm ở ngưỡng α, với q 0,0459 ↔ 0,0702, và chỉ thuộc 2 cặp q.
  - Nguyên nhân: p Mann–Kendall chính xác (n = 10) có nhiều giá trị trùng, nên một khối topic có cùng p vượt qua ngưỡng cùng lúc ở bước BH.
- Confidence đổi (cùng verdict): 265. Nhóm Nelis đổi: 5, đều do mean GGT sát biên −5%.
- \|Δ mean GGT\|: p50 0,004 điểm %, p99 0,10, max 11,1.
  - Max đến từ T12916: chuỗi 5, 6, 2, 1, rồi 1.683 bài, mean ≈ 18.660%, là hiện tượng nền nhỏ. Topic không được xếp nhóm Nelis.

## 3. Tổng request và chi phí

| Ngày | Hoạt động | Request | Credit | USD |
|---|---|---:|---:|---:|
| 2026-10-22 | Probe | 188 | 186 | 0,0186 |
| 2026-10-22 | Engine P1 trên dữ liệu thật | không đếm riêng | ≈ 80 (gồm phần chưa giải thích được) | ≈ 0,008 |
| 2026-10-22 | Thu thập lần 1 | 310 | 310 | 0,031 |
| 2026-10-22 | `/rate-limit` + preflight | 5 | 0 | 0 |
| 2026-10-23 | Preflight ×2 | 2 | 0 | 0 |
| 2026-10-23 | Thu thập lần 2 | 310 | 310 (đối soát quota: 761 → 1.071) | 0,031 |
| 2026-10-23 | Kiểm tra tổng `!null` / `null` | 2 | 2 | 0,0002 |
| **Tổng P2.0** | | **≈ 817** | **≈ 888** | **≈ 0,089** |

- Mỗi lần thu thập đầy đủ = **3,1% quota ngày**, ổn định qua 2 ngày (310 = 310).
- **Usage không thuộc P2.0:** 20 credit trước probe (10-22), ≈ 60 credit trong lúc probe, và **761 credit ngày 10-23 trước khi phiên này gửi request nào**. Key gần như chắc chắn được dùng chung với một tiến trình khác. Chưa xác định tiến trình nào.

## 4. Nghiệm thu từng tiêu chí (bản kế hoạch đã hiệu chỉnh)

| Criterion | Status | Evidence | Remaining Risk |
|---|---|---|---|
| API key hoạt động: cursor trang 2 → 200 | PASS | `PHASE_P2_0_REPORT.md` §2; preflight 10-22 và 10-23 | Key dùng chung (§3) |
| Đủ topic (Σ nhóm = `!null`; unknown = `null`; ≤ 4.516) | PASS | 10/10 năm × 2 lần, sai lệch 0 | — |
| Không dùng `meta.count` làm tổng đã phân loại | PASS | §4 báo cáo P2.0 | — |
| Thứ tự trang theo key | PASS | §3 báo cáo P2.0 | Chỉ kiểm tại ranh giới trang |
| Ngân sách lần chạy đầy đủ ≤ 30% | PASS | 310 credit = 3,1%, đo 2 lần, đối soát quota | Chỉ đúng với `group_by` theo năm; phần quota của tiến trình khác |
| Bảo vệ ngân sách của OpenAlex client (thay tiêu chí worker) | PASS | Header thật đơn vị credit; 15/15 test client | 429 chỉ kiểm bằng giả lập |
| **Ổn định: 2 lần ≥ 1 ngày, báo khác biệt** | **PASS** | §1–§2: cách 25,72 giờ, khác biệt đã báo cáo theo topic, năm, cấp và analytics | Biến động nhỏ nhưng thường xuyên; verdict sát ngưỡng có thể đổi |
| Baseline nhất quán (bổ sung) | PASS | §6 báo cáo P2.0; lần 2: 0 lệch | — |
| GGT trực tiếp so với engine P1 (bổ sung) | PASS | §7 báo cáo P2.0: 16/16 khớp tuyệt đối | Kết quả phụ thuộc baseline |
| Worker dừng sạch / tiến độ / chạy tiếp | **CHUYỂN SANG P2.1** | §5 | Chưa kiểm, không đánh PASS |

## 5. Điều kiện đã chuyển hợp lệ sang P2.1

**Thay đổi** (yêu cầu trong chat 2026-10-22; đã ghi vào `05_IMPLEMENTATION_PLAN.md`, commit `bd88032`):
- P2.0 chỉ kiểm chứng API, quota, cursor, chi phí và cơ chế bảo vệ ngân sách của OpenAlex client.
- Tiêu chí worker trở thành acceptance **bắt buộc** của P2.1. P2.1 phải có integration test (DB/Redis cô lập, OpenAlex giả lập), chạy **trước** mọi lần worker gọi OpenAlex thật:
  1. Quota thấp giữa chừng → dừng sạch, lưu checkpoint.
  2. 429 hết ngân sách → không retry, chờ reset; 429 tốc độ → retry có backoff.
  3. Job bị ngắt → không có snapshot nửa vời được coi là hoàn chỉnh.
  4. Khôi phục checkpoint → kết quả giống hệt một lần chạy liền mạch.
  5. Idempotency.

**Lý do:** tiêu chí cũ đo một thành phần chỉ P2.1 mới được tạo, vi phạm quy tắc §0.2 của kế hoạch ("Acceptance criteria độc lập").

**Không có điều kiện nào khác được chuyển.**

**Ghi nhận thêm cho P2.1** (từ dữ liệu, chưa phải tiêu chí):
- (a) Kiểm tra quota phải dựa trên `credits_used` thật của key, vì key dùng chung.
- (b) Snapshot ghi `fetchedAt`; không giả định count chỉ tăng.
- (c) Lưu q và p cùng verdict để giải thích được việc đổi verdict ở ngưỡng.

## 6. Vấn đề khoa học chưa giải quyết

1. **GGT năm** khớp dữ liệu tác giả và tính độc lập trên dữ liệu thật. **[ĐÃ XÁC MINH]** Công thức không đổi trong P2.0.
2. **Mean ± SEM** chỉ tái tạo 4/12 giá trị in. **[SUY LUẬN, hỗ trợ một phần]**
3. **Tiêu chí ổn định 50% của Nelis** chưa xác minh, không áp dụng.
4. **GGT không thay Mann–Kendall.** Verdict chỉ từ MK/Sen/BH trên share.
5. **Xếp hạng theo mean GGT** ("Fastest Growing", P2.2) cần nhãn rõ và kiểm chứng thêm. Baseline đổi được mean GGT và verdict, nên mọi kết quả phải ghi **baseline và cửa sổ thời gian**. Mean GGT không có ý nghĩa với topic có nền gần 0 (T12916).
6. **Verdict sát ngưỡng không ổn định qua ngày** (7/4.426). Không được trình bày một lần đổi verdict ở ngưỡng như thay đổi khoa học. Nên cân nhắc cách hiển thị (q, ngày dữ liệu) ở P2.2.
7. **Nhãn "consistent_*" trên web — vẫn cần quyết định, chưa sửa.**
   - Từ P1, panel bằng chứng hiển thị nhóm Nelis ("Consistent growth"…), kèm ghi chú rằng quy tắc ổn định không được áp dụng.
   - Điều này mâu thuẫn với yêu cầu "không gắn nhãn 'consistent growth' khi chưa xác minh ổn định".
   - Đề xuất: trước P2.2, đổi thành "Nhóm theo ngưỡng Nelis (chưa kiểm tra ổn định)" hoặc ẩn nhóm. Không đổi công thức hay trường API.
8. Dữ liệu OpenAlex là API **sống**: phân loại bằng mô hình, có xóa và gộp (§2); không có snapshot lịch sử cố định.

## 7. Bảo toàn dữ liệu và mobile

- Bằng chứng gốc **giữ nguyên, không sửa:** `p2_0_openalex_2026-10-22.json`, `p2_0_fullrun_snapshot_2026-10-22.json`, các script `p2_0_fullrun.mjs`, `p2_0_preflight.mjs`, `p2_0_compare.mjs`.
- **Thêm:** `p2_0_fullrun_snapshot_2026-10-23.json`, `p2_0_compare_2026-10-23.json`, `p2_0_analytics_stability_2026-10-23.json`.
- Không có API key (kể cả dạng che một phần) trong `docs/research-trends/`.
- **Mobile:** `git status` của `apps/flutter_mobile`, `apps/mobile` rỗng; manifest sha256 235 file trùng từng byte với snapshot trước P1. Không chạy Flutter/Dart; không dùng lệnh git phá hủy.

## 8. Bước tiếp theo (cần người duyệt)

1. Duyệt quyết định **READY FOR P2.1**.
2. Quyết định về nhãn "consistent_*" trên web (§6.7) trước P2.2.
3. Commit cập nhật này (2 báo cáo + 3 file bằng chứng mới) khi được yêu cầu.
4. Chỉ bắt đầu P2.1 khi được duyệt bằng lời trong chat.
