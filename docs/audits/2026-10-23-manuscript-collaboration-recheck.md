# Kiểm tra lại luồng cùng viết bản thảo — 23/10/2026

Đợt kiểm tra bổ sung cho [báo cáo lần đầu](2026-10-23-manuscript-collaboration-audit.md), tập trung vào thao tác đồng thời, giữ bản nháp, bình luận và quyền truy cập. Không sửa nội dung hay quyền của bản thảo thật.

## Lỗi tìm thấy và đã sửa

| Mức | Vấn đề | Sửa đổi |
| --- | --- | --- |
| P1 | Mở form đổi tên/xóa rồi chuyển file có thể khiến thao tác áp dụng lên file vừa chọn. | Form giữ ID, đường dẫn và phiên bản của file tại thời điểm mở; hiển thị rõ file sẽ được sửa. |
| P1 | Đồng đội xóa file trong lúc đang viết bằng visual editor hoặc soạn đề xuất có thể làm mất buffer do metadata chọn file thay thế. | Giữ file và provider đang chứa bản nháp, khóa ghi vào file đã xóa, giữ cảnh báo rời trang và cho phép đọc/copy buffer. |
| P1 | Các API thảo luận chung vẫn cho đọc hoặc trả lời trao đổi của bản thảo đã xóa. | Kiểm tra bản thảo còn tồn tại cho list/detail/reply/history; phạm vi mentor cũng tuân theo kiểm tra này. |
| P2 | Snapshot của bản thảo lưu trữ vẫn báo có quyền bình luận; đường thảo luận chung còn nhận mutation. | Cờ quyền và API ghi thống nhất trạng thái chỉ đọc của dự án/bản thảo đã lưu trữ. |
| P2 | Retry tạo snapshot với cùng clientKey có thể trả snapshot cũ dù minimumSequences mới cao hơn nguồn đã niêm phong. | Đối chiếu minimumSequences với manifest của snapshot cũ trước khi trả kết quả retry. |
| P2 | 41 lần bắt tay WebSocket đồng thời có thể vượt giới hạn 40 kết nối/tài khoản do cùng qua kiểm tra trước await. | Kiểm tra lại số kết nối sau xác thực, ngay trước khi thêm client vào phòng. |
| P2 | Socket im lặng khi không có thao tác ghi có thể không tự kết nối lại. | Watchdog 15 giây dựa trên heartbeat từ gateway; tách khỏi timeout receipt 10 giây để heartbeat không che lỗi chưa xác nhận ghi. |
| P2 | Reply sửa lại sau lần gửi lỗi vẫn giữ clientKey cũ và bị máy chủ từ chối. | Cùng nội dung retry giữ receipt; nội dung thay đổi tạo receipt mới. |
| P2 | Promise gửi reply/resolve bị reject có thể không được xử lý, thao tác đồng thời có thể gửi trùng. | Bắt lỗi, giữ input, báo lỗi tại thread; khóa đồng bộ bằng ref và vô hiệu ô nhập trong lúc gửi. |
| P2 | Status/version/quyền trong danh sách thread có thể cũ hơn dữ liệu cuộc trò chuyện đầy đủ. | Dùng dữ liệu cuộc trò chuyện mới hơn cho thao tác; resolve gửi đúng expectedVersion; invalidate toàn bộ các trang sau mutation. |
| P2 | Kết luận đã lưu không hiển thị, reopen có thể gửi lại kết luận cũ; bản nháp bị bỏ khỏi cảnh báo khi người khác resolve. | Trả và hiển thị conclusion, xóa input sau khi lưu, reopen gửi kết luận rỗng, giữ cảnh báo cho nội dung chưa gửi. |
| P2 | Thread bị ẩn vẫn polling API có tác dụng đánh dấu đã đọc; trên mobile trạng thái ẩn chưa khớp CSS. | Chỉ tải cuộc trò chuyện/đánh giá anchor khi thread hiện; theo dõi breakpoint 780px và pane hiện tại. |
| P2 | API báo canEdit cho bình luận gắn artifact dù thao tác save luôn từ chối. | Dùng chung điều kiện giữ ngữ cảnh artifact cho capability và mutation; thảo luận liên kết thông thường vẫn sửa được. |
| P3 | Lỗi tải bản thảo lần đầu chưa có cách thử lại ngay trên trang. | Thêm nút thử lại cho cả bản nháp và snapshot. |

## Kiểm chứng

- Frontend manuscript: **151/151 test đạt**, 27 file; gồm 40 test workspace và 8 test comment thread.
- Backend liên quan: **52 test đạt** tính theo các test duy nhất: 26 persistence manuscript, 15 HTTP routes, 2 race WebSocket, 1 cộng tác sáu người bằng socket thật, 3 tài khoản ID cũ và 5 project workspace.
- Bốn test PostgreSQL runtime boundary đạt trong bước build backend.
- Các regression persistence mới đã được chạy thất bại trước khi sửa, sau đó đạt trên PostgreSQL dùng riêng cho kiểm thử.
- TypeScript backend và web đạt; ESLint các file thay đổi và kiểm tra whitespace đạt.
- Bộ generic workspace collaboration gồm 26 test được bỏ qua vì yêu cầu database riêng `lumigap_project_slice_test` trên cổng 15439. Không tính các test đó vào số đạt ở trên và không sửa guard để ép chạy trên database khác.
- Không chạy lại bộ compiler thật ở đợt bổ sung này vì không đổi compiler; kết quả compiler của lần đầu được ghi riêng trong báo cáo trước.

## Giới hạn còn lại

- Phiên kiểm tra trước nhận 404 ở URL bản thảo thật dù dữ liệu vẫn tồn tại. Đợt này không tự thay đổi quyền để truy cập bản thảo; kiểm thử ghi dùng fixture riêng.
- Bản nháp visual/tracked của file đã xóa được giữ trong bộ nhớ tab để đọc/copy. Cần giữ tab mở cho đến khi đã lấy lại phần cần thiết; chưa có định dạng xuất riêng cho buffer visual/tracked.
- Những giới hạn đã ghi lần đầu về danh sách snapshot dài và broadcast giữa nhiều API instance vẫn cần thiết kế riêng trước khi mở rộng quy mô.

## Bản chạy local và dọn fixture

Đã build shared types, backend và web; cập nhật hai image local rồi khởi động lại API, web, worker AI jobs và worker manuscript compile bằng cả hai file Compose. Backend healthy; hai worker đang chạy; API `/health` và web trả 200, `auth/me` khi không đăng nhập trả 401 đúng dự kiến.

Mở lại URL thật sau cập nhật vẫn hiện “Không thể mở bản thảo”. Đã kiểm tra nút “Thử lại” chuyển sang trạng thái tải và trả về thông báo unavailable, không có lỗi JavaScript ghi nhận trong phiên kiểm tra.

Đã xóa database và Redis chỉ dùng cho đợt kiểm tra này, cùng helper môi trường tạm. Thư mục build context bị ignore được giữ lại. Không thay schema/migration, không commit hoặc push.
