# Academic Mentorship — implementation report

Ngày kiểm tra: 2026-10-07. Trạng thái: đã triển khai workflow V1, migration và Docker local. SMTP thực tế chưa được gửi thử; kiểm thử email dùng mock.

## 1. Kiến trúc mentorship trước thay đổi

Repository thực tế dùng React/Vite + TypeScript, Express, Prisma và PostgreSQL. Model `MentorRelationship` cũ gộp lời mời và quan hệ, với `PENDING`, `ACCEPTED`, `ENDED` trên cùng bảng. Đã tái sử dụng User, AcademicProfile, Lecturer Verification, ProjectMember, ProjectActivity, Notification, BullMQ, SMTP và AuditLog hiện có.

Nguồn dữ liệu chuẩn mới là `MentorshipRequest` cho consent và `MentorRelationship` cho quan hệ đã được hai bên chấp thuận. Không thêm User/Project/permission framework hay microservice mới. Formal Academic Review tiếp tục dùng ReviewRequest và ReviewerAssignment riêng.

## 2. Mentoring availability

Tái sử dụng `AcademicProfile.supportAvailability.enabled` cho Lecturer, mặc định OFF khi chưa có lựa chọn. Chuyển từ Student/Researcher sang Lecturer đặt OFF để tùy chọn hỗ trợ nghiên cứu chung không tự trở thành opt-in mentorship.

Backend chỉ cho bật khi tài khoản ACTIVE, email đã xác minh, academicRole LECTURER, roleVerificationStatus VERIFIED và positionStatus VERIFIED. Vai trò hệ thống ADMIN không thay thế eligibility này.

OFF chặn lời mời mới, đề nghị mới và discovery cơ hội; giữ nguyên pending requests, active relationships và profile search thông thường. Pending requests đã có vẫn được chấp nhận/từ chối. Availability ON/OFF không gửi notification/email.

## 3. Available Mentor search/discovery

Chủ dự án tìm mentor từ Academic Support, theo tên, institution, research area, research interest và current position. Backend chỉ trả Lecturer đủ eligibility, đang ON và cho phép khám phá profile. Có pagination và thứ tự xác định: số term trùng, cùng institution, tên, ID. UI giải thích các term trùng, không hiển thị điểm uy tín.

Các field expertise/research interests riêng tư không tham gia tìm kiếm hoặc matching; profile PRIVATE bị loại. Không trả email công việc, staff ID, tài liệu xác minh, admin notes hay scholarly link riêng tư. SQL dùng tham số Prisma.

## 4. Team → Lecturer invitation

Project Owner → Find a Mentor → chọn Lecturer → nhập lời nhắn bắt buộc (1–1000 ký tự) → Send Invitation. V1 chỉ owner được quản lý Academic Support; ordinary member không tự có quyền mời/cancel/accept/end.

Tạo request `PROJECT_TO_LECTURER / PENDING`; không tạo relationship hoặc ProjectMember. Lecturer chỉ đọc preview gồm title, owner-written mentorshipSummary, research field, stage, expertise cần hỗ trợ và thông tin người gửi an toàn. Chấp nhận kiểm tra lại quyền người gửi, verification, project lifecycle, membership conflict và capacity trong transaction.

## 5. Lecturer → Team offer

Lecturer VERIFIED và availability ON khám phá project `SEEKING_MENTOR`. Project visibility và mentorship discovery độc lập: PRIVATE + SEEKING_MENTOR hợp lệ. General private description, papers, gaps, evidence và reports không nằm trong preview.

Lecturer gửi lời nhắn → request `LECTURER_TO_PROJECT / PENDING`. Chỉ owner hiện tại của project được chấp nhận/từ chối. Offer chưa được chấp nhận không cấp quyền đọc project.

## 6. MentorshipRequest state machine

`PENDING → ACCEPTED | DECLINED | CANCELLED | EXPIRED`.

Chỉ bên nhận accept/decline; bên gửi cancel. Response note tùy chọn, tối đa 1000 ký tự. Request lưu initiator, direction, message, respondedAt, expiresAt, closeReason và idempotencyKey. Retry cùng transition đã thành công trả state cũ; thao tác khác trên state đóng trả conflict. Request hết hạn không thể accept.

## 7. MentorRelationship

Chỉ consent thành công mới tạo relationship `ACTIVE`, trong cùng transaction cập nhật request thành ACCEPTED. Relationship lưu project, mentor, unique sourceRequestId, startedAt và provenance kết thúc.

Either party có thể chuyển `ACTIVE → ENDED`; lưu endedAt, endedById và endReason. End không xóa lịch sử hay hướng dẫn. Không chèn mentor vào ProjectMember. Mentor hết verification vẫn có thể chủ động kết thúc quan hệ nếu tài khoản còn đủ quyền sử dụng hệ thống.

## 8. Quyền project của Mentor

Quyền được kiểm tra từ relationship ACTIVE **và** eligibility Lecturer hiện tại trên mỗi request. Workspace riêng cho phép đọc description, screening criteria, paper abstracts/team notes, candidate gaps/rationale, evidence excerpts/explanations, report markdown và tên/role thành viên. Các section có backend pagination. Guidance tái sử dụng ProjectActivity, ghi author và attribution MENTOR/TEAM; workspace hiển thị 50 hướng dẫn gần nhất, dữ liệu lịch sử vẫn được lưu.

Không cấp quyền đổi owner/visibility, thêm/xóa member, xóa project, sửa screening/evidence, nộp thay nhóm, hoặc formal-review approval. PDF/file download không được mở thêm từ mentorship. Pending hoặc ENDED không có mentor access; mất verification chặn access mà giữ relationship/history. ARCHIVED/COMPLETED giữ quyền đọc hợp lệ và lịch sử, chặn yêu cầu mới và góp ý mới.

## 9. Project Academic Support UI

Project có một tab Academic Support cho Mentor và Academic Reviews. Hiển thị no mentor, pending invitation/offer, active relationship và lịch sử. Owner có discovery settings, mentor filters, bounded invitation composer và các action do backend cấp. Members tab hiển thị Academic Mentor riêng với Members, dẫn về Academic Support để quản lý.

Context section và guidance không chứa member-management controls dành cho mentor. Academic Reviews dẫn về artifact/version flow hiện có, không dùng guidance làm formal outcome.

## 10. Lecturer Workspace/Profile UI

`/academic-support` hiển thị availability switch, email preference riêng, incoming/active counts, requests/relationships và lịch sử thu gọn. Opportunities chỉ tải khi ON. Unverified Lecturer có hướng dẫn verification và không có accept authority.

Collaboration tab trên profile hiển thị availability. Owner của profile quản lý preference; người xem profile có thể Invite as Mentor rồi chọn project do mình sở hữu. Profile OFF không hiện invite action. Đã bổ sung tiếng Việt cho các nhãn mới; metadata/nội dung người dùng được giữ nguyên.

## 11. Notifications

Đã triển khai request, offer, accept/decline cả hai chiều, cancel, expiry và end. Notification ghi cùng transaction với state/activity/audit, `eventKey` unique theo event/record/recipient. Recipient là principal liên quan; không email mọi member. Deep link `/academic-support?projectId=...` qua authentication và object authorization.

Notification hiện có được dùng làm durable outbox. Dispatch sau commit; lỗi Redis/queue không rollback successful consent. Notification worker có maintenance mỗi 60 giây để expire và phục hồi dispatch/job. Push đã gửi được đánh dấu để không gửi lại khi email retry.

## 12. Email templates

Đã có templates EN/VI cho invitation received/accepted/declined, offer received/accepted/declined và mentorship ended, tái sử dụng SMTP và branded layout của LumiGap. Email gồm project title, actor name và một CTA tới trang đã xác thực; không chứa request message, evidence, unpublished research hoặc auth token. Cancel/expiry là in-app only.

Preference riêng `AcademicProfile.mentorshipEmailEnabled` mặc định true và `notificationLocale` en/vi, fallback en. Worker kiểm tra preference và tài khoản trước khi gửi. Atomic claim ngăn API/worker retry gửi trùng. SMTP definite rejection có thể retry; timeout/kết quả giao thư không chắc chắn lưu UNCERTAIN, không tự resend. SMTP thật chưa được xác nhận; tests mock đường gửi.

## 13. Spam, rate limit, concurrency

Defaults tập trung trong config và `.env.example`:

| Setting | Default |
| --- | --- |
| MAX_ACTIVE_MENTORS_PER_PROJECT | 1 |
| MAX_PENDING_MENTOR_REQUESTS_PER_PROJECT | 5 |
| ACADEMIC_RELATIONSHIP_REQUEST_LIMIT | 10/giờ |
| ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS | 24 |
| ACADEMIC_RELATIONSHIP_REQUEST_EXPIRY_DAYS | 14 |

Reuse user-keyed HTTP rate limiter, persisted request count và cooldown cho cùng pair. UI giữ UUID idempotency key qua retry; backend unique requester/key và từ chối dùng lại key với payload khác.

Transaction khóa users theo ID đã sắp xếp bằng FOR NO KEY UPDATE, sau đó khóa project FOR UPDATE. Partial unique indexes chặn duplicate pending pair và duplicate active pair. Acceptance serialize với cancel/withdraw và acceptance cạnh tranh. Đạt capacity thì cancel các pending cạnh tranh bằng MENTOR_POSITION_FILLED, có notification.

## 14. Migration dữ liệu cũ

`20261007000600_complete_academic_mentorship` chuyển mọi row cũ thành request, giữ ID, message và provenance. ACCEPTED/ENDED cũ tạo relationship tương ứng ACTIVE/ENDED; quan hệ hợp lệ nhiều mentor có từ trước được giữ, capacity mới áp dụng khi nhận thêm.

Legacy pending thiếu deadline nhận expiresAt = createdAt + 14 ngày. Backfill guidance attribution theo mentor hợp lệ tại thời điểm viết. Source-request FK dùng NO ACTION DEFERRABLE INITIALLY DEFERRED để không phá hard-delete project cascade hiện có. Thêm outbox columns và email preference trên hạ tầng Notification/Profile cũ.

Đã kiểm tra migration trên DB scratch từ 54 migrations trước với legacy pending/active/ended và nhiều active mentor. Đã backup DB local trước deploy, sau đó áp dụng migration thành công trên lumigap_db; không reset DB/volumes.

## 15. Kết quả kiểm tra

| Gate | Kết quả |
| --- | --- |
| PostgreSQL integration + legacy migration assertions | 60/60 tests qua |
| Web profile/lecturer controls/notification destinations | 64/64 tests qua |
| Backend TypeScript | Qua |
| Web TypeScript | Qua, bao gồm production build |
| ESLint các file mentorship thay đổi | Qua |
| Docker backend + web production build | Qua |
| Migration local / backend health / web / notification worker | Qua |

PostgreSQL suite bao phủ eligibility/availability, privacy và pagination, owner authority, cả hai chiều consent, duplicate/idempotency, acceptance races/capacity, expiry, revocation, scoped context, write denial, formal assignment separation, termination/history, outbox/email preference/failure/duplicate và project cascade delete.

Browser QA trên Docker local dùng Student + verified Lecturer tổng hợp, tắt mentorship email. Đã kiểm tra required message, invitation PENDING, preview an toàn, OFF giữ pending, acceptance khi OFF, ACTIVE scoped context, guidance attribution, Member riêng, end thu hồi quyền, owner vẫn thấy guidance/history, Lecturer offer và owner acceptance. Dữ liệu thử nghiệm được dọn sau QA.

Ảnh QA: [Mentor riêng với Members](../artifacts/mentorship/project-mentor-members.jpg), [lịch sử và hướng dẫn sau khi kết thúc](../artifacts/mentorship/owner-history-preserved.jpg).

Lệnh tái kiểm tra:

```powershell
node apps/backend/scripts/test-mentorship-integration.mjs
pnpm --filter backend exec tsc --noEmit
pnpm --filter web typecheck
pnpm --filter web test src/features/academic-profile/__tests__/lecturer-support.test.tsx src/features/academic-profile/__tests__/shared-academic-profile.test.tsx src/features/notifications/utils/notification-destination.test.ts --maxWorkers=1 --minWorkers=1
docker compose --env-file .env.compose build backend web
docker compose --env-file .env.compose run --rm --no-deps migrate
docker compose --env-file .env.compose up -d --no-build backend web worker-notifications
```

API map, relative to `/api/v1`:

| Method | Route | Chức năng |
| --- | --- | --- |
| GET / PATCH | /projects/academic-support/preferences | Availability, email preference, locale |
| GET | /projects/academic-support/mine | Own requests, relationships, counts, pagination |
| GET | /projects/academic-support/opportunities | SEEKING_MENTOR safe previews |
| GET | /projects/:id/available-mentors | Mentor search/filter/pagination |
| GET | /projects/:id/mentorships | Project request/relationship list |
| POST | /projects/:id/mentorships | Team invitation |
| POST | /projects/:id/mentorship-offers | Lecturer offer |
| POST | /projects/:id/mentorships/:relationshipId/accept, /decline, /cancel | Request response; param chứa request ID |
| POST | /projects/:id/mentorships/:relationshipId/end | End relationship; param chứa relationship ID |
| GET / PUT | /projects/:id/mentorship-discovery | Safe summary và discovery settings |
| GET | /projects/:id/academic-support | Scoped context/guidance |
| POST | /projects/:id/academic-support/guidance | Attributable guidance |

Các file chính:

- Models/migration: `apps/backend/prisma/{collaboration,identity,operations}.prisma`, migration nêu trên; DTO `packages/shared-types/src/project.ts`.
- Domain/API: `apps/backend/src/modules/projects/{project-mentorship.service,project-mentorship.controller,project-mentorship.rules,academic-relationship-access,mentorship-discovery.service,mentorship-context.service,project.routes}.ts`.
- Availability integration: `apps/backend/src/modules/academic-profiles/academic-profile.service.ts`.
- Delivery: `apps/backend/src/modules/projects/{mentorship-notifications,mentorship-mail.service}.ts`, notification service/worker và `auth-mail.service.ts`.
- Compatibility: `reviews/review-request.service.ts`, `home/home-research.service.ts`.
- UI: `apps/web/src/pages/academics/academic-support.tsx`, project API/hooks, `features/projects/components/{mentoring-preferences,invite-mentor-from-profile,project-mentor-summary}.tsx`, academic profile view/editor, project detail và `i18n/locales/academic-support.ts`.
- Tests: `apps/backend/scripts/test-mentorship-integration.mjs`, project mentorship/relationship/workspace suites, home/review compatibility và web lecturer/profile/destination tests.

## 16. Product policy và giới hạn còn lại

**Đã chọn và triển khai cho V1:** owner quản lý Academic Support; active cap 1/pending cap 5 có config; giữ legacy multiple mentors; khi verification mất hiệu lực thì đình chỉ quyền hiện tại và giữ quan hệ để các bên kết thúc; re-verification khôi phục quyền cho relationship vẫn ACTIVE; archived/completed đọc được lịch sử, không nhận mới/góp ý.

**Cần quyết định sản phẩm nếu mở rộng:** ủy quyền academic-support manager cho member; policy independence mentor/reviewer chặt hơn; tự kết thúc quan hệ khi project hoàn thành; quy trình xử lý email UNCERTAIN. Các mục này không phải blocker cho V1.

**Chưa xác nhận ngoài kiểm thử:** giao thư qua SMTP thật. Không báo mock delivery thành email đã tới hộp thư.
