# Sửa hành động nhờ phân xử trong modal đọc bài

Ngày: 02/11/2026. Repository: `D:\lumi-gap`.

## Nguyên nhân

1. `roundView.canRequestAdjudication` và API mở hồ sơ còn yêu cầu đủ trao đổi từ hai reviewer hoặc ngoại lệ chờ/escalation. Component có nút nhưng quyền từ backend khiến nút bị ẩn.
2. Modal đọc bài dùng nhánh `COLLABORATIVE` riêng cho snapshot cũ. Nhánh đó có cảnh báo, sửa ý kiến và lịch sử nhưng không hiển thị component giải quyết bất đồng mới.
3. Có một form yêu cầu phân xử cũ bắt nhập lý do riêng, nằm ngoài nhánh bất đồng; đã bỏ form dư này để dùng một confirmation trung lập.

## Thay đổi

- Backend kiểm tra đúng hai reviewer khác nhau, hai phiếu hiện hành hợp lệ, đúng phạm vi vòng, phân loại đang bất đồng, vòng còn hoạt động, người gửi đã nộp phiếu và chưa có kết quả. Không đòi số lượng tin nhắn hoặc thời gian chờ để mở hồ sơ.
- Giữ transaction khóa Project, idempotency và partial unique indexes hiện có. Hai yêu cầu đồng thời cùng nhận một hồ sơ; API không nhận lựa chọn ứng viên từ người mở hồ sơ.
- Các vòng cộng tác lịch sử có đúng cặp phiếu đủ điều kiện được dùng cùng hồ sơ mời phân xử, giữ snapshot quy trình và lịch sử. Khi hồ sơ đã mở, không thể thêm ý kiến/reviewer thứ ba qua API cộng tác cũ hoặc gán người chốt trực tiếp. Hai phiếu sửa lại thống nhất thì đóng hồ sơ theo luồng hiện có.
- Sau phần trao đổi trong modal có “Sửa đánh giá của tôi” và “Nhờ người phân xử”. Confirmation mô tả gói tự đính kèm; không có ô tường trình thay bên kia hay chọn người phân xử. Nút gửi bị vô hiệu nếu mất quyền/vòng đóng trong khi dialog còn mở; lỗi gửi hiển thị ngay trong dialog.
- Gửi thành công làm mới modal và các query workspace dùng chung. Thay yêu cầu mới bằng liên kết “Hồ sơ phân xử”, hiển thị thu thập ý kiến/hạn chung, trạng thái lời mời, danh tính và vai trò người nhận nhiệm vụ. Hồ sơ đã hoàn tất vẫn có liên kết trong chi tiết kết quả.
- Tái sử dụng chính sách chỉ định trước → Mentor chính → Mentor phụ → thành viên độc lập → Owner độc lập, nhận/từ chối/fallback, hai ý kiến riêng cùng hạn 48 giờ mặc định và niêm phong, quyết định có căn cứ lưu riêng. Không thêm chat với người phân xử hay phiếu reviewer thứ ba.
- Không thêm migration hoặc hardcode Project ID. Không gửi lời mời/quyết định trên dữ liệu thật khi QA.

## File chính

- `apps/backend/src/modules/projects/screening-case.service.ts`
- `apps/backend/src/modules/projects/screening-context.ts`
- `apps/backend/src/modules/projects/screening.service.ts`
- `apps/backend/src/modules/projects/library-assessment.service.ts`
- `apps/web/src/features/projects/components/screening-conflict-resolution.tsx`
- `apps/web/src/features/projects/components/screening-round.tsx`
- `apps/web/src/features/projects/components/screening-case-status.tsx`
- `packages/shared-types/src/project-screening.ts`
- Test: `screening-case.persistence.test.ts`, `screening.persistence.test.ts`, `screening-conflict-resolution.test.tsx`.

## Test thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend: conflict/modal thật, workspace, case, adjudication, evidence | 77/77 đạt, 5 file |
| Backend PostgreSQL hồi quy ban đầu | 167/170 đạt; hai timeout 20 giây khi máy tải nặng, một lỗi fixture mới đã cố sửa phiếu trong bảng append-only |
| PostgreSQL chạy lại toàn bộ bộ phân xử và test hồi quy thiếu nguồn/tiêu chí | 24/24 đạt, gồm cả ba trường hợp chưa đạt ban đầu; 146 test ngoài bộ lọc bỏ qua trong lần chạy này |
| Backend/web typecheck | Đạt |
| Shared types build | Đạt |
| Backend build và PostgreSQL runtime audit | Đạt; runtime audit 4/4 |
| Web production build và bundle budget | Đạt |
| Kiểm tra whitespace các file sửa | Đạt |

Fixture đã sửa bằng cách thêm phiên bản phiếu, không cập nhật phiếu cũ. Timeout được kiểm tra lại với giới hạn 60 giây; không thay đổi giới hạn mặc định của ứng dụng hoặc Vitest config. Tổng cộng 170 kịch bản PostgreSQL được bao phủ qua lần hồi quy và lần chạy lại, không cộng trùng 24 test.

Lệnh:

```powershell
node apps/backend/scripts/test-screening-cases.mjs --regression
node apps/backend/scripts/test-screening-cases.mjs --regression --slow '--testNamePattern=independent adjudication invitations|V8 adjudication rejects absent sources'
pnpm --filter web exec vitest run src/features/projects/__tests__/screening-conflict-resolution.test.tsx src/features/projects/__tests__/screening-workspace.test.tsx src/features/projects/__tests__/screening-case.test.tsx src/features/projects/__tests__/screening-adjudication.test.tsx src/features/projects/__tests__/evidence-workspace.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter backend build
pnpm --filter web build
```

Log theo tiền tố `2026-11-02-screening-request-` trong thư mục audit, gồm `backend.log`, `backend-rerun.log`, `web-final.log`, các log typecheck/build/image/deploy. Log synthesis có cảnh báo mock embedding thiếu `embedBatch` đã được xử lý; test đạt, không gọi AI để quyết định khoa học.

## Ứng dụng local và giới hạn

- Build trên Windows, đóng gói dist vào image backend hiện có (giữ dependency/runtime) và nginx 1.27 với cấu hình có sẵn, tránh build nặng trong WSL. Dockerfile repository không thay đổi. Không cần migration mới.
- Có fixture trực quan dùng modal thật tại `apps/web/scripts/screening-request-preview.mjs`, chặn API thật. Trình duyệt tích hợp hiện bị timeout khi gắn tab, nên chưa có ảnh kiểm tra trực quan mới. Luồng mở modal, confirmation, gửi API và cập nhật trạng thái được kiểm tra tự động bằng component thật trong jsdom cho cả INDEPENDENT và COLLABORATIVE.
- `docker compose up -d --no-deps --no-build --wait --wait-timeout 60 backend web` thành công. Sau đó Docker WSL hết RAM khả dụng (khoảng 4 GB, không swap), làm readiness timeout. Đã khởi động lại Docker Desktop và riêng distro `docker-desktop`; không xóa volume/dữ liệu hoặc thay đổi cấu hình RAM hệ thống.
- Kiểm tra cuối lúc **13:59:43 ngày 02/11/2026 (UTC+7)**: backend/PostgreSQL/Redis healthy, web đang chạy. `http://localhost:4000/ready` trả `status: ready`, Redis/PostgreSQL đều `ok: true`, latency 5 ms.
- HTML tại cổng 8080 khớp chính xác artifact web vừa build. SHA-256 của `dist/modules/projects/screening-case.service.js` trong backend container khớp file build trên máy (`b8d5568dd1f0e117caf31cfdcd71c76f832084d6e6adb49b3cd71af384f32f2a`). Không commit/push.
