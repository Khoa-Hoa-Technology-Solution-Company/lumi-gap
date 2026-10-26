# PHASE P2 — Discover Trends & Precomputed Ranking (báo cáo tổng hợp)

> Tổng hợp P2.0 (cổng kiểm chứng), P2.1 (worker và snapshot tính sẵn) và P2.2 (Discover API và Web), 2026-10-22 … 2026-10-23.
> Nhánh `feat/research-trends-p0`. Chi tiết trong `PHASE_P2_0_REPORT.md`, `P2_0_FINAL_GATE.md`, `PHASE_P2_1_REPORT.md`, `P2_1_FINAL_GATE.md` và `PHASE_P2_2_REPORT.md`.
> Bằng chứng: `evidence/`.

## 1. Kết quả theo giai đoạn

| Giai đoạn | Nội dung | Kết quả | Commit |
|---|---|---|---|
| **P2.0** | Kiểm chứng OpenAlex đọc-only: key, cursor, độ đầy đủ topic, đối soát đã/chưa phân loại, baseline, GGT trực tiếp, chi phí, ổn định qua 2 ngày | Mọi tiêu chí đã hiệu chỉnh PASS. Tiêu chí worker chuyển sang P2.1 (được duyệt). **READY FOR P2.1** | `bd88032`, `5c3788c` |
| **P2.1** | 6 bảng snapshot + migration viết tay (chỉ DB thử); collector có checkpoint, lease, ngân sách; validation bắt buộc; analytics P1 tính sẵn; kích hoạt nguyên tử | 21 test worker (5 nhóm acceptance chuyển từ P2.0 + 7 nhóm bổ sung) PASS. Một lần chạy thật (canary) 333 credit, validation 8/8, kích hoạt; kiểm chứng độc lập 17.704 dòng. **READY FOR P2.2** | `5be50d5`, `3a2b4e7` |
| **P2.2** | `GET /trends/discover` (Trending, Fastest Growing, By Field) chỉ đọc snapshot active; tab web "Discover trends", khối trang chủ, nhãn an toàn | 14 nhóm acceptance PASS; 36/36 kiểm tra trên snapshot thật; 0 hồi quy. **CONDITIONAL** | chưa commit |

## 2. Bằng chứng chính

**Độ đầy đủ và nhất quán OpenAlex (P2.0, 3 lần thu thập, 2026-10-22 và 2026-10-23):**
- 10/10 năm: Σ nhóm topic = `primary_topic.id:!null`; nhóm `unknown` = `primary_topic.id:null`; `meta.count` = Σ mọi nhóm (sai lệch 0).
- 4 cấp (topic, domain, field, subfield) cộng ra cùng tổng; cây danh mục (4.516 topic) gộp lên khớp từng domain, field và subfield (0 lệch).
- 4.411–4.415 nhóm topic có công trình mỗi năm. Phần chưa phân loại 1,73–3,14%/năm (scope mặc định).

**Chi phí và ngân sách:**
- Một lần thu thập đầy đủ = **333 credit** (10 năm × 4 cấp = 310 + danh mục 23), tức 3,3% quota ngày của free key.
- Đo 3 lần và đối soát `/rate-limit` khớp tuyệt đối. Lấy theo từng topic sẽ tốn ≈ 45%, vượt trần.
- Key **dùng chung** với một tiến trình khác chưa xác định: 761 credit/ngày trước mọi request của phiên này.

**Ổn định qua ngày:**
- 2026-10-22 → 2026-10-23: 24–43% topic đổi count mỗi năm, nhưng tổng ròng chỉ +0,002% … +0,030%.
- 494–611 topic **giảm** count mỗi năm, kể cả năm 2016: OpenAlex xóa, gộp hoặc phân loại lại.
- Engine P1 trên hai snapshot: 7/4.426 verdict đổi, tất cả ở ngưỡng (q 0,046 ↔ 0,070).

**Snapshot canary** (P2.1, `2ad0ad73…`, DB thử): 333 request = 333 credit, 8/8 validation, kích hoạt.
- Kiểm chứng độc lập bằng Python, toàn bộ 17.704 dòng (4.426 topic × 4 baseline): share, S, z, τ, Sen, GGT, nhóm ngưỡng 0 lệch; **verdict 0 lệch**.
- p và q lệch ≤ 2,4 × 10⁻⁷ và Sen CI ≤ 8,8 × 10⁻⁷ khoảng slope, đều từ xấp xỉ erf/quantile có sẵn của P1.

**Discover trên snapshot thật** (P2.2), field baseline:
- Trending 781 topic; Fastest Growing 743; 26 ngành.
- Phân trang không đổi thống kê ở cả 4 baseline; 30 topic là topic duy nhất của subfield bị loại khỏi xếp hạng và ghi "not assessable".

## 3. Kiến trúc kết quả

```
OpenAlex (group_by năm × cấp, cursor đủ trang, unknown)
   └─ worker:trends (P2.1)
        ├─ checkpoint mỗi trang (transaction), lease, ngân sách (30%/ngày, dự trữ 20%), 429 quota ≠ 429 tốc độ
        ├─ validation bắt buộc (8 kiểm tra)
        └─ analytics P1 không đổi (MK, Sen, BH theo họ đầy đủ, GGT) → kích hoạt nguyên tử (1 active/scope)
              └─ GET /trends/discover (P2.2): chỉ đọc snapshot active, provenance trên mọi item, không fallback local
                    ├─ tab web "Discover trends" (Trending / Fastest growing / By field)
                    └─ khối "Rising in research (OpenAlex)" trên trang chủ (ẩn khi không có snapshot)
```

## 4. Quyết định thiết kế đã duyệt

1. **P2.0 → P2.1:** tiêu chí "worker dừng sạch / tiến độ / chạy tiếp" chuyển sang P2.1, vì quy tắc §0.2 "acceptance độc lập".
2. **Provenance:** ở cấp snapshot và cấp trang; API gắn provenance của snapshot vào mọi kết quả. Đã làm ở P2.2.
3. **Nhãn Nelis:** khi `stabilityChecked = false`, không hiển thị nhãn không điều kiện ("Consistent growth"…). Đã làm ở P2.2: dải ngưỡng theo biên.
4. **Baseline không thông tin:** topic là topic duy nhất của quần thể tham chiếu → "Trend not assessable against this baseline", không xếp hạng. Đã làm ở P2.2; verdict cũ "stable" giữ nguyên trong API.

## 5. Giới hạn khoa học còn lại

1. **Mean ± SEM của GGT** chỉ tái tạo **4/12** giá trị in trong Nelis et al. (2022). Đây là [SUY LUẬN], hỗ trợ một phần.
2. **Tiêu chí ổn định "< 50% year-to-year variation"** của Nelis chưa được định nghĩa rõ, nên không áp dụng. Nhóm ngưỡng không phải kết luận "consistent".
3. **GGT chỉ mô tả**; verdict chỉ từ Mann–Kendall/Sen/BH trên share.
4. **Baseline khác nhau cho kết luận khác nhau** (ví dụ declining ↔ stable theo baseline); mọi kết quả phải ghi baseline và cửa sổ.
5. **Dữ liệu OpenAlex sống:** count lịch sử đổi hằng ngày, có xóa và gộp; topic được phân loại bằng mô hình. Snapshot là trạng thái API tại thời điểm thu thập, không phải lịch sử tái lập được.
6. **Verdict sát ngưỡng** có thể đổi giữa các lần làm mới, do p chính xác (n = 10) trùng nhau cho cả khối.
7. **Hiện tượng nền nhỏ:**
   - GGT rất lớn khi số bài ban đầu rất nhỏ; không bao giờ được xếp nhóm Nelis, không vào Fastest Growing.
   - Trending xếp theo thay đổi tương đối nên ưu tiên topic có share trung vị rất nhỏ (hạng 1 field: +247%/năm). **Chờ quyết định.**
8. **Xấp xỉ số của P1** (erf Abramowitz–Stegun, quantile chuẩn) gây sai lệch ≤ 2,4 × 10⁻⁷ ở p/q; không đổi verdict nào.

## 6. Việc chưa làm và điều kiện

- **Môi trường thật:** chưa áp dụng migration P2.1 lên DB dev/production, chưa deploy `worker:trends`, chưa có cron (`TRENDS_COLLECTION_CRON` không đặt). Cần duyệt riêng. Trước đó Discover hiển thị "not available".
- **Quy tắc xếp hạng Trending:** cần duyệt quy tắc hiện tại hoặc chọn phương án khác (Sen slope điểm %/năm, hoặc ngưỡng share tối thiểu).
- **E2E:** chưa có test Playwright cho Discover.
- **Thay đổi P2.2** chưa commit.
- **Mobile:** ngoài phạm vi suốt P2. Mọi lần kiểm tra (trước P1, sau P2.0, P2.1, canary và P2.2) cho manifest 235 file trùng từng byte. Nhãn tăng trưởng thô trên mobile (đã ghi từ P0) vẫn chưa sửa.

## 7. Quyết định tổng thể P2: **CONDITIONAL**

- P2.0 và P2.1 đạt (READY).
- P2.2 đạt mọi acceptance; điều kiện còn lại là §6: quy tắc xếp hạng Trending, và duyệt riêng việc đưa lên môi trường thật.
- Không bắt đầu P3/P4/P5. **Dừng, chờ review.**
