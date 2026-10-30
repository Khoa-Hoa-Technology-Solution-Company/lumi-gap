# Mời cố vấn và kiểm soát truy cập

## Luồng sử dụng

1. Chủ dự án mở **Tìm cố vấn**, chọn người và cấu hình quyền, nội dung chia sẻ, hạn truy cập trước khi gửi lời mời.
2. Cố vấn xem thông tin công khai cùng quyền đề xuất rồi chấp nhận hoặc từ chối. Cố vấn cũng có thể gửi đề nghị hỗ trợ; khi đó chủ dự án là bên xác nhận.
3. Chỉ sau khi hai bên đồng ý, quan hệ cố vấn và chính sách truy cập mới có hiệu lực.
4. Chủ dự án có thể bổ sung tài nguyên, điều chỉnh quyền, ngừng chia sẻ từng mục hoặc thu hồi toàn bộ quyền.
5. Cố vấn mở `/academic-support/projects/:projectId`, đọc nội dung được duyệt, trao đổi hoặc nhận xét theo quyền được cấp.
6. Nhóm xử lý phản hồi và hai bên có thể thống nhất cách ghi nhận đóng góp.

`OWNER` trong mô hình hiện tại là người quản lý quyền của nhóm, tương ứng Owner/Leader trong yêu cầu. Thành viên khác được đọc và xử lý phản hồi theo quyền cộng tác hiện có, nhưng không quản lý quyền hoặc xác nhận thỏa thuận thay chủ dự án. Cố vấn không được tự thêm vào thành viên dự án.

Trạng thái lời mời hiển thị: chờ phản hồi, chấp nhận, từ chối, hủy, hết hạn. Giữ nguyên các trạng thái và lịch sử nội bộ của hệ thống cũ, ánh xạ `DECLINED` thành `REJECTED` và các lý do đóng thành `CANCELLED` khi trình bày quyền truy cập.

## Quyền và tài nguyên là hai điều kiện riêng

| Mục | Observer | Advisor mặc định | Reviewer |
| --- | --- | --- | --- |
| Tổng quan, bài báo, gap, công việc, cột mốc | Đọc nội dung đã chia sẻ | Đọc, nhận xét/đề xuất theo loại | Như Advisor |
| Phần bản thảo đã duyệt | Đọc | Đọc, nhận xét, đề xuất sửa | Thêm phản biện |
| Kênh trao đổi riêng | Không | Có | Có |
| Thông tin nộp bài, đóng góp | Đọc mục đã chia sẻ | Đọc mục đã chia sẻ | Đọc mục đã chia sẻ |
| Quản trị, xóa dữ liệu, chat nhóm, chốt screening | Không | Không | Không |
| LaTeX, ZIP, tài sản, lịch sử nguồn | Không | Không | Không |

Có 16 quyền chi tiết trong `packages/shared-types/src/mentor-access.ts`. Quyền nhận xét/đề xuất phải đi kèm quyền xem cùng mục. Các preset là điểm bắt đầu và có thể tùy chỉnh.

Quyền xem không tự công khai dữ liệu. Tài nguyên phải được chủ dự án chọn và duyệt nội dung. Reviewer ở đây là preset cố vấn; không tự tạo phân công phản biện học thuật chính thức.

## Nội dung được chia sẻ

- Lưu bản văn bản đã duyệt riêng, không trả trực tiếp bản ghi nội bộ hay cập nhật tự động theo bản gốc.
- Với bản thảo, chọn từng phần như Abstract, Introduction, Methodology, Results, Discussion. Chủ dự án dán nội dung hiển thị của phần đã chọn và xác nhận trước khi chia sẻ.
- Không tự phân tích PDF hoặc chuyển toàn bộ LaTeX thành phần chia sẻ. Bộ chọn bản thảo chỉ lấy tên và ID, không lấy nguồn.
- Giao diện hiển thị văn bản thông thường; không thực thi HTML hoặc lệnh LaTeX trong nội dung được dán. Một số lệnh khai báo/nhập nguồn LaTeX bị từ chối để tránh dán nhầm tài liệu nguồn.
- Đăng lại cùng tài nguyên/phần sẽ tạo bản chia sẻ mới và thu hồi bản trước. Phản hồi cũ vẫn liên kết với bản cũ.
- Tối đa 100 mục đang chia sẻ mỗi chính sách, tối đa 30 mục thêm trong một lần cấu hình; mỗi nội dung tối đa 50.000 ký tự.
- Danh sách chỉ trả metadata. Khi mở một phần, giao diện gọi API nội dung riêng và backend kiểm tra quyền lại.

Thông tin trước khi tham gia dùng cơ chế công khai cố vấn hiện có: tiêu đề, tóm tắt đã xuất bản, lĩnh vực/chủ đề/từ khóa và nhu cầu hỗ trợ. Mục tóm tắt công khai dùng để nhóm trình bày mục tiêu nghiên cứu; không tự lấy mục tiêu hoặc mô tả riêng từ kế hoạch nội bộ.

## Kiểm soát đồng thời và bảo mật

- Mọi request kiểm tra tài khoản đang hoạt động, giảng viên đã xác minh, đúng quan hệ/dự án, chính sách còn hạn, tài nguyên và quyền tương ứng.
- Dùng transaction và cơ chế khóa dự án/tài khoản hiện có để tuần tự hóa thay đổi quyền với thao tác đọc/ghi liên quan.
- Cấu hình, chia sẻ và thu hồi dùng phiên bản để từ chối thao tác từ màn hình cũ.
- Chấp nhận lời mời dùng `expectedAccessVersion`. Nếu quyền/nội dung đã thay đổi, người nhận phải xem lại. Lời mời v1 chưa sửa vẫn tương thích client cũ.
- Phản hồi và đề xuất thỏa thuận dùng khóa gửi lại ổn định. Gửi trùng cùng nội dung trả cùng bản ghi; dùng lại khóa cho nội dung khác bị từ chối.
- Backend chặn đọc/ghi khi hết hạn hoặc thu hồi ngay ở request tiếp theo. UI cập nhật quyền qua polling 5 giây và không tiếp tục hiển thị cache khi nhận 401/403/404.
- Không thể thu hồi những nội dung người nhận đã đọc hoặc tự lưu trước đó.
- API trả `Cache-Control: private, no-store`, dùng xác thực hiện có, Zod và `createRateLimiter`.
- Cache giao diện tách theo người dùng và phiên bản chính sách; DTO `viewerId` là ID chuẩn, kể cả khi JWT dùng ID cũ.
- Dự án lưu trữ/hoàn thành chỉ được đọc; chủ dự án vẫn thu hồi quyền hoặc ngừng chia sẻ được.

## Phản hồi, thỏa thuận và lịch sử

Kênh trao đổi thuộc đúng một quan hệ cố vấn, tách khỏi chat nội bộ. Phản hồi tài nguyên liên kết với bản chia sẻ và phần cụ thể.

`PENDING → ACCEPTED / REJECTED / RESOLVED`; `ACCEPTED → RESOLVED`. Không mở lại phản hồi đã từ chối hoặc giải quyết. Lưu người gửi, người xử lý, thời điểm, giải thích và phiên bản xử lý.

Vai trò CRediT ghi nhận cùng phản hồi và đề xuất thỏa thuận. Thỏa thuận phải do bên còn lại chấp nhận/từ chối; người đề xuất chỉ được rút lại. Có checkbox xác nhận rõ ràng trên giao diện. Không tự tạo đồng tác giả hoặc tỷ lệ đóng góp.

Nội dung đã xuất bản, phản hồi gốc, đề xuất thỏa thuận và sự kiện được bảo vệ bằng trigger lịch sử trong PostgreSQL. Mỗi lần thay đổi quyền, chia sẻ, xử lý phản hồi hoặc trả lời thỏa thuận tạo sự kiện riêng. Cố vấn chỉ nhận metadata lịch sử cần thiết, không nhận chi tiết thay đổi nội bộ của nhóm.

## Cơ sở dữ liệu và API

Migration: `apps/backend/prisma/migrations/20261028140000_mentor_resource_access/migration.sql`.

Thêm 5 mô hình: `MentorAccess`, `MentorResourceShare`, `MentorFeedback`, `MentorAgreement`, `MentorAccessEvent`. FK tổng hợp giữ đúng phạm vi lời mời, quan hệ, dự án và bản chia sẻ. Quan hệ cũ được backfill với quyền rỗng và không có nội dung tự chia sẻ; không xóa lịch sử.

Tiền tố mới: `/api/v1/projects/:id/mentor-access`.

| Method | Đường dẫn | Chức năng |
| --- | --- | --- |
| GET | `/`, `/catalog` | Không gian cố vấn, bộ chọn tài nguyên |
| PUT | `/:accessId` | Cấu hình quyền, hạn và thêm nội dung |
| POST | `/:accessId/revoke` | Thu hồi toàn bộ quyền |
| POST | `/:accessId/shares` | Xuất bản một mục được duyệt |
| GET | `/:accessId/shares/:itemId` | Đọc nội dung sau khi kiểm tra quyền |
| POST | `/:accessId/shares/:itemId/revoke` | Ngừng chia sẻ một mục |
| GET, POST | `/:accessId/feedback` | Danh sách, gửi trao đổi/phản hồi |
| PUT | `/:accessId/feedback/:itemId` | Nhóm xử lý phản hồi |
| GET | `/:accessId/history` | Lịch sử quyền và hoạt động |
| GET, POST | `/:accessId/agreements` | Danh sách, đề xuất thỏa thuận |
| POST | `/:accessId/agreements/:itemId/respond` | Chấp nhận, từ chối, rút đề xuất |

Danh sách dùng trang 20 mục. Lời mời và chấp nhận tiếp tục dùng API mentorship hiện có, mở rộng trường `access` và `expectedAccessVersion`.

## Chuyển tiếp từ chức năng cũ

- API research, context AI, kế hoạch, chat và snapshot nguồn không còn dùng quan hệ cố vấn để cấp quyền vào không gian nội bộ.
- Nhóm tiếp tục đọc lịch sử plan-share và thảo luận snapshot cũ. Nút mới dẫn sang Support để chọn nội dung đã duyệt; không tạo yêu cầu chia sẻ toàn bản thảo mới.
- URL `/projects/:id/plan-review` dẫn đến không gian cố vấn có giới hạn.
- Thông báo workspace cũ không gửi tới người chỉ có vai trò cố vấn vì đích đến là không gian riêng của nhóm.
- Phân công phản biện chính thức theo artifact vẫn dùng luồng và quyền riêng.

## Kiểm thử và vận hành

```powershell
node apps/backend/scripts/test-mentor-access.mjs
node apps/backend/scripts/test-mentor-access.mjs --regression
node apps/backend/scripts/test-mentor-access.mjs --legacy
node apps/web/scripts/mentor-access-browser.mjs
pnpm --filter backend build
pnpm --filter web build
```

Runner backend chỉ chấp nhận PostgreSQL local và tự dùng database riêng `lumigap_mentor_access_v1_test`; chạy `migrate deploy`, không thay đổi DB ứng dụng. Các fixture lịch sử bất biến được giữ trong DB thử nghiệm để không vô hiệu hóa trigger bảo vệ.

Kiểm thử mới gồm đồng thuận hai bên, chặn cấp quyền cho bản thân, phân quyền tài nguyên/phần bản thảo, LaTeX/ZIP, truy cập chéo dự án, thu hồi/hết hạn, cache, khóa gửi lại, tranh chấp phiên bản, thỏa thuận và ID đăng nhập cũ. Kiểm thử trình duyệt component dùng API giả lập và kiểm tra desktop, mobile, modal quyền, tải nội dung khi mở, ẩn nội dung khi mất quyền; ảnh nằm trong `docs/audits/2026-10-28-mentor-access/`.

Kết quả ngày 2026-10-28:

| Kiểm tra | Kết quả |
| --- | --- |
| Backend `--regression` | 98/98 qua, 4 suite |
| Backend `--legacy` | 83/83 qua, 4 suite |
| Tổng backend không đếm lặp suite mentor-access | 162 trường hợp, 7 suite |
| Frontend: mentor-project, academic-support, mentorship-invitation-content, mentor-discovery-settings, workspace-coordination, workspace-draft-retries | 90/90 qua, 6 suite |
| PostgreSQL runtime audit | 4/4 qua |
| Backend typecheck, shared-types/backend/web build | Qua |
| ESLint trên các file tính năng và kiểm thử liên quan | Không lỗi/cảnh báo |
| Chromium component smoke và kiểm tra ảnh desktop/mobile/modal | Qua |
| `git diff --check` | Qua |

Các bộ kiểm thử trên có phạm vi nêu rõ, không phải toàn bộ repository. Đã cập nhật hợp đồng của các kịch bản browser tích hợp `manuscripts.e2e.test.ts` và `research-task-board.e2e.test.ts`; chưa chạy lại hai suite này vì cần môi trường app/Redis/compiler riêng tại các cổng cấu hình trong fixture. Smoke Chromium ở trên dùng component thật với API giả lập.

### Triển khai

1. Áp dụng toàn bộ migration chưa chạy trong đúng môi trường bằng `pnpm --filter backend db:migrate:deploy`, sau đó kiểm tra `db:migrate:status`.
2. Generate Prisma, build shared-types trước, rồi build/restart backend và web cùng phiên bản. Không build shared-types đồng thời với build/typecheck phụ thuộc vì build xóa `dist` trước.
3. Chủ dự án duyệt lại quyền và nội dung cho các quan hệ cố vấn cũ; backfill không công khai dữ liệu.

Trong lượt triển khai này chỉ migrate DB thử nghiệm, chưa migrate DB ứng dụng hoặc rebuild container đang phục vụ localhost.

### Giới hạn hiện tại

- Chia sẻ phần bản thảo là văn bản hiển thị đã được chủ dự án duyệt thủ công; chưa hỗ trợ chọn vùng PDF hoặc tự tách phần LaTeX.
- Hết hạn chặn truy cập, nhưng chưa tự kết thúc quan hệ hoặc trả lại suất nhận cố vấn. Chủ dự án/cố vấn kết thúc quan hệ hoặc thu hồi để giải phóng suất.
- Hoạt động mới hiện lưu bền vững và cập nhật trong workspace qua polling; chưa gửi thông báo riêng cho từng phản hồi/thỏa thuận mới.
