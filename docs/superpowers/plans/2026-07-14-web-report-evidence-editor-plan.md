# Implementation Plan: Web Report Evidence Editor

Bản kế hoạch triển khai chi tiết cho việc phát triển giao diện chọn lọc bằng chứng (Evidence Pack Editor) trước khi sinh báo cáo AI.

## 1. Phân rã công việc (Task Breakdown)

- [x] **Task 1: Khai báo API Endpoint & Local Types**
  - Thêm `evidencePreview` vào `API_ROUTES.reports` ở [api.ts](file:///d:/Ky8-FPT/LiemResearch/apps/web/src/constants/api.ts).
  - Định nghĩa các interface `EvidencePaper`, `EvidencePreviewRequest`, `EvidencePreviewResponse`, `WebCreateReportRequest` và viết hàm `previewEvidence` trong [reports.api.ts](file:///d:/Ky8-FPT/LiemResearch/apps/web/src/features/reports/api/reports.api.ts).
- [x] **Task 2: Tích hợp hook React Query cho xem trước bằng chứng**
  - Viết hook `useReportEvidencePreview` trong [use-reports.ts](file:///d:/Ky8-FPT/LiemResearch/apps/web/src/features/reports/hooks/use-reports.ts).
  - Cập nhật hook `useCreateReport` để nhận kiểu `WebCreateReportRequest`.
- [x] **Task 3: Cập nhật giao diện Form và thiết kế xem trước bằng chứng**
  - Cập nhật [reports-list.tsx](file:///d:/Ky8-FPT/LiemResearch/apps/web/src/pages/reports/reports-list.tsx):
    - Đưa nút "Preview Evidence Pack" làm hành động chính khi điền form.
    - Hiển thị Skeleton Loader khi đang tải ngầm.
    - Hiển thị danh sách các bài báo bằng chứng (Relevance Score, Source Badge, Authors, Collapsible Abstract, Trash Button).
    - Thêm ô ghim thêm bài bằng ID thủ công.
    - Thêm Banner cảnh báo nếu số lượng bài nhỏ hơn 3 hoặc cảnh báo trả về từ Backend.
    - Đặt nút "Generate Report" ở cuối kèm theo mảng `selectedPaperIds`.
- [ ] **Task 4: Chạy kiểm tra biên dịch (Typecheck) và đóng gói (Build)**
  - Chạy `pnpm typecheck` và `pnpm build` để xác thực tính tương thích của mã nguồn TypeScript.

## 2. Kế hoạch Kiểm thử & Xác minh (Verification Plan)

### Kiểm thử tự động
- Chạy biên dịch toàn bộ dự án web:
  ```bash
  pnpm --filter web typecheck
  pnpm --filter web build
  ```

### Kiểm thử thủ công
1. Nhập câu hỏi nghiên cứu, chọn năm và nhấn nút "Preview Evidence Pack".
2. Kiểm tra xem danh sách bài báo có tải đúng thông tin (Journal, Year, Citations, Score) và badge tương ứng.
3. Thử xóa 1 bài báo ra khỏi danh sách và kiểm tra xem số lượng bài chọn lọc có giảm đi.
4. Thử copy 1 ID bài báo hợp lệ từ trang chi tiết hoặc tìm kiếm, dán vào ô nhập ID thủ công và kiểm tra xem bài viết đó có được ghim thêm vào danh sách.
5. Nhấn "Generate Report" và xác nhận báo cáo được sinh thành công với đúng tập bằng chứng đã chọn.
6. Thử ngắt kết nối Backend (hoặc giả lập lỗi) để kiểm tra xem Banner thông báo lỗi có hiển thị và nút "Skip Preview & Generate Report" có cho phép bỏ qua bước xem trước để chạy luồng cũ.
