# Kế hoạch mời người hướng dẫn

## Đối chiếu hiện trạng

Luồng cũ cho phép ba lời mời mỗi vai trò, chỉ mở Mentor phụ sau khi Mentor chính đã được xác minh, và đóng các lời mời cạnh tranh khi một người nhận. Nội dung giới thiệu được đọc từ dự án hiện tại, chưa phải bản chụp lúc gửi. Hệ thống đã có khóa giao dịch, thông báo bền vững, tệp riêng tư và quyền mentor theo tài nguyên; tiếp tục dùng các cơ chế này.

## Thiết kế V1

- Hai vị trí độc lập, một lời mời giữ chỗ cho mỗi vị trí. Mặc định mời chính trước; chủ dự án bật mời song song nếu cần.
- Một kế hoạch hiện hành, tối đa bốn giảng viên khác nhau. Mỗi vai trò có hàng đợi riêng. Chỉ chủ dự án sửa kế hoạch và xác nhận gửi. Không tự gửi dự phòng.
- Ứng viên chưa gửi không nhận thông báo, tệp hoặc quyền truy cập. Gửi lại phải kiểm tra thứ tự, quyền, phiên bản kế hoạch, vị trí và điều kiện giảng viên.
- Lời mời mới có hạn 14 ngày và bản chụp giới thiệu/người gửi bất biến. Tóm tắt phải là trường đã chỉ định để chia sẻ, không sao chép mô tả nội bộ.
- Khi kết thúc quan hệ, khóa tuyển lại vai trò đó. Chủ dự án phải mở đợt mới; ứng viên cũ và quan hệ Mentor phụ được giữ nguyên trong lịch sử.
- Chưa triển khai tự gửi dự phòng; không có tác vụ nền liên hệ ứng viên dự phòng.

## Dữ liệu cũ

Migration chỉ bổ sung cột/bảng; không đổi hạn, nội dung, trạng thái hay quan hệ đã tồn tại. Bản ghi không có snapshot được đánh dấu là dữ liệu cũ; không suy diễn rằng bản xem hiện tại là bản đã gửi.

Nếu một vai trò có nhiều lời mời chờ từ trước, chặn gửi/nhận thêm và hiển thị yêu cầu rà soát. Chủ dự án xem lại và thu hồi từng lời mời bằng thao tác hiện có, với lịch sử và thông báo đầy đủ; migration không tự chọn người thắng. Rà soát bằng:

```sql
SELECT project_id, mentor_role, array_agg(id ORDER BY created_at), count(*)
FROM mentorship_requests WHERE status = 'PENDING'
GROUP BY project_id, mentor_role HAVING count(*) > 1;
```

Chỉ mục duy nhất bảo vệ lời mời mới; trigger khóa dự án và kiểm tra cả lời mời cũ. Chỉ mục vị trí đang hoạt động và kiểm tra consent đúng vai trò tiếp tục áp dụng ở PostgreSQL.
