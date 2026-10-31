# Đánh giá đóng góp V1 — triển khai ngày 28/10/2026

## Chức năng

Đã bổ sung tab **Đánh giá đóng góp** trong mục Đóng góp của project, theo [đặc tả V1](project-contribution-evaluation-v1-spec.md).

1. Chủ dự án công bố quy tắc có phiên bản, mặc định trọng số 1, giới hạn tùy chỉnh không quá 100.
2. Chủ dự án hoặc người tham gia gộp các hồ sơ mô tả cùng kết quả, đề xuất trọng số, lý do và phần tham gia. Mỗi hồ sơ chỉ thuộc một kết quả; chỉnh sửa tạo phiên bản mới.
3. Chủ dự án xác nhận trọng số riêng. Từng người được ghi tên, kể cả người đề xuất/chủ dự án, xác nhận đúng hash dữ liệu. Gửi đề xuất không tự xác nhận. Một phản đối có lý do chặn kết quả khỏi tập tính.
   Phản đối giữ qua mọi phiên bản sửa. Chỉ chính người phản đối có thể xác nhận giải quyết trên bản mới hơn bằng quyết định `RESOLUTION` có giải thích. Xác nhận trọng số/tham gia không thay thế bước này; còn bất kỳ phản đối nào thì kết quả vẫn `DISPUTED`.
4. Thành viên yêu cầu tính trong kỳ phân bổ. BullMQ xử lý trên worker `ai-jobs`, lưu snapshot bất biến; giao diện theo dõi trạng thái và lịch sử.
5. Chủ dự án so sánh gợi ý với bản phân bổ đang nhập. Chỉ thao tác chọn rõ ràng mới gắn snapshot vào bản nháp. Không tự điền hoặc thay tỷ lệ. Sai khác phải có lý do; quy trình đồng thuận cũ tiếp tục áp dụng.

### Thuật toán và hiệu năng

`rawScore_i = Σ weight_j × participationBasisPoints_ij`. Dùng `BigInt`, chuẩn hóa UUID, kiểm tra tổng phần tham gia đúng 10000, làm tròn theo phần dư lớn nhất với UUID tăng dần khi hòa. Không có hệ số chất lượng Q. Khi không có đầu vào đủ xác nhận, tỷ lệ là `null`, không tự chia đều.

Bộ tính sử dụng bảng tra theo người; phần dư được sắp xếp một lần. Dữ liệu nguồn được đọc đủ bằng cursor 250 hồ sơ/lần. Service dùng Map/Set để ghép nguồn, kết quả, quyết định và roster, tránh quét lặp toàn bộ bảng cho mỗi kết quả. Phân trang giao diện không cắt tập đầu vào tính điểm.

### Tính nhất quán và quyền truy cập

- Transaction theo thứ tự khóa account → project. Hai đề xuất cạnh tranh cùng phiên bản chỉ một được ghi; tính và phản đối đồng thời tạo một trạng thái nhất quán.
- Snapshot giữ quy tắc, phạm vi, roster, nguồn/phiên bản, phần tham gia, quyết định, nguyên nhân loại, điểm nguyên, quy tắc làm tròn và SHA-256 đầu vào. PostgreSQL bảo vệ quy tắc/đề xuất/quyết định/snapshot bằng trigger bất biến.
- Bộ đếm phiên bản dữ liệu phía database đánh dấu snapshot cũ khi nguồn, quy tắc, quyết định hoặc lịch sử thành viên đổi. Việc đánh dấu mang tính bảo thủ trên toàn project.
- Người đã rời nhóm được phản hồi hồ sơ liên quan bằng trang giới hạn, kể cả khi bản sửa gỡ tên họ khỏi một nguồn trong nhóm hồ sơ. Không được mở snapshot đầy đủ hoặc workspace; minh chứng riêng và liên kết artifact được bỏ khỏi bản xem giới hạn.
- Người từng phản đối cũng giữ quyền xem tóm tắt/giải quyết ý kiến của chính mình sau khi rời nhóm. Thông báo phiên bản mới gửi tới cả những người còn phản đối từ lịch sử.
- API lấy danh tính từ phiên đăng nhập, DTO strict và rate limiter dùng chung. ID/hash/phiên bản được kiểm tra; FK kép chặn liên kết chéo project.
- Quy tắc đổi hoặc nguồn sửa yêu cầu đề xuất/xác nhận mới. Phiên bản cũ mở từ thông báo dẫn tới bản mới và không còn nút xác nhận.
- Retry đề xuất trả đủ lịch sử quyết định/phản đối và đúng quyền thao tác hiện tại. Retry lần tính đã xong trả đúng snapshot đã lưu, kể cả sau khi quy tắc đổi; yêu cầu mới vẫn phải dùng quy tắc hiện hành.
- Yêu cầu chạy được lưu trước khi enqueue; retry dùng khóa idempotency, 5 lần thử với backoff. Worker khôi phục yêu cầu QUEUED khi khởi động. Không công bố snapshot một phần khi transaction lỗi.

## Dữ liệu và API

Migrations cần áp theo thứ tự:

- `apps/backend/prisma/migrations/20261028090000_contribution_evaluation_v1/migration.sql`.
- `apps/backend/prisma/migrations/20261028091000_contribution_evaluation_objection_resolution/migration.sql`: cho phép quyết định giải quyết phản đối và ràng buộc xác nhận/có lý do tại database.

Các bảng mới: `contribution_evaluation_rules`, `contribution_outcomes`, `contribution_outcome_sources`, `contribution_outcome_evaluations`, `contribution_evaluation_decisions`, `contribution_evaluation_states`, `contribution_evaluation_runs`, `contribution_evaluation_snapshots`. Thêm tham chiếu và bản giải thích vào `allocation_revisions`; không chuyển đổi tỷ lệ phân bổ cũ.

Tiền tố API: `/projects/:id/contributions/evaluation`.

| Endpoint | Chức năng |
| --- | --- |
| GET/POST `/rules` | Xem/công bố quy tắc |
| GET `/board?periodId=...&page=...` | Kết quả và độ bao phủ toàn kỳ |
| POST `/outcomes` | Đề xuất/phiên bản sửa |
| GET `/outcomes/:itemId` | Dữ liệu xác nhận giới hạn theo quyền |
| POST `/outcomes/:itemId/decisions` | Xác nhận trọng số/tham gia hoặc phản đối |
| POST `/runs` | Lưu yêu cầu và enqueue, HTTP 202 |
| GET `/runs/:itemId` | Trạng thái chạy |
| GET `/snapshots?periodId=...&page=...` | Lịch sử có phân trang |
| GET `/snapshots/:itemId` | Bản tính đầy đủ cho thành viên hiện tại |

## Kiểm chứng đã thực hiện

### Rà soát logic bổ sung ngày 28/10/2026

- Backend: 12 bài PostgreSQL/HTTP, 7 bài bộ tính và 5 bài quy tắc phản đối: đạt (24 bài). Kiểm tra phản đối qua nhiều bản sửa, từng người tự giải quyết, người phản đối đã rời nhóm, snapshot bất biến, retry sau đổi quy tắc và phản hồi đề xuất đã bị thay thế.
- Frontend: 7 bài UI đánh giá và 12 bài bản dịch/static text: đạt (19 bài). Xác nhận trọng số giữ nội dung phản đối đang soạn; giải quyết yêu cầu lý do riêng; khóa ô nhập khi đang gửi để phản hồi muộn không xóa nội dung mới.
- Migration bổ sung đã áp thành công trên database test riêng; backend/web typecheck và ESLint các file thay đổi đạt. Chưa áp vào database ứng dụng.

### Kiểm chứng triển khai ban đầu

- Replay toàn bộ migrations từ database trống trên PostgreSQL 16 + pgvector: đạt. Prisma generate: đạt.
- Backend: 7 bài tính toán, 10 bài PostgreSQL/HTTP, 7 bài governance domain, 5 bài quy tắc contribution: đạt (29 bài khác nhau).
- Frontend: 5 bài đánh giá mới, 9 bài governance hiện tại, 40 bài điều hướng thông báo, 12 bài bản dịch/static text: đạt (66 bài khác nhau).
- Typecheck backend, web (`tsc -b`) và build shared-types: đạt. ESLint các file triển khai mới, allocation và test mới: không lỗi/cảnh báo.
- PostgreSQL thật kiểm tra: 60/40/0; tổng 10000; nguồn gộp chỉ tính một lần; loại kết quả có phần việc ngoài kỳ; 505 nguồn qua 26 trang; snapshot và quyết định bất biến; source/rule đổi; tranh chấp; hai phiên bản cạnh tranh; tính đồng thời phản đối; người rời nhóm; giả danh; chéo project; hash không khớp; gắn snapshot và lý do điều chỉnh.
- Trình duyệt với API, PostgreSQL và Redis thật trên môi trường test: chủ dự án sửa đề xuất, hai tài khoản xác nhận riêng, worker tính COMPLETED, so sánh/gắn snapshot không điền các ô phân bổ. Không lỗi JavaScript; không tràn trang ở 390px. Bảng so sánh nhiều cột cuộn trong vùng riêng.
- Ảnh: [desktop](audits/2026-10-28-contribution-evaluation/evaluation-desktop.png), [mobile](audits/2026-10-28-contribution-evaluation/evaluation-mobile.png), [sau xác nhận](audits/2026-10-28-contribution-evaluation/evaluation-after-consent.png).

### Chạy lại kiểm thử persistence

Dùng PostgreSQL/Redis test riêng. Không trỏ các lệnh sau vào dữ liệu ứng dụng:

```powershell
$env:DATABASE_URL = '<PostgreSQL URL có tên database kết thúc bằng _test>'
$env:REDIS_URL = '<Redis test URL>'
$env:NODE_ENV = 'test'
$env:EMAIL_DELIVERY_MODE = 'disabled'
$env:CONTRIBUTION_EVALUATION_INTEGRATION = '1'
pnpm --filter backend db:migrate:deploy
pnpm --filter backend exec vitest run src/modules/projects/__tests__/contribution-evaluation.calculator.test.ts src/modules/projects/__tests__/contribution-evaluation.persistence.test.ts src/modules/projects/__tests__/contribution-evaluation.rules.test.ts --maxWorkers=1 --minWorkers=1
```

Test persistence cũng được đưa vào script `backend test:integration`, bật cùng cờ tích hợp đang dùng trong CI. Không bật worker khi chạy bộ test service để tránh xử lý nền ngoài kịch bản kiểm thử.

## Bật trên môi trường ứng dụng

Database ứng dụng từ `.env` là local `127.0.0.1:5433`. Khi kiểm tra cuối, container PostgreSQL ứng dụng đang dừng và lệnh đọc trạng thái migration không kết nối được. **Chưa áp migration vào database ứng dụng, chưa rebuild bản Docker ở cổng 8080.** Mọi dữ liệu fixture nằm trên database/Redis test riêng; không thay tỷ lệ đóng góp của project thật.

Sau khi PostgreSQL ứng dụng hoạt động, với đúng `.env` của môi trường cần chạy:

```powershell
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:generate
```

Khởi động lại backend và worker `ai-jobs` bằng mã mới; web cần build mới. Nếu chạy Docker Compose, build image backend/web và dùng luồng migrate của Compose trước khi backend/worker khởi động. Worker thông báo đang có tiếp tục dùng outbox hiện tại.

## Giới hạn cần giữ rõ

- Đây là gợi ý có giải thích, chưa có bằng chứng thực nghiệm chứng minh công bằng tuyệt đối. Chưa thực hiện khảo sát thành viên hoặc so sánh với thỏa thuận thực tế.
- Hệ thống chặn tính trùng qua liên kết hồ sơ; chưa tự phát hiện trùng ý nghĩa giữa các kết quả khai báo khác nhau.
- Không ước lượng được phần công việc chưa đăng ký. Độ bao phủ theo số kết quả không phải tỷ lệ tổng công sức.
- Email thật chưa được gửi/kiểm chứng; test tắt email. Web có tiếng Việt/Anh, client Flutter chưa bổ sung giao diện đánh giá.
