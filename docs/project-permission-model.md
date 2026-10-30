# Mô hình Phân quyền LumiGap (Access Control & Permissions Model)

## 1. Tổng quan

Tài liệu này xác lập mô hình phân quyền chuẩn hóa (Role-Based & Attribute-Based Access Control) cho nền tảng cộng tác nghiên cứu khoa học LumiGap.

Mục tiêu cốt lõi:
1. **Bảo vệ quyền sở hữu trí tuệ**: Bản thảo chưa công bố, ý tưởng và dữ liệu thô không bị rò rỉ hoặc tự ý xuất bản ra bên ngoài.
2. **Minh bạch hóa đóng góp**: Ghi nhận chính xác minh chứng thực tế của từng người tham gia theo chuẩn CRediT, ngăn chặn việc xóa bỏ lịch sử hoặc tranh chấp phân bổ.
3. **Phân tách trách nhiệm (Separation of Concerns)**: Giữa người trực tiếp thực hiện đề tài (**Editor**), giảng viên hướng dẫn/người phản biện độc lập (**Lecturer/Reviewer**) và người chủ nhiệm chịu trách nhiệm cao nhất (**Owner**).

---

## 2. Ma trận Quyền hạn (Permission Matrix)

| Quyền hạn | Editor (Nghiên cứu sinh / Member) | Lecturer / Reviewer (Cố vấn / Phản biện) | Owner (Chủ nhiệm đề tài) | Cơ chế thực thi (Implementation) |
| :--- | :---: | :---: | :---: | :--- |
| **Xem nội dung được cấp** | **Có** | **Có** (trong phạm vi chia sẻ) | **Theo phạm vi quản lý** | `withWorkspace`, `withSnapshot`, `canAccessProjectAsMentor` |
| **Sửa LaTeX** | **Có** | **Chỉ khi được cấp** (Mặc định Read-only) | **Theo quyền** | Yjs WebSocket presence permission (`canWrite`), `authorizeProjectTransaction` |
| **Comment và review** | **Có** | **Có** | **Có** | `projectDiscussion` (`MENTOR_QUESTION`, `GENERAL`) |
| **Tải toàn bộ source ZIP** | **Không mặc định** (Tùy chính sách) | **Không mặc định** (Bị chặn) | **Theo chính sách xuất dữ liệu** | `assertCanExportProjectSource`, `exportPolicy` (`ALL_MEMBERS` / `OWNER_ONLY`) |
| **Đồng bộ sang GitHub** | **Chỉ khi được ủy quyền** | **Không mặc định** (Bị chặn) | **Theo chính sách** | Proxy `assertCanExportProjectSource(projectId)`, chặn export mã nguồn nếu không đủ quyền |
| **Tạo link chia sẻ ngoài** | **Không mặc định** | **Không** | **Người được ủy quyền** | Phân quyền `EDIT_SETTINGS` chỉ dành cho Owner tại `project.service.ts` |
| **Xem lịch sử đóng góp liên quan** | **Có** (bản thân & nhóm) | **Có** (để chấm điểm/đánh giá) | **Có, theo phạm vi** | `AllocationRevision`, `research_evidence_events` |

---

## 3. Đặc tả chi tiết từng quyền

### 3.1. Xem nội dung được cấp
- **Editor**: Xem toàn bộ các tài liệu, nguồn trích dẫn, sơ đồ nghiên cứu và bản thảo LaTeX trong workspace của dự án.
- **Lecturer / Reviewer**:
  - *Lecturer (Cố vấn)*: Chỉ được xem các tài nguyên thuộc phạm vi tư vấn (`mentorScope === "SHARED_RESOURCES"`).
  - *Reviewer (Người phản biện)*: Chỉ xem các bản **Snapshot tĩnh đã niêm phong** được phân công phản biện chính thức (`reviewerAssignment`). Không có quyền xem bản nháp đang chỉnh sửa dở dang.
- **Owner**: Xem toàn bộ tài nguyên thuộc các đề tài do mình quản lý.

### 3.2. Sửa LaTeX
- **Editor**: Có quyền soạn thảo trực tiếp trên tài liệu Yjs CRDT thời gian thực.
- **Lecturer / Reviewer**: Mặc định là **Chỉ đọc (Read-only)**. Giảng viên chỉ đọc bản thảo và ghi chú/comment, không can thiệp trực tiếp vào mã nguồn trừ khi được Owner phân công làm Editor trực tiếp.
- **Owner**: Toàn quyền sửa nội dung, tuân thủ trạng thái bảo lưu khi dự án bị đóng/lưu trữ (`ARCHIVED`).

### 3.3. Comment và review
- **Editor**: Thảo luận nội bộ trên các đoạn văn bản (inline quotes) hoặc thảo luận chung toàn đề tài.
- **Lecturer / Reviewer**:
  - Giảng viên gửi ý kiến định hướng, phản hồi cố vấn (`MENTOR_QUESTION`).
  - Reviewer gửi phiếu đánh giá phản biện độc lập theo thang đo khoa học.
- **Owner**: Đọc, phản hồi, phê duyệt hoặc đóng các luồng góp ý.

### 3.4. Tải toàn bộ source ZIP (Raw LaTeX Archive)
- **Editor**: Phụ thuộc vào thuộc tính bảo mật `exportPolicy` của dự án:
  - Nếu `exportPolicy = "OWNER_ONLY"`: Editor bị chặn xuất file (`403 Forbidden`).
  - Nếu `exportPolicy = "ALL_MEMBERS"`: Editor được phép tải source.
- **Lecturer / Reviewer**: Bị chặn ở cấp độ API server:
  - *"Peer reviewers cannot export raw LaTeX source archives"*.
- **Owner**: Luôn có quyền tải toàn bộ mã nguồn để sao lưu.

### 3.5. Đồng bộ sang GitHub (GitHub Sync)
- **Editor**: Chỉ được phép Push khi dự án cho phép xuất mã nguồn (`exportPolicy !== "OWNER_ONLY"`).
- **Lecturer / Reviewer**: Không có quyền đồng bộ mã nguồn sang kho bên ngoài.
- **Owner**: Quản lý liên kết kho lưu trữ, kiểm tra phân kỳ và thực hiện Push/Pull an toàn.

### 3.6. Tạo link chia sẻ ngoài
- **Editor & Reviewer**: Không có quyền biến dự án từ `PRIVATE` sang `PUBLIC` hoặc tạo link mở cho người ngoài nhóm.
- **Owner**: Duy nhất Owner hoặc tài khoản quản trị hệ thống mới có quyền cấu hình tính công khai và cấp liên kết chia sẻ.

### 3.7. Xem lịch sử đóng góp liên quan
- **Editor**: Xem tỉ lệ đóng góp dự kiến, các mốc phân bổ (`AllocationRevision`) và bằng chứng của nhóm để xác nhận hoặc khiếu nại nếu có bất công.
- **Lecturer / Reviewer**: Xem chi tiết đóng góp thực tế (logs sửa đổi, commit, tổng hợp tài liệu, chạy thực nghiệm) của từng sinh viên làm cơ sở chấm điểm công bằng, tránh tình trạng "ngồi mát ăn bát vàng".
- **Owner**: Giám sát toàn bộ tiến trình, lịch sử kiểm toán `research_evidence_events` và giải quyết các vụ việc khiếu nại liêm chính học thuật.

