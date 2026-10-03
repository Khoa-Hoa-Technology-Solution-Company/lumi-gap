# Peer-review và quản lý phiên bản — kết quả triển khai

Ngày: 03/10/2026. Phạm vi: backend, web và shared types của LumiGap.

## Chức năng đã triển khai

- LECTURER và RESEARCHER đã xác minh được review ở INTERNAL/EXTERNAL. Không yêu cầu vị trí tại đơn vị chủ quản cho quyền review. Quyền mentor/phê duyệt học thuật vẫn theo policy riêng.
- Backend kiểm tra vai trò, xác minh và tài khoản; STUDENT bị chặn ngay cả khi có capability STRUCTURED_REVIEW cũ. Kiểm tra lại trong transaction khi nhận/gửi review; thu hồi quyền không xóa kết quả đã gửi.
- Lời mời trực tiếp, external, tự nhận cơ hội và phân công quản lý đều có request, assignment, revision được giao và rubric version. Kiểm tra chung tác giả, thành viên dự án, xung đột và tải công việc.
- Tác giả phải chủ động bật mở cơ hội review. Tóm tắt xuất hiện cho reviewer đủ điều kiện; toàn văn chỉ được truy cập sau khi nhận bài. Không suy diễn PUBLIC_SUMMARY của project thành tài liệu công khai.
- Tác giả chỉ nhận review SUBMITTED qua request detail, center và lịch sử bài; nháp reviewer được giữ riêng.
- Review đã gửi không bị sửa bởi autosave hoặc gửi lặp. Vòng mới sau resubmit có draft mới; phiên bản giao không thay đổi khi tác giả lưu bản khác.
- Tác giả trả lời mọi mục còn mở và chọn phiên bản mới hơn của cùng bài. Reviewer xác nhận ACCEPTED hoặc REOPENED từng phản hồi. Không hoàn tất vòng khi còn phản hồi ADDRESSED chưa xác minh.
- Trạng thái bài được tổng hợp theo tất cả reviewer. Hoàn tất review không đồng nghĩa chấp nhận nghiên cứu; overallAssessment được lưu riêng với điểm.
- Mỗi lần gửi hợp lệ ghi nhận đóng góp PRIVATE gắn bài. Nhiều vòng/request của cùng reviewer cập nhật đóng góp tổng hợp, không tự thêm người phản biện vào danh sách tác giả. Trang bài có liên kết hồ sơ và lịch sử vai trò được lưu tại lần review; dữ liệu cũ không được đoán lại vai trò.
- Tạo phiên bản PDF hoặc Markdown; lưu số tăng dần, checksum, nguồn và mô tả thay đổi. Khôi phục bản cũ tạo bản mới, giữ các bản trước và không sao chép điểm.
- Trang bài có mục **Phiên bản và tiến trình**: xem nội dung/tải PDF cũ theo quyền, kết quả theo phiên bản, phản hồi sửa, đóng góp và lựa chọn hai bản bất kỳ để so sánh.
- Điểm tổng và từng tiêu chí được đối chiếu theo reviewer/rubric. N/A/thiếu điểm không thành 0; khác reviewer/rubric không có delta tổng. Bản chưa review hiển thị chưa có điểm.
- Markdown có diff theo dòng với giới hạn kích thước; tài liệu lớn dùng hai khung nội dung. PDF có hai khung xem và tải riêng, chưa tự trích xuất/đánh dấu khác biệt trong PDF.

## API mới

| Method / route | Chức năng |
|---|---|
| GET `/submissions/:id/history` | Phiên bản, review đã gửi, phản hồi và đóng góp theo quyền |
| POST `/submissions/:id/versions` | Lưu Markdown hoặc khôi phục bản nguồn thành bản mới; kiểm tra expectedRevisionNumber |
| PATCH `/submissions/:id/open-review` | Tác giả/người quản lý bật/tắt cơ hội review |
| PATCH `/review-requests/:requestId/revision-items/:itemId` | Reviewer xác nhận hoặc mở lại phản hồi |

API download PDF hiện có tiếp tục được sử dụng; quyền reviewer giới hạn ở bản đang giao và những bản reviewer đó đã xử lý. Các API save/submit nhận expectedRevisionId/expectedRoundNumber để chặn workspace cũ gửi nội dung cho vòng mới.

## Migration

Đã áp dụng trên PostgreSQL **local** `localhost:5433/lumi_gap`:

1. `20261003000300_peer_review_versions`: nguồn phiên bản, revision cố định cho assignment, nguồn request, vai trò lúc review, cờ mở cơ hội và index lịch sử điểm; chuyển đóng góp review tự công khai trước đây thành PRIVATE.
2. `20261003000400_legacy_review_requests`: đưa assignment cũ có revision vào request lifecycle; giữ nguyên HumanReview và revisionId đã lưu. Không gán lại điểm lịch sử vào bản hiện tại.

`prisma migrate status`: **Database schema is up to date**, 45 migrations. Khi chạy môi trường khác, áp dụng migration trước khi khởi động backend mới.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả / phạm vi |
|---|---|
| Shared types build | Qua |
| Backend TypeScript + Prisma generate | Qua |
| Web TypeScript, Vite build và bundle budget | Qua |
| Test policy/capability/rules và persistence review | 43 test qua; 7 test persistence chạy trên PostgreSQL local |
| Test so sánh điểm và diff nội dung | 6 test qua |
| Chromium UI | 6 test qua, dùng API giả lập: lịch sử, điểm, diff, khôi phục, quyền đọc, xác nhận phản hồi và autosave vòng mới |
| Responsive | 1440×900, 375×812, 320×800; không tràn ngang trang |

Persistence kiểm tra STUDENT có capability cũ; Lecturer INTERNAL và Researcher EXTERNAL; private draft; rubric level thuộc đúng criterion; review cố định phiên bản; nhiều vòng/request không trùng đóng góp; giữ điểm khi tạo/khôi phục bản; đổi vai trò vẫn đọc được lịch sử đã gửi; lời mời external; tải PDF cũ; quyền đọc và workload; accept/submit/resubmit/claim token đồng thời.

Notification queue được giả lập trong test persistence; dữ liệu thông báo và audit vẫn dùng PostgreSQL. Chưa kiểm tra push thực tế, môi trường production, toàn bộ hành trình đăng nhập → API thật → UI hoặc hiển thị PDF trên thiết bị di động thật. Nhắc hạn tự động, thay reviewer tự động và nâng cấp AI thuộc đợt phát triển tiếp theo trong kế hoạch.

## Cách sử dụng

1. Mở bài tại `/submissions/:id`, tìm **Phiên bản và tiến trình**.
2. Tạo bản PDF/Markdown mới; ghi mô tả thay đổi hoặc khôi phục một bản cũ thành bản mới.
3. Mở yêu cầu review trong Review Center, trả lời từng mục và chọn phiên bản đã lưu để gửi lại.
4. Reviewer kiểm tra phản hồi trong workspace, chấp nhận/mở lại từng mục rồi gửi vòng tiếp theo.
5. Trên trang bài, chọn hai phiên bản để đối chiếu điểm/nội dung và xem đóng góp phản biện.
