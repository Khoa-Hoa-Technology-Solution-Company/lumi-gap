# Kiểm thử luồng mời người phân xử

Ngày: 02/11/2026. Repository: `D:\lumi-gap`.

## Thay đổi đã triển khai

- Hồ sơ trung lập duy nhất cho mỗi vòng đang bất đồng, transaction/idempotency và partial unique indexes chống tạo trùng.
- Chính sách cố định: người chỉ định trước → Mentor chính đã nhận lời → Mentor phụ đã nhận lời → thành viên độc lập → Owner độc lập. Loại reviewer, người đề xuất, người mất quyền và ứng viên đã được mời trong cùng hồ sơ. Cùng mức ưu tiên cần điều phối độc lập chọn, có lý do.
- Lời mời nhận/từ chối, fallback, lịch sử phản hồi, báo cáo và xem xét xung đột lợi ích.
- Hai reviewer bổ sung riêng hoặc dùng phiếu đã ghi, cùng hạn mặc định 48 giờ; ẩn phần bổ sung đến khi cả hai xong hoặc hết hạn. Không phản hồi không phải đồng ý.
- Người đã nhận nhiệm vụ chỉ quyết định khi hồ sơ sẵn sàng, còn quyền, phiên bản còn đúng và có căn cứ. Kết quả được lưu riêng; không thêm reviewer/phiếu thứ ba. Thiếu nguồn/tiêu chí không được chốt loại.
- Khi phiếu thay đổi: lưu snapshot cũ, tăng phiên bản, yêu cầu đối chiếu lại và đặt lại hạn chung cho cả hai. Hai phiếu thống nhất thì đóng hồ sơ đang chờ. Mở lại kết quả phải có lý do; từng hồ sơ cũ giữ liên kết tới đúng quyết định cũ.
- Trang Hồ sơ phân xử bằng tiếng Việt, hai quan điểm đối xứng, lịch sử thu gọn, tải nguồn được cấp quyền, bảo vệ bản nháp và chặn request lỗi thời. Không có chat ba người.
- Tích hợp Việc của tôi, nhiệm vụ Mentor và notifications hiện có. Giữ bốn tab Papers. Quy trình hiện đại không còn bước đề xuất chung rồi xác nhận.

## File chính

Backend:

- `apps/backend/src/modules/projects/screening-case-context.ts`
- `apps/backend/src/modules/projects/screening-case.service.ts`
- `apps/backend/src/modules/projects/screening.service.ts`
- `apps/backend/src/modules/projects/screening-context.ts`
- `apps/backend/src/modules/projects/screening-adjudication-context.ts`
- `apps/backend/src/modules/projects/dto/screening.schema.ts`
- `apps/backend/src/modules/projects/screening.controller.ts`, `screening.routes.ts`

Database và types:

- `apps/backend/prisma/project-screening.prisma`
- `apps/backend/prisma/migrations/20261102000100_screening_adjudication_invitations/migration.sql`
- `apps/backend/prisma/migrations/20261102160000_screening_case_decision_link/migration.sql`
- `packages/shared-types/src/project-screening.ts`

Frontend:

- `apps/web/src/features/projects/components/screening-case-controls.tsx`
- `apps/web/src/features/projects/components/screening-adjudication.tsx`
- `apps/web/src/features/projects/components/screening-conflict-resolution.tsx`
- `apps/web/src/features/projects/components/screening-management.tsx`
- `apps/web/src/features/projects/components/screening-round.tsx`, `screening-workspace.tsx`
- `apps/web/src/features/projects/components/my-work-view.tsx`, `mentor-access-workspace.tsx`
- `apps/web/src/features/projects/api/screening.api.ts`

Chi tiết kiến trúc, phân quyền, API, phiên bản và tương thích: [screening v8](../project-paper-screening-v8.md).

## Kết quả test thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| PostgreSQL hồi quy: screening, slots, evidence, synthesis, collaborative research và adjudication | 165/165 đạt, 6 file |
| PostgreSQL bộ phân xử sau các bổ sung cuối | 19/19 đạt, gồm test mới thiếu nguồn/cần thêm thông tin và thông báo cho người đề xuất |
| Unit phân loại bất đồng và chính sách ứng viên dùng implementation mới | 11/11 đạt |
| Frontend case, adjudication, conflict, workspace, evidence sau sửa cuối | 67/67 đạt, 5 file |
| Backend typecheck | Đạt |
| Web typecheck | Đạt |
| Shared types build, Prisma generation | Đạt |

Các lần chạy focused lặp lại một phần bộ hồi quy, không cộng dồn thành số test duy nhất.

Lệnh và log:

- `node apps/backend/scripts/test-screening-cases.mjs --regression`: `2026-11-02-screening-cases-regression.log`.
- `node apps/backend/scripts/test-screening-cases.mjs`: `2026-11-02-screening-cases-focused.log`.
- `pnpm --filter backend exec vitest run src/modules/projects/__tests__/screening-disagreement-resolution.test.ts --maxWorkers=1 --minWorkers=1`: `2026-11-02-screening-cases-policy-tests.log`.
- `pnpm --filter web exec vitest run src/features/projects/__tests__/screening-case.test.tsx src/features/projects/__tests__/screening-adjudication.test.tsx src/features/projects/__tests__/screening-conflict-resolution.test.tsx src/features/projects/__tests__/screening-workspace.test.tsx src/features/projects/__tests__/evidence-workspace.test.tsx --maxWorkers=1 --minWorkers=1`: `2026-11-02-screening-cases-web-tests.log`.
- Typecheck: `2026-11-02-screening-cases-backend-typecheck.log`, `2026-11-02-screening-cases-web-typecheck.log`.

Các test PostgreSQL bao gồm gửi yêu cầu đồng thời, idempotency, hai ý kiến đồng thời, database constraints độc lập với service, quyền điều phối, Owner là reviewer/người đề xuất, Mentor chính/phụ, từ chối/thu hồi quyền, không có ứng viên, COI, phạm vi PDF và thay đổi hash, nội dung bổ sung được niêm phong, hạn chung, không có chat, một quyết định riêng duy nhất, không tạo phiếu thứ ba, packet/decision lỗi thời, tự thống nhất, mở lại và đọc lịch sử không lẫn kết quả.

Bộ synthesis hồi quy có cảnh báo từ mock embedding thiếu `embedBatch`; nhánh dự phòng được xử lý và các test đều đạt. Không gọi AI thật để quyết định khoa học.

## Kiểm thử giao diện

Chạy component thật với fixture trong bộ nhớ qua `apps/web/scripts/screening-case-preview.mjs`; chặn toàn bộ `/api/` ở preview. Đã thao tác:

- Nhận lời mời, chuyển từ chỉ thông tin lời mời sang được đọc packet.
- Ghi quyết định có lý do, nguồn và xác nhận; hiển thị kết quả, người phân xử và thời điểm.
- Reviewer dùng ý kiến đã ghi mà không cần nhập lại.
- Điều phối chọn trong nhóm cùng ưu tiên và nhập lý do trước khi gửi lời mời.
- Responsive: viewport mobile 390px (vùng nội dung 375px), scrollWidth bằng clientWidth, không tràn ngang.

Ảnh dùng dữ liệu giả lập, không phải kết luận cho bài thật:

- [Desktop](2026-11-02-screening-case-desktop.jpg)
- [Hoàn tất](2026-11-02-screening-case-completed.jpg)
- [Mobile](2026-11-02-screening-case-mobile.jpg)
- [Điều phối](2026-11-02-screening-case-coordinator.jpg)

## Cập nhật ứng dụng local

- Hai migration bổ sung đã áp dụng thành công vào PostgreSQL local bằng `db:migrate:deploy`; không reset/xóa dữ liệu.
- Backend và web đã build, khởi động lại thành công, healthcheck healthy. `/ready` xác nhận Redis và PostgreSQL sẵn sàng lúc 12:32 ngày 02/11/2026 (UTC+7).
- Đã đọc lại Papers và Quy trình review bằng phiên đăng nhập hiện có; bốn tab chính giữ nguyên. Phiên hiện có không có quyền Owner, nên không lưu cấu hình hoặc gửi lời mời thật.
- Phần chữ hướng dẫn cũ tìm thấy khi QA đã được sửa. Bản web cuối build thành công bằng `pnpm --filter web build` trên Windows, sau đó đóng gói dist vào nginx 1.27 bằng cấu hình nginx hiện có; Dockerfile của repository không thay đổi. Cách này tránh build nặng trong WSL đang thiếu RAM.
- Docker Desktop bị dừng trong lần cập nhật cuối; đã khởi động lại engine và các container hiện có, không xóa volume hoặc dữ liệu. `docker compose up -d --no-deps --no-build --wait --wait-timeout 60 backend web` hoàn tất thành công. Log: `2026-11-02-screening-cases-web-host-build.log`, `2026-11-02-screening-cases-web-runtime-build.log`, `2026-11-02-screening-cases-local-deploy-final.log`.
- Kiểm tra cuối lúc 13:21 ngày 02/11/2026 (UTC+7): backend healthy, web đang chạy; `http://localhost:4000/ready` trả `status: ready`, Redis và PostgreSQL đều `ok: true`. `/ready` trên cổng web 8080 là SPA fallback, không phải endpoint readiness của backend.
- Đã mở trang local bằng phiên đăng nhập hiện có sau lần cập nhật cuối: bốn tab Papers còn nguyên, hướng dẫn Quy trình review đã nói đúng về sửa phiếu và hồ sơ mời phân xử độc lập; Hàng đợi đánh giá tải đủ 3 bài, không xuất hiện lỗi 400 trên giao diện.
- Các thay đổi Evidence workspace trước đó và dữ liệu/lịch sử hiện có được giữ nguyên. Không commit/push.

## Giới hạn kiểm thử

Luồng ghi quyết định và lời mời được kiểm thử bằng PostgreSQL riêng và UI fixture. Không thực hiện quyết định khoa học hoặc gửi thông báo thử tới người dùng thật. Snapshot quy trình trước v5 giữ tương thích lịch sử; v5 trở đi dùng hồ sơ/lời mời cho luồng mới.
