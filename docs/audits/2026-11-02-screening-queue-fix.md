# Screening queue: sửa HTTP 400

## Nguyên nhân và sửa lỗi

Web gửi `slots=ALL` trong query hàng đợi nhưng `screeningPageSchema` dùng
`.strict()` chưa khai báo `slots`, nên request bị từ chối trước khi vào service.
Service đã hỗ trợ bộ lọc này.

Đã khai báo enum `ALL | UNCLAIMED | LAST_SLOT`, mặc định `ALL`; giữ kiểm tra
tham số sai và unknown keys. Không thay đổi xác thực.

## Kiểm chứng ngày 2026-11-02

- Query contract: 7/7 test đạt.
- Screening PostgreSQL trên database test riêng: 137/137 test đạt. HTTP test
  kiểm tra cả ba giá trị slots trả 200, invalid trả 400, thiếu xác thực trả 401,
  không lộ nhận xét đang blind.
- Web API session/delivery: 10/10 test đạt.
- Docker backend build thành công, gồm TypeScript và PostgreSQL runtime audit
  (4/4 test). Đã recreate riêng backend, container healthy và `/ready` trả 200.
- Trình duyệt trên project `6ab33f1537802fe30d38753b`: Tất cả 4 bài,
  Chưa ai nhận 3 bài, Còn 1 suất cuối 1 bài. Log backend xác nhận cả ba query
  trả 200. Chỉ xem và đổi bộ lọc; không nhận bài hoặc gửi đánh giá.
- Không tái hiện 401 hay `onboarding.js` trong lượt reload/đổi bộ lọc này;
  console thu thập được không có error/warn, log backend mới không có 401.
  Chưa xác định nguyên nhân hai thông báo ban đầu.

Ảnh trước/sau: `2026-11-02-screening-queue-before.png` và
`2026-11-02-screening-queue-after.png` trong thư mục này.
