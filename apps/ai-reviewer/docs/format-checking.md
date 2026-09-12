# Kiểm tra định dạng bài báo

Liêm Research Paper có hai luồng trên cùng một bài PDF:

| Luồng | Cấu hình | Cách chạy | Chi phí |
| --- | --- | --- | --- |
| Review nội dung khoa học | Menu Loại review, hướng dẫn Markdown | Chọn loại review, strictness, Gemini key | Theo giá review hiện tại |
| Kiểm tra định dạng | Chuẩn định dạng → cấu hình / template | Chọn chuẩn → Kiểm tra định dạng | Không trừ credit, không gọi Gemini |

Kết quả định dạng được lưu riêng, không thay đổi điểm khoa học, recommendation hoặc trạng thái review nội dung. Hỗ trợ bản thảo PDF; Word/LaTeX dùng làm **template tham chiếu**, bản thảo vẫn cần xuất PDF rồi tải vào thư viện.

## Các cấu hình có sẵn

Lần khởi động sau cập nhật tạo ba cấu hình và không ghi đè cấu hình đã chỉnh:

| Cấu hình | Quy tắc khởi đầu | Cần tùy chỉnh |
| --- | --- | --- |
| IEEE Conference · A4 | 210 × 297 mm, chữ phổ biến 10 pt, ước lượng 2 cột; tìm Abstract, References | Giới hạn trang, lề, font, yêu cầu của hội nghị |
| IEEE Conference · US Letter | 215,9 × 279,4 mm, chữ phổ biến 10 pt, ước lượng 2 cột | Giới hạn trang, lề, yêu cầu của hội nghị |
| Springer · LNCS | Chữ phổ biến 10 pt, ước lượng 1 cột; tìm Abstract, References | Khổ giấy/vùng in/font theo template Word hoặc LaTeX của proceedings |

Đây là **cấu hình kiểm tra khởi đầu**, không phải một chuẩn duy nhất cho mọi ấn phẩm IEEE hoặc Springer. Các giá trị font và cột là phép kiểm tra hỗ trợ, chưa chứng nhận đúng template. Không tự đặt số trang tối đa vì mỗi nơi nộp có yêu cầu riêng. Các profile có liên kết tới [IEEE Author Center — templates](https://conferences.ieeeauthorcenter.ieee.org/write-your-paper/authoring-tools-and-templates/) và [Springer LNCS — instructions and templates](https://link.springer.com/series/558/information-for-authors-and-editors); tải gói Word/LaTeX chính thức từ các trang này khi soạn bản thảo. Liêm Research Paper không đóng gói lại file template có bản quyền của nhà xuất bản.

## Quản trị viên: tạo, nhập và quản lý

1. Đăng nhập admin, mở **Template định dạng** trong nhóm cấu hình ở thanh điều hướng. **Chuẩn định dạng** là trang tra cứu mẫu dành cho người dùng.
2. Chọn **Quản lý** ở một cấu hình có sẵn, **Nhân bản** để tạo biến thể riêng, hoặc **Tạo chuẩn**.
3. Nhập tên có ý nghĩa, ví dụ `ABC 2027 — Full paper — IEEE A4`; thêm URL hướng dẫn và mô tả phạm vi áp dụng.
4. Chỉnh quy tắc trong biểu mẫu. Để trống các trường không cần kiểm tra. Có thể khai báo nhiều khổ giấy được chấp nhận, mỗi dòng `rộng x cao` tính bằng mm.
5. Chọn **Bật chuẩn này cho người dùng**, rồi lưu. Mỗi lần sửa tăng phiên bản; nếu người khác đã sửa trước, biểu mẫu yêu cầu tải lại để tránh ghi đè.
6. Bỏ chọn “Bật” để ngừng nhận kiểm tra mới. Kết quả cũ và kiểm tra đã nhận vẫn giữ quy tắc chụp tại thời điểm bắt đầu.

### Nhập template

Trong **Nạp template**, chọn file tối đa **10 MB** và bấm **Nạp & tạo bản nháp**. Sau khi nhập, kiểm tra biểu mẫu, bổ sung những trường chưa suy ra được, rồi bật và lưu.

| File | Hệ thống đọc | Giới hạn cần biết |
| --- | --- | --- |
| `.pdf` | Khổ các trang và cỡ chữ phổ biến | Không lấy số trang của ví dụ làm giới hạn; không suy ra lề nguồn, caption hoặc yêu cầu bắt buộc |
| `.docx` | Khổ trang và số cột của section đầu; cỡ chữ `Normal` hoặc default nếu có | Section khác và kiểu chữ kế thừa cần đối chiếu; không chạy macro; `.doc` cần lưu thành `.docx` |
| `.tex` UTF-8 | `documentclass`, các tùy chọn `a4paper`, `letterpaper`, `10pt/11pt/12pt`, `onecolumn/twocolumn`, khai báo trực tiếp `paperwidth` + `paperheight` | Không biên dịch, không đọc `input/include`, không thực thi shell, không giải quyết macro hoặc class/style ngoài |
| `.json` | Bộ quy tắc đã xuất hoặc tự viết đúng schema | Từ chối trường lạ, giá trị ngoài giới hạn và cấu hình rỗng |

LaTeX chỉ có `\documentclass{llncs}` hoặc class tùy chỉnh có thể không suy ra kích thước/font. Khi đó, bản nháp có checklist yêu cầu đối chiếu. Điền thông số từ gói template, hoặc biên dịch ở máy của bạn rồi nạp PDF thành một chuẩn mới. Gói ZIP/`.cls`/`.sty` và Word `.docm` chưa được hỗ trợ.

File gốc được lưu trong SQLite cùng tên và SHA-256; admin có thể tải lại. Muốn thay file tham chiếu, nhập thành chuẩn mới rồi tắt chuẩn cũ. **Nhân bản** sao chép các quy tắc và nguồn hướng dẫn, không sao chép file đính kèm. **Xuất quy tắc JSON** dùng để chuyển cấu hình giữa môi trường.

### Ý nghĩa quy tắc

- **Khổ giấy:** so sánh kích thước PDF theo từng trang, có dung sai mm. Trang xoay cũng được kiểm tra theo chiều rộng/cao thực tế.
- **Số trang tối đa:** tính tất cả trang trong PDF, gồm tài liệu tham khảo và phụ lục.
- **Cỡ chữ / tên font:** thống kê ký tự để nhận diện font phổ biến. Không khẳng định đó luôn là font thân bài. Trang quá ít chữ hoặc font phân tán được ghi chưa đánh giá.
- **Lề văn bản tối thiểu:** đo ký tự gần mép nhất, gồm header/footer. Không bao gồm hình, không dùng để suy ra lề trong file Word/LaTeX; sai lệch được ghi cần đối chiếu.
- **Số cột:** ước lượng từ khoảng trắng ở giữa trang. Hình/bảng có thể ảnh hưởng, nên kết quả luôn cần kiểm tra bằng mắt.
- **Mục bắt buộc:** tìm tên trong văn bản, chưa xác minh đó là heading hay nội dung tương ứng.
- **Checklist:** ghi yêu cầu bổ sung để người dùng kiểm tra thủ công; không tự coi là đã đạt.

Ví dụ JSON có thể nhập:

```json
{
  "page_sizes": [{"width_mm": 210, "height_mm": 297}],
  "tolerance_mm": 2,
  "max_pages": 8,
  "body_font_pt": 10,
  "font_tolerance_pt": 0.5,
  "columns": 2,
  "required_sections": ["Abstract", "References"],
  "manual_checks": ["Kiểm tra vị trí caption theo hướng dẫn ABC 2027."]
}
```

Giới hạn 8 trang ở ví dụ là cấu hình minh họa của nơi nộp, không phải quy định chung của IEEE.

## Người dùng: kiểm tra bài

1. Upload PDF trong **Bài báo**, hoặc mở bài đã có.
2. Trong **Kiểm tra định dạng**, chọn chuẩn và phiên bản đang bật.
3. Bấm **Kiểm tra định dạng**. Không cần Gemini key hoặc credit. Nếu CAPTCHA đang bật, hoàn tất xác minh.
4. Khi hoàn tất, bấm **Xem kết quả** trong lịch sử định dạng. Lọc mục cần xử lý hoặc xem tất cả.
5. Đối chiếu số đo, yêu cầu, vị trí trang và cách sửa. Tải **Markdown** để đọc/chia sẻ hoặc **JSON** để giữ toàn bộ dữ liệu, snapshot quy tắc và checksum PDF.
6. Xuất lại PDF đã sửa, upload bản mới và kiểm tra lại.

| Trạng thái | Ý nghĩa |
| --- | --- |
| Đạt phép kiểm tra | Số đo đáp ứng đúng phép kiểm tra đã cấu hình |
| Sai quy tắc | Sai khổ giấy hoặc vượt số trang đã cấu hình |
| Cần đối chiếu | Bằng chứng hỗ trợ cần kiểm tra trực quan, ví dụ font/cột/lề |
| Chưa đánh giá | Thiếu lớp chữ, chưa tìm được mục hoặc thuộc checklist thủ công |

Tổng kết **Các phép kiểm tra đều đạt** chỉ áp dụng cho tập quy tắc được bật. Báo cáo không cấp chứng nhận chấp nhận của nhà xuất bản. Chưa kiểm tra font nhúng, giãn dòng, độ phân giải ảnh, ngữ nghĩa caption/trích dẫn, PDF eXpress hoặc nguồn LaTeX/DOCX. Chưa hỗ trợ OCR.

## Lưu trữ, quyền và vận hành

- Admin quản lý chuẩn toàn hệ thống; user chỉ xem các chuẩn đang bật.
- Kết quả chỉ chủ bài xem/tải được; admin không tự có quyền đọc kết quả của tài khoản khác.
- Mỗi job chụp quy tắc, tên chuẩn, phiên bản, nguồn và hash template; sửa hoặc tắt chuẩn không làm đổi snapshot.
- Template gốc nằm trong `format_templates`; cấu hình trong `format_profiles`; kết quả/snapshot trong `format_checks` của SQLite. Sao lưu cùng database hiện tại.
- Lịch sử hiển thị tối đa 100 lần gần nhất mỗi bài; dữ liệu cũ vẫn giữ trong database.
- Tối đa 2 job định dạng đang chạy mỗi tài khoản và 6 yêu cầu bắt đầu/phút. Retry cùng request ID trả lại job cũ, không chạy trùng.
- Giới hạn xử lý: PDF 1–200 trang, tối đa 2 triệu ký tự trích xuất; upload mặc định 50 MB mỗi PDF, admin chỉnh được. Tài khoản phải còn trong quota để nhận check mới; xem [dung lượng và giới hạn](storage-and-limits.md).
- Job đang dở khi máy chủ khởi động lại được đánh dấu thất bại để user chạy lại. Chạy đúng một API worker cho mỗi SQLite như luồng review hiện tại.

Bộ đo sử dụng tọa độ ký tự và thuộc tính font do [pdfplumber](https://github.com/jsvine/pdfplumber) cung cấp; không gửi nội dung PDF hoặc template đến dịch vụ AI cho luồng kiểm tra định dạng.
