# Spec: Web Report Evidence Editor

## 1. Mục tiêu & Bối cảnh
- **Mục tiêu:** Nâng cấp trải nghiệm tạo báo cáo phân tích AI (`Analytical Reports`). Thay vì để mô hình tự ý truy xuất tài liệu một cách ngẫu nhiên từ câu hỏi của người dùng, giao diện mới sẽ cho phép người dùng xem trước, chỉnh sửa (thêm/bớt) danh sách bài báo làm bằng chứng (Evidence Pack) trước khi gửi yêu cầu sinh báo cáo hoàn chỉnh.
- **Bối cảnh:** Khi người dùng đặt câu hỏi nghiên cứu, họ muốn biết chính xác AI sẽ trích dẫn những tài liệu nào. Họ cần quyền kiểm soát để ghim các bài viết quan trọng (selected) hoặc loại bỏ các bài viết kém liên quan (retrieved) được gợi ý bởi hệ thống.

## 2. Phạm vi yêu cầu (Scope)
- **Trong phạm vi:**
  - Tích hợp endpoint mới: `POST /api/v1/reports/evidence-preview` để lấy danh sách bằng chứng đề xuất.
  - Cập nhật API tạo báo cáo `POST /api/v1/reports` để nhận thêm mảng `selectedPaperIds` làm bằng chứng ghim sẵn.
  - Sửa đổi Form tạo báo cáo tại `/reports`:
    - Thay thế nút "Generate Report" mặc định bằng nút "Preview Evidence Pack".
    - Hiển thị khu vực xem trước (Evidence Pack) khi có kết quả tải về.
    - Hiển thị thông số tổng quan (số lượng papers đã chọn / số lượng tối đa, ngôn ngữ, cảnh báo hệ thống).
    - Hiển thị danh sách các bài báo chi tiết (Tên bài, năm, tạp chí, số trích dẫn, score, badge trạng thái `retrieved`/`selected`, tác giả, tóm tắt abstract thu gọn/mở rộng, nút xóa).
    - Thêm ô nhập mã ID bài báo để người dùng ghim thủ công bài viết của họ.
    - Hiển thị nút "Generate Report" ở cuối để xác nhận sinh báo cáo từ gói bằng chứng đã chọn lọc.
  - Xử lý các trạng thái: Loading skeleton khi đang tải preview, Error Banner cho phép thử lại hoặc Bỏ qua xem trước để Tạo trực tiếp (Force Generate) nhằm không chặn luồng cũ.
- **Ngoài phạm vi:**
  - Cài đặt logic xác thực trích dẫn ở phía Client (phía Backend sẽ chịu trách nhiệm).
  - Thay đổi giao diện đọc chi tiết báo cáo đã sinh.

## 3. Kiến trúc kỹ thuật & Cấu trúc dữ liệu
- **API Endpoint mới:** `POST /api/v1/reports/evidence-preview`
  - Payload: `{ query, topic, yearFrom, yearTo, language, selectedPaperIds }`
  - Response: `{ papers: Array<{ id, title, abstractText, publicationYear, journalName, citationCount, authorNames, score, source }>, retrievedPaperIds, selectedPaperIds, maxEvidencePapers, warnings }`
- **Thay đổi API cũ:** `POST /api/v1/reports` nhận thêm trường optional `selectedPaperIds: string[]`.
- **TypeScript Types (Local):**
  - Khai báo mở rộng tạm thời các kiểu dữ liệu `EvidencePaper`, `EvidencePreviewRequest`, `EvidencePreviewResponse`, `WebCreateReportRequest` trong API layer của frontend để tương thích khi shared-types chưa cập nhật.

## 4. Giao diện người dùng (UI/UX)
- **Quy tắc thiết kế:** Sử dụng kiểu dáng nghiêm túc, tối giản cho ứng dụng nghiên cứu (Research Product Style), bo góc `rounded-xl` / `rounded-2xl`, màu nền sáng/tối đồng bộ (`bg-slate-50 dark:bg-slate-900/50`), và viền mờ (`border-slate-200 dark:border-slate-800`).
- **Abstract Snippet:** Hiển thị tối đa 150 ký tự đầu của tóm tắt abstract, có nút "Show More" / "Show Less" để mở rộng chi tiết.
- **Source Badges:**
  - `retrieved`: Nền xanh dương nhạt (bài do thuật toán tự tìm).
  - `selected`: Nền tím nhạt (bài do người dùng ghim hoặc chọn thủ công).
- **Manual Input:** Thêm ô nhập input nhỏ cho phép người dùng dán (paste) mã 24-ký tự Hex ID của bài báo để ghim thủ công.
