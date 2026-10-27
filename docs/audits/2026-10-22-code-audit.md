# Rà soát và sửa lỗi — 22/10/2026

## Các lỗi đã sửa

| Khu vực | Lỗi xác nhận | Thay đổi |
| --- | --- | --- |
| Python internal API | Khi thiếu `INTERNAL_SERVICE_KEY`, các endpoint review/format/health vẫn cho phép truy cập. | Dùng chung dependency xác thực cho toàn bộ internal API; thiếu cấu hình trả 503, khóa thiếu/sai trả 403; so sánh khóa bằng `hmac.compare_digest`. |
| PayOS webhook | Thiếu checksum key làm bỏ qua xác minh chữ ký, có thể cộng credit từ yêu cầu giả. | Chặn khi thiếu cấu hình; so sánh HMAC bằng constant time; bỏ log chữ ký; kiểm tra cả trạng thái đã ký, loại tiền, số tiền, payment link và trạng thái đơn trước khi cộng credit. Giữ cơ chế chống cộng trùng hiện có. |
| PayOS DTO và URL | Body chưa được kiểm tra, số tiền lỗi có thể tới Prisma; nhiều CORS origins ghép thành redirect URL không hợp lệ. | Thêm Zod middleware, giới hạn số nguyên theo PostgreSQL Int, kiểm tra HTTP(S) redirect, giữ tất cả trường dữ liệu ký; chuẩn hóa chữ ký theo tài liệu PayOS; chọn một origin mặc định; chặn mock payment trong production. |
| Web authentication | Refresh/401 đến muộn có thể ghi đè token, xóa phiên mới hoặc retry bằng tài khoản khác. | Theo dõi thế hệ phiên, kiểm tra chủ sở hữu trước khi ghi token/retry/clear; chia sẻ refresh trong cùng phiên; phiên mới có refresh riêng; dùng token đã được request khác refresh khi phù hợp. |
| Flutter authentication | Retry 401 không có giới hạn; refresh lỗi và phản hồi cũ có thể ảnh hưởng phiên mới; retry làm mất một số request options. | Retry tối đa một lần; kiểm tra phiên; serialize thao tác secure storage; bảo toàn request options, clone multipart khi retry; không xóa phiên vì lỗi 500 của request retry; xử lý cả refresh response sai cấu trúc. |
| Python PDF conversion | Worker luôn import `resource`, khiến chuyển đổi thất bại trên Windows. | Chỉ áp dụng POSIX resource limits trên POSIX, xuất JSON UTF-8. Windows vẫn có timeout, giới hạn payload và semaphore từ tiến trình cha. Docker/Linux vẫn giữ resource limits. |
| Test discovery | Vitest chạy cả bản sao test trong `test-results` và script browser QA trong `uploads`. | Giới hạn discovery vào source tests; backend vẫn bao gồm test dưới `scripts`. |
| Web i18n và test navigation | Thiếu khóa dịch, locale lệch khóa; scanner coi các input xử lý như `authorId` là văn bản; navigation mock thiếu `useProject`. | Bổ sung 42 khóa và bản dịch Việt, sửa scanner kèm test chống hồi quy, hoàn thiện mock mà giữ nguyên các assertion điều hướng. |
| Jenkins | Pipeline gọi hai script MongoDB không còn tồn tại và truyền cấu hình index MongoDB cũ. | Sau khi được người dùng cho phép, thay bằng `db:migrate:deploy`/`db:migrate:status`, bỏ các biến MongoDB cũ. |

Nguồn hợp đồng chữ ký và webhook: [payOS API](https://payos.vn/docs/api/), [quy tắc tạo chữ ký](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Shared types build | Qua |
| Backend typecheck và production build | Qua; build bao gồm PostgreSQL-only runtime audit |
| Backend full suite với PostgreSQL/Redis riêng | 1.572 test qua, 0 fail, 247 skipped |
| PayOS suite sau khi bổ sung kiểm tra serialization | 27 test qua |
| Web typecheck và production build | Qua |
| Web full suite | 941 test qua, 0 fail |
| Flutter unit/widget suite | 50 test qua |
| Python reviewer suite | 76 test qua, 13 subtests qua, 2 test OCR skipped do không có Tesseract |
| Web lint | Qua |
| Backend lint | 0 lỗi, 5 warning unused code có sẵn |
| Flutter analyze | 0 lỗi/warning, 19 thông báo info có sẵn về style |
| Jenkins shell syntax | Cả 8 khối shell qua `bash -n` |

Database test đã áp dụng thành công toàn bộ 92 migration. Các suite hồ sơ học thuật, xác minh giảng viên và mentorship đã chạy với cờ integration bật. Database và Redis dùng riêng cho audit đã được dọn sau kiểm tra; không chạy test trên database ứng dụng. Môi trường Python tạm đã được xóa. Các thay đổi và artifact có sẵn trước audit được giữ nguyên.

## Giới hạn xác minh

- 247 test backend vẫn skipped theo các điều kiện riêng của suite; không coi chúng là test đã qua.
- Chưa thực hiện giao dịch PayOS thật, pipeline Jenkins thật hoặc kiểm thử Android trên thiết bị/emulator trong lượt này.
- Hai test OCR cần Tesseract; đã thêm điều kiện prerequisite phù hợp cho test structured OCR và sửa fixture font/test mock để chạy được trên Windows.
- Python dependency cài theo requirements hiện tại phát sinh một cảnh báo deprecation từ Starlette/TestClient; không thay đổi dependency ngoài phạm vi sửa lỗi.
- Đây là các lỗi đã tái hiện và sửa trong lần rà soát này; kết quả test không chứng minh toàn bộ hệ thống không còn lỗi.

Không commit hoặc push. Gợi ý commit message: `fix: harden payment and session authentication and restore audit gates`.
