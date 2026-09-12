# Hướng dẫn quản trị Liêm Research Paper

Đăng nhập bằng tài khoản có quyền `admin`. Sidebar hiển thị riêng nhóm **Vận hành** và **Cấu hình**, có thể cuộn trên desktop hoặc mở bằng nút menu trên điện thoại. Mỗi trang có ô **Hướng dẫn** để mở ngay tại chỗ. User thường chỉ thấy menu tài khoản; API quản trị cũng kiểm tra quyền ở server.

## 1. Các menu

| Menu | Công việc |
| --- | --- |
| Doanh thu & credit | Tiền nạp đã thanh toán, dòng credit theo khoảng ngày, số dư và tài nguyên hiện tại |
| Người dùng | Tìm kiếm/phân trang user, xem hồ sơ vận hành, đổi quyền và active/deactive |
| Giao dịch nạp tiền | Tìm đơn theo ngày tạo/trạng thái, kiểm tra thanh toán PayOS |
| Sổ credit | Nạp, trừ phí review, mua/gia hạn dung lượng, hoàn phí |
| Nhật ký hoạt động | Log nghiệp vụ user và lịch sử thao tác quản trị |
| Thanh toán PayOS | Giá credit, mức nạp tối thiểu, thông tin cổng thanh toán |
| AI & model | Model, key Gemini và bật/tắt review dùng key hệ thống |
| Đăng nhập & CAPTCHA | Google Client ID và Cloudflare Turnstile |
| Loại review | Hướng dẫn Markdown và phiên bản tiêu chí review |
| Template định dạng | Preset IEEE/Springer, template PDF/DOCX/LaTeX và quy tắc format |
| Dung lượng & Drive | Quota, giới hạn file, giá dung lượng, local/Drive |
| Giới hạn & chống spam | Rate limit và số tác vụ đồng thời/ngày |
| Email thông báo | SMTP, gửi thử và trạng thái thông báo hết hạn |

Trang **Chuẩn định dạng** trong menu thông thường dùng để tra cứu mẫu; quản lý/chỉnh sửa mẫu nằm riêng ở **Template định dạng**.

## 2. Quản lý người dùng

1. Vào **Người dùng**, tìm tên/email/ID hoặc lọc đang hoạt động/vô hiệu hóa. Danh sách phân trang 25 user, không bị giới hạn ở 200 user gần nhất.
2. Bấm tên user để mở hồ sơ: số dư, tổng tiền đã nạp, credit đã trừ/hoàn, PDF/artifact đã dùng, quota/gói, phiên đăng nhập và trạng thái tác vụ hiện còn trong thư viện.
3. Dùng các tab **Bài & tài nguyên**, **Nạp tiền**, **Sử dụng credit**, **Nhật ký** để xem lịch sử có phân trang và lọc ngày UTC.
4. Chọn quyền `User`/`Admin` và trạng thái `Active`/`Deactive`, bấm lưu và xác nhận đúng tài khoản.

Deactive xóa các phiên đăng nhập hiện tại và chặn truy cập mới. Active lại không khôi phục token cũ, user phải đăng nhập mới. Không xóa nội dung hay số dư khi thay trạng thái. Job đã được nhận vẫn có thể hoàn tất; thanh toán hợp lệ vẫn được đối soát/cộng credit. Thời hạn gói dung lượng và chính sách dọn dữ liệu vẫn chạy khi tài khoản bị vô hiệu hóa.

Không thể tự vô hiệu hóa/tự hạ quyền admin đang thao tác. Server kiểm tra lại quyền người thao tác ngay trong transaction cập nhật để hai admin không thể đồng thời khóa lẫn nhau và để lại hệ thống không có admin hoạt động. Mỗi thay đổi ghi actor, trạng thái trước/sau; gửi lại cùng trạng thái không ghi thay đổi giả.

Admin xem metadata tài nguyên và số liệu vận hành, không có quyền ngầm tải PDF hoặc đọc nội dung review riêng của user khác. Màn hình không hiển thị key cá nhân, token phiên, mật khẩu SMTP hay thông tin xác thực Drive. Các bài nhập cũ chưa có chủ có nút **Nhận vào thư viện của tôi** ở danh sách user, có xác nhận trước khi gán.

“Tài nguyên” ở đây là dung lượng PDF/artifact, upload giữ chỗ, gói/quota và bộ đếm job. Không đo CPU/RAM hoặc token/chi phí Gemini thực tế riêng theo user. Số job hiện tại chỉ tính bản ghi còn trong thư viện; lịch sử đã xóa tra qua nhật ký và sổ credit.

## 3. Dashboard doanh thu và credit

Khoảng ngày bao gồm cả ngày bắt đầu/kết thúc, theo **UTC**, tối đa 366 ngày; mặc định 30 ngày gần nhất. Biểu đồ và bảng theo ngày có cả ngày không phát sinh giao dịch.

| Chỉ số | Cách tính |
| --- | --- |
| Tiền nạp đã thanh toán | Tổng `orders.amount` của đơn `paid`, lọc theo `paid_at` |
| Credit nạp trong kỳ | Tổng biến động `topup` trong sổ credit, lọc theo ngày ghi sổ |
| Credit đã trừ | Tổng trị tuyệt đối các dòng credit âm; tách phí review và dung lượng |
| Credit đã hoàn | Tổng dòng `refund` trong kỳ |
| Sử dụng ròng | Credit đã trừ − credit đã hoàn trong cùng khoảng ngày |
| Tổng số dư credit | Tổng ví của mọi tài khoản hiện tại, gồm tài khoản deactive |
| Tài nguyên hiện tại | Tổng PDF/artifact trong DB, phân bố manifest local/Drive, dung lượng đang giữ chỗ |

Tiền thu từ nạp ví không phải lợi nhuận hoặc doanh thu ghi nhận kế toán từ dịch vụ đã cung cấp. Dashboard chưa trừ chi phí API/hạ tầng. Không nhân credit đã tiêu với đơn giá hiện tại rồi cộng vào tiền nạp: làm vậy sẽ tính tiền hai lần và có thể sai khi đơn giá thay đổi. Đơn đã tạo/đã trả giữ snapshot số tiền và số credit của giao dịch.

Hoàn phí hôm nay có thể thuộc review bị trừ tiền ở kỳ trước, nên sử dụng ròng trong khoảng lọc có thể âm. Số dư/tài nguyên ở khối **Hiện tại** không bị giới hạn bởi khoảng ngày. Quota không đo kích thước SQLite, backup, log server hoặc file tạm; file còn đang xóa dở vẫn được ghi nhận đến khi hoàn tất.

## 4. Đối soát nạp và tra sổ credit

Trong **Giao dịch nạp tiền**, lọc theo **ngày tạo đơn** UTC hoặc trạng thái. Dashboard doanh thu dùng ngày thanh toán, vì vậy số đơn trong hai trang có thể khác khi đơn được tạo và thanh toán ở hai ngày khác nhau.

Nút **Kiểm tra PayOS** gọi cổng thanh toán và cập nhật trạng thái đã xác minh; không phải thao tác cộng tiền tùy ý. Webhook/đối soát lặp không cộng trùng cùng đơn. Bấm tên tài khoản để đối chiếu số dư và lịch sử của đúng user.

Trong **Sổ credit**, dòng dương cộng ví, dòng âm trừ ví. Mã tham chiếu liên kết nghiệp vụ như `order:...`, `review:...`, `storage:...`; lịch sử giữ lại khi bài bị xóa. Không có chức năng chỉnh/xóa trực tiếp ledger hoặc tự đặt số dư từ giao diện quản trị.

## 5. Cấu hình từng dịch vụ

### Thanh toán PayOS

Đặt giá VNĐ/credit (mặc định 100), mức nạp tối thiểu (mặc định 10.000đ, tối thiểu 10.000đ và là bội số giá credit), PayOS Client ID, API key, checksum key. Cấu hình webhook `https://<domain>/api/payos/webhook` trong PayOS. Đối soát đơn đang tạo/chờ trước khi đổi thông tin PayOS; server từ chối đổi khi còn đơn chưa xử lý.

Giá mới chỉ áp dụng đơn mới. Trường secret để trống giữ key cũ, chọn **Xóa key đã lưu** để gỡ. Mật khẩu/key lưu qua web được mã hóa bằng `APP_ENCRYPTION_KEY`, nên phải backup khóa cùng DB.

### AI & model

Nhập model và Gemini API key hệ thống, bật **Cho phép review bằng key hệ thống**. Phí hiện tại: hệ thống 10 credit/review, key cá nhân 3 credit/review; review lỗi hoàn đúng khoản đã trừ. Các quota phút/ngày/đồng thời nằm ở menu **Giới hạn & chống spam**. Thay model không sửa báo cáo đã lưu.

### Đăng nhập & CAPTCHA

Google Client ID thuộc OAuth web client, authorized JavaScript origin phải trùng `APP_BASE_URL`. Turnstile cần đủ site key và secret key trước khi bật; cấu hình domain tương ứng ở Turnstile. Thông tin bootstrap admin (`ADMIN_EMAILS`/`ADMIN_GOOGLE_SUBS`), domain, HTTPS và khóa mã hóa quản lý qua ENV, xem [triển khai](deployment.md).

### Loại review

Tạo loại mới hoặc nạp Markdown UTF-8 tối đa 128 KB; điền tên, mô tả, hướng dẫn và trạng thái bật/tắt. Viết rõ tiêu chí, ngôn ngữ và định dạng đầu ra mong muốn. Lưu tạo phiên bản mới; các review đã nhận giữ snapshot cũ. Tắt loại để không nhận job mới theo loại đó.

### Template định dạng

Chọn preset IEEE Conference A4/US Letter hoặc Springer LNCS, nhân bản rồi chỉnh theo nơi nộp bài. Có thể nạp `.pdf`, `.docx`, `.tex`, `.json` tối đa 10 MB; Word `.doc` cần lưu thành `.docx`. Kiểm tra bản nháp, xác nhận khổ giấy, cỡ chữ, số cột, số trang và các mục đối chiếu thủ công trước khi bật. Chi tiết ở [hướng dẫn format](format-checking.md).

### Dung lượng & Drive

Mức miễn phí mặc định 50 MB/user; giới hạn mỗi PDF mặc định 50 MB là trường độc lập. Giá mặc định 10 credit/100 MB/30 ngày. Mua thêm cộng dồn, thu đủ phí phần mới nhưng giữ ngày hạn chung; gia hạn thanh toán tổng dung lượng. Tắt bán cũng chặn gia hạn nên cần cân nhắc những tài khoản sắp hết hạn.

Local giữ file ở server. Drive cần credentials hệ thống ngoài Git, khai báo ENV/mount theo [hướng dẫn Drive](storage-and-limits.md#kết-nối-google-drive-hệ-thống). Điền ID thư mục, kiểm tra kết nối rồi lưu. File luôn ghi local trước, xác minh upload/checksum mới xóa local; khi lỗi giữ local để thử lại. Đổi backend không tự chuyển toàn bộ file cũ.

### Giới hạn & chống spam

Điều chỉnh API/upload theo phút, AI theo phút/ngày UTC, số review/format đồng thời theo user/toàn hệ thống. Lượt lỗi vẫn tính chống spam, dù credit được hoàn. Xóa bài, logout và restart không đặt lại bộ đếm. Hạ concurrency theo tài nguyên server; kích thước PDF và dung lượng tài khoản cấu hình ở menu riêng. Các thay đổi giới hạn không ghi đè giá/nơi lưu file.

### Email thông báo

Nhập SMTP host, port, tài khoản, mật khẩu, địa chỉ gửi và TLS. `starttls` thường cổng 587, `ssl` thường cổng 465. Bật, lưu rồi **Gửi email thử tới tài khoản admin này**. Kiểm tra inbox/spam cùng số thư đang chờ/lỗi và lần chạy bảo trì gần nhất trên trang.

Cấu hình web ưu tiên ENV. Email nhắc phí gia hạn toàn bộ, số dư và credit thiếu. Chưa gửi được cảnh báo thì chưa tự dọn; email gửi muộn vẫn cho đủ 7 ngày. `STORAGE_MAINTENANCE_ENABLED=false` tắt tác vụ trong lúc kiểm thử/khôi phục backup. Chi tiết [SMTP và chính sách hết hạn](storage-and-limits.md#hết-hạn-tự-dọn-sau-7-ngày-và-email).

## 6. Nhật ký và nâng cấp

`user_activity` ghi nghiệp vụ trong cùng transaction thay đổi dữ liệu qua trigger SQLite; thay đổi quyền ghi rõ admin thao tác. Log không chứa bản thảo, API key, token hoặc mật khẩu và không bị cascade khi xóa bài. `admin_audit` giữ tên cấu hình được đổi và admin thực hiện, không lưu giá trị secret.

Nhật ký user bắt đầu từ bản nâng cấp này; không dựng lại lịch sử đăng nhập/xóa đã xảy ra. Đơn nạp và sổ credit cũ vẫn tra được. Sao lưu DB trước nâng cấp như quy trình triển khai; schema/trigger mới tự tạo khi khởi động, không chuyển đổi tiền hoặc số dư. Log hiện được giữ liên tục trong SQLite, cần tính vào backup/dung lượng DB của đơn vị vận hành.

## 7. API quản trị bổ sung

Tất cả yêu cầu quyền admin; thao tác ghi còn kiểm tra CSRF/Origin theo middleware hiện có.

| Endpoint | Tham số/chức năng |
| --- | --- |
| `GET /api/admin/dashboard` | `start`, `end` dạng YYYY-MM-DD; mặc định 30 ngày |
| `GET /api/admin/users` | `q`, `status=all/active/inactive`, `page`, `limit` |
| `GET /api/admin/users/{id}` | Hồ sơ vận hành và tổng thống kê của user |
| `PATCH /api/admin/users/{id}` | `role`, `disabled`; không nhận trường số dư |
| `GET /api/admin/reports/{kind}` | `orders/credits/activity/audit/papers`; `user_id`, `page`, `limit`, `start`, `end`, trạng thái đơn |
| `GET /api/admin/settings` | Cấu hình dịch vụ, chỉ trả cờ đã cấu hình cho secret |
| `PATCH /api/admin/settings/{section}` | `billing/ai/auth`; chỉ ghi nhóm trường đang sửa |
| `PATCH /api/admin/storage/settings/{section}` | `storage/limits`; tách quota/backend với chống spam |

Danh sách mặc định 25 dòng, tối đa 100/lần; response gồm `items`, `total`, `page`, `limit`. `GET /api/admin` và các endpoint PUT cấu hình cũ vẫn giữ để tương thích, giao diện mới sử dụng các endpoint theo từng mục.
