# LumiGap — Quy Trình Sàng Lọc Độc Lập Hai Người (Team Screening Protocol)

Tài liệu kỹ thuật và hướng dẫn vận hành cho quy trình **Team Paper Screening (`TEAM_SCREENING`)** trên hệ thống LumiGap.

---

## 1. Mục Tiêu & Phạm Vi (Workflow Boundaries)

Quy trình **Team Screening** được thiết kế nhằm phục vụ các nhóm nghiên cứu học thuật cộng tác với nguyên tắc cốt lõi:
- **Đúng 2 Reviewer độc lập** đánh giá mỗi bài báo.
- **Đánh giá ẩn danh hai chiều (Blind Review):** Không ai thấy phiếu hoặc lý do của người kia trước khi cả hai hoàn tất phiếu ban đầu.
- **Đồng thuận nội bộ:** Khi có bất đồng hoặc cần làm rõ, chính 2 reviewer này sẽ trực tiếp trao đổi và đi đến quyết định chung.
- **Nghiêm cấm người phân xử bên thứ 3 (No Third-Party Adjudicator):** Không có reviewer thứ ba, không có vai trò trọng tài can thiệp vào kết luận khoa học của hai reviewer.
- **Một giai đoạn duy nhất:** Giao diện hiển thị rõ ràng nhãn **"Đánh giá mức độ phù hợp"** (không phân tách vòng 1 tóm tắt / vòng 2 toàn văn tự động như quy trình Systematic Review).
- **Trạng thái kết thúc không đồng thuận (`CLOSED_UNRESOLVED`):** Nếu hết thời hạn thảo luận (kể cả sau gia hạn tối đa) mà không đạt đồng thuận, bài báo được đóng lại với trạng thái `CLOSED_UNRESOLVED`. Trạng thái này không đồng nghĩa với việc bài báo bị loại vì lý do học thuật hay tiêu chí khoa học.

---

## 2. Ma Trận Đánh Giá Độc Lập Ban Đầu (Deterministic Matrix)

Mỗi reviewer đưa ra 1 trong 3 lựa chọn độc lập:
- `INCLUDE` (Phù hợp) — Bắt buộc có lý do/căn cứ.
- `EXCLUDE` (Không phù hợp) — Bắt buộc chọn tiêu chí loại và ghi nhận chứng cứ.
- `UNSURE` (Chưa chắc chắn) — Bắt buộc ghi rõ điểm cần làm rõ thêm.

| Reviewer 1 | Reviewer 2 | Kết quả hệ thống | Hành động tiếp theo |
|---|---|---|---|
| `INCLUDE` | `INCLUDE` | `INCLUDED` | Tự động hoàn tất và đưa vào tập phân tích |
| `EXCLUDE` | `EXCLUDE` | `EXCLUDED` | Tự động hoàn tất loại bài (yêu cầu căn cứ/tiêu chí hợp lệ) |
| `INCLUDE` | `EXCLUDE` | `NEEDS_RESOLUTION` | Mở giai đoạn thảo luận 48 giờ giữa 2 reviewer |
| `INCLUDE` | `UNSURE` | `NEEDS_MORE_INFO` | Mở giai đoạn thảo luận 48 giờ để làm rõ thông tin |
| `EXCLUDE` | `UNSURE` | `NEEDS_MORE_INFO` | Mở giai đoạn thảo luận 48 giờ để làm rõ thông tin |
| `UNSURE` | `UNSURE` | `NEEDS_MORE_INFO` | Mở giai đoạn thảo luận 48 giờ để làm rõ thông tin |

---

## 3. Cơ Chế Thống Nhất Quyết Định Chung (Consensus Mechanism)

Thay vì sửa đổi đè lên phiếu ban đầu để làm cho hai phiếu giống nhau, hệ thống bảo lưu nguyên vẹn hai phiếu độc lập gốc trong lịch sử (`revision`), và cung cấp quy trình quyết định chung:

1. **Đề xuất quyết định chung (Propose Joint Agreement):**
   - Một trong hai reviewer gửi đề xuất (`INCLUDED` hoặc `EXCLUDED`).
   - Cung cấp lý do thống nhất chung và tiêu chí/chứng cứ liên quan.
   - Người đề xuất xác nhận đồng thuận ngay khi gửi đề xuất.
2. **Reviewer còn lại xác nhận (Confirm Agreement):**
   - Reviewer thứ hai nhận thông báo và kiểm tra đề xuất.
   - Bấm **"Xác nhận quyết định chung"** để chính thức thông qua.
   - Hệ thống tạo bản ghi `ScreeningFinalDecision` với nguồn `CONSENSUS` và chuyển vòng đánh giá sang `INCLUDED` hoặc `EXCLUDED`.
3. **Từ chối đề xuất (Decline Agreement):**
   - Nếu chưa đồng ý, reviewer có thể từ chối và nêu rõ lý do cần thảo luận thêm.
   - Hệ thống giữ nguyên trạng thái thảo luận và cho phép tiếp tục trao đổi.

---

## 4. Chính Sách Thời Hạn & Gia Hạn (Deadline & Extension Policy)

Đồng hồ thảo luận bắt đầu được kích hoạt **ngay khi phiếu thứ hai được gửi và phát sinh bất đồng hoặc cần làm rõ**:
- **Thời hạn ban đầu (Initial Deadline):** **48 giờ**.
- **Chế độ quá hạn (Overdue):** Sau 48 giờ, hệ thống đánh dấu quá hạn, gửi cảnh báo cho hai reviewer và Chủ đề tài (Owner).
- **Gia hạn (Extension):**
  - Chỉ Chủ đề tài được quyền gia hạn thêm thời gian cho nhóm thảo luận.
  - Mỗi lần gia hạn tối đa **24 giờ**.
  - **Giới hạn nghiêm ngặt:** Tối đa **1 lần gia hạn** (Hard deadline tối đa là **72 giờ** tính từ khi bắt đầu thảo luận).
  - Không thể gia hạn lặp lại để kéo dài vô hạn.
- **Đóng sớm khi không thể đạt đồng thuận:** Sau khi kết thúc 48 giờ ban đầu hoặc khi quá hạn, Chủ đề tài có quyền đóng vòng đánh giá với trạng thái `CLOSED_UNRESOLVED`.

---

## 5. Trạng Thái Đóng Không Đồng Thuận (`CLOSED_UNRESOLVED`)

Khi hết thời hạn cứng (72 giờ) hoặc khi Chủ đề tài quyết định kết thúc thảo luận không thành công:
- Trạng thái vòng đánh giá: `CLOSED_UNRESOLVED`.
- Lưu trữ đầy đủ chi tiết:
  - Lý do đóng: `NO_CONSENSUS`, `DEADLINE_EXPIRED`, `NO_RESPONSE`, hoặc `INSUFFICIENT_INFORMATION`.
  - Ghi chú của Chủ đề tài (nếu có).
  - Thời điểm đóng và danh tính người thực hiện (hoặc Hệ thống tự động).
- **Bảo toàn dữ liệu khoa học:**
  - Hai phiếu đánh giá độc lập ban đầu được giữ nguyên vẹn.
  - Toàn bộ đoạn chat trao đổi được giữ nguyên vẹn ở chế độ chỉ đọc.
  - Bài báo **không** bị tính là bị loại vì tiêu chí (`EXCLUDED`).
  - Bài báo hiển thị huy hiệu: **"Đã đóng — Không đạt đồng thuận"**.
  - Trong Thư viện (Project Library), có bộ lọc riêng "Không đồng thuận" để nhóm tra cứu.

---

## 6. Mở Lại Đánh Giá Có Kiểm Soát (Controlled Reopening)

Khi có thông tin khoa học mới hoặc bài đính chính:
- Chỉ Chủ đề tài mới có quyền mở lại đánh giá cho bài báo `CLOSED_UNRESOLVED`.
- Bắt buộc phải nhập **Lý do mở lại (Justification)** tối thiểu 5 ký tự để lưu vào nhật ký kiểm toán (`ScreeningAudit`).
- Hệ thống vô hiệu hóa vòng đánh giá cũ và tạo ra một vòng đánh giá mới (Vòng N + 1) để hai reviewer nhận lượt và đánh giá lại độc lập từ đầu.
- Toàn bộ dữ liệu của vòng cũ vẫn được lưu trữ vĩnh viễn trong lịch sử để đối chiếu.
