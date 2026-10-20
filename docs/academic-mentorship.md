# Academic Mentorship — implementation report

Workflow gốc: 2026-10-07. Cập nhật 2026-10-18: mentor chính/phụ, bản nháp dùng lại và tệp đính kèm lời mời. SMTP thực tế chưa được gửi thử; kiểm thử không gửi email ra ngoài.

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

Project Owner → Find a Mentor → chọn Lecturer → chọn vị trí → viết lời nhắn và/hoặc đính kèm tệp → Send Invitation. Lời nhắn tối đa 1000 ký tự; cho phép chỉ gửi tệp. Owner quản lý lời mời chính thức; member chỉ đề xuất mentor, không tự mời/cancel/accept/end.

Tạo request `PROJECT_TO_LECTURER / PENDING`; không tạo relationship hoặc ProjectMember. Lecturer chỉ đọc preview gồm title, owner-written mentorshipSummary, research field, stage, expertise cần hỗ trợ và thông tin người gửi an toàn. Chấp nhận kiểm tra lại quyền người gửi, verification, project lifecycle, membership conflict và capacity trong transaction.

## 5. Lecturer → Team offer

Lecturer VERIFIED và availability ON khám phá project `SEEKING_MENTOR`. Project visibility và mentorship discovery độc lập: PRIVATE + SEEKING_MENTOR hợp lệ. General private description, papers, gaps, evidence và reports không nằm trong preview.

Lecturer gửi lời nhắn → request `LECTURER_TO_PROJECT / PENDING`. Chỉ owner hiện tại của project được chấp nhận/từ chối. Offer chưa được chấp nhận không cấp quyền đọc project.

## 6. MentorshipRequest state machine

`PENDING → ACCEPTED | DECLINED | CANCELED_BY_PROJECT | EXPIRED | CLOSED_CAPACITY_REACHED`.

Owner hủy dùng `CANCELED_BY_PROJECT`; lecturer rút offer giữ `CANCELLED` để tương thích dữ liệu cũ. Khi một vị trí được nhận, các request cạnh tranh cùng vị trí chuyển `CLOSED_CAPACITY_REACHED`, không ghi nhận từ chối. Lời mời và phân công đã kết thúc vẫn có trong lịch sử.

Chỉ bên nhận accept/decline; bên gửi cancel. Response note tùy chọn, tối đa 1000 ký tự. Request lưu initiator, direction, message, respondedAt, expiresAt, closeReason và idempotencyKey. Retry cùng transition đã thành công trả state cũ; thao tác khác trên state đóng trả conflict. Request hết hạn không thể accept.

## 7. MentorRelationship

Chỉ consent thành công mới tạo relationship `ACTIVE`, trong cùng transaction cập nhật request thành ACCEPTED. Relationship lưu project, mentor, unique sourceRequestId, startedAt và provenance kết thúc.

Mỗi project có tối đa một `PRIMARY` và một `SECONDARY` đang hoạt động. Chỉ mời/nhận mentor phụ sau khi có mentor chính đang hoạt động và còn đủ điều kiện Lecturer VERIFIED. Trạng thái vị trí lấy từ database: `VACANT`, `INVITING`, `ASSIGNED`, hoặc `LOCKED` cho mentor phụ. Mỗi vị trí tối đa ba request chưa hết hạn. Chưa có quy trình `REPLACEMENT_PENDING`: kết thúc quan hệ có xác nhận rồi mời người thay thế.

Either party có thể chuyển `ACTIVE → ENDED`; lưu endedAt, endedById và endReason. End không xóa lịch sử hay hướng dẫn. Không chèn mentor vào ProjectMember. Mentor hết verification vẫn có thể chủ động kết thúc quan hệ nếu tài khoản còn đủ quyền sử dụng hệ thống.

Khi mentor chính rời nhóm, mentor phụ đang hoạt động giữ nguyên vai trò. Lời mời mentor phụ chưa nhận vẫn giữ deadline/lịch sử nhưng bị khóa acceptance đến khi có mentor chính hợp lệ trở lại; không tự gán `CANCELED_BY_PROJECT` cho thao tác của hệ thống hoặc lecturer.

## 8. Quyền project của Mentor

Quyền được kiểm tra từ relationship ACTIVE **và** eligibility Lecturer hiện tại trên mỗi request. Workspace riêng cho phép đọc description, screening criteria, paper abstracts/team notes, candidate gaps/rationale, evidence excerpts/explanations, report markdown và tên/role thành viên. Các section có backend pagination. Guidance tái sử dụng ProjectActivity, ghi author và attribution MENTOR/TEAM; workspace hiển thị 50 hướng dẫn gần nhất, dữ liệu lịch sử vẫn được lưu.

Không cấp quyền đổi owner/visibility, thêm/xóa member, xóa project, sửa screening/evidence, nộp thay nhóm, hoặc formal-review approval. Không mở download thư viện project. Chỉ tệp được chủ động đính kèm lời mời mới được chia sẻ cho người nhận; các tệp đó được giữ cùng lịch sử consent. Pending hoặc ENDED không có mentor workspace access; mất verification chặn access mà giữ relationship/history. ARCHIVED/COMPLETED giữ quyền đọc hợp lệ và lịch sử, chặn yêu cầu mới và góp ý mới.

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

Chính sách vị trí cố định trong `mentorship-positions.ts`:

| Setting | Default |
| --- | --- |
| Mentor đang hoạt động | 1 PRIMARY + 1 SECONDARY |
| Request đang chờ trên mỗi vị trí | 3 |
| Thời hạn lời mời/offer mới | 7 ngày |
| ACADEMIC_RELATIONSHIP_REQUEST_LIMIT | 10/giờ |
| ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS | 24 |

Hai biến `MAX_ACTIVE_MENTORS_PER_PROJECT`, `MAX_PENDING_MENTOR_REQUESTS_PER_PROJECT` cũ vẫn được parser nhận để không phá cấu hình đang có; không điều khiển chính sách vị trí mới. `ACADEMIC_RELATIONSHIP_REQUEST_EXPIRY_DAYS` vẫn dùng riêng cho formal review, không thay thời hạn mentorship mới.

Reuse user-keyed HTTP rate limiter, persisted request count và cooldown cho cùng pair. UI giữ UUID idempotency key qua retry; backend unique requester/key và từ chối dùng lại key với payload khác.

Transaction khóa users theo ID đã sắp xếp bằng FOR NO KEY UPDATE, sau đó khóa project FOR UPDATE. Partial unique indexes chặn duplicate pending pair, duplicate active pair và hai quan hệ ACTIVE cùng project/vị trí. Acceptance serialize với cancel/withdraw và acceptance cạnh tranh. Đạt capacity thì đóng các pending cùng vị trí bằng `CLOSED_CAPACITY_REACHED`, có thông báo in-app `MENTORSHIP_POSITION_FILLED`.

## 13a. Nội dung lời mời và bản nháp dùng lại

- Composer dùng chung cho invitation và offer. Bản nháp lưu riêng theo project, người gửi và chiều gửi; không lưu người nhận để tái sử dụng khi chọn mentor khác. Autosave sau một giây, lưu khi đóng popup và trước khi gửi. Mở lại/đổi mentor khôi phục lời nhắn và các tệp đã chọn. Suggestions của member vẫn chỉ là lời nhắn.
- `MentorshipDraft.version` kiểm tra optimistic concurrency: tab cũ nhận 409, giữ input để người dùng xử lý hoặc chủ động tải lại. Gửi request giữ snapshot lời nhắn và liên kết tệp bất biến; sửa bản nháp không thay nội dung đã gửi.
- Cho phép PDF, DOCX, JPEG, PNG, WebP: tối đa 5 tệp, 5 MB/tệp, 20 MB/lời mời; quota lưu tệp của một người trong project là 100 MB. Upload trùng nội dung được tái sử dụng. Chưa có xóa tệp đã lưu; bỏ tệp khỏi bản nháp không xóa tệp trong lịch sử.
- Backend xác thực trước xử lý tệp và kiểm tra lại dưới khóa project. PDF kiểm tra signature; ảnh decode/re-encode, giới hạn 25 triệu pixels, loại metadata; DOCX giới hạn số entry/kích thước giải nén và từ chối macro payload. Không nhận SVG/HTML hoặc URL tệp từ bên ngoài.
- Tệp staged nằm trong PostgreSQL `bytea`, riêng với người gửi; chủ dự án chỉ thấy tệp offer sau khi lecturer gửi. Người nhận chỉ đọc các tệp được gắn rõ ràng vào request của mình. Member khác không thấy metadata/tải tệp. Endpoint download xác thực, trả `attachment`, `private, no-store`, `nosniff`, CSP sandbox; ảnh thumbnail dùng authenticated Blob URL và thu hồi URL khi unmount.
- Dùng lại Notification/outbox cho hai chiều; bản nháp và upload không phát thông báo. Email không kèm nội dung/tệp nghiên cứu.

API mới dưới `/api/v1/projects/academic-support/content`:

| Method | Path | Chức năng |
| --- | --- | --- |
| GET | `/draft?projectId=...&direction=...` | Đọc bản nháp riêng |
| PUT | `/draft` | Lưu message, mentorRole, attachmentIds, expectedVersion |
| POST | `/attachments?projectId=...&direction=...` | Multipart một trường `file` |
| GET | `/attachments/:attachmentId` | Download có xác thực và object authorization |

## 14. Migration dữ liệu cũ

`20261007000600_complete_academic_mentorship` chuyển mọi row cũ thành request, giữ ID, message và provenance. ACCEPTED/ENDED cũ tạo relationship tương ứng ACTIVE/ENDED; quan hệ hợp lệ nhiều mentor có từ trước được giữ, capacity mới áp dụng khi nhận thêm.

Legacy pending thiếu deadline nhận expiresAt = createdAt + 14 ngày. Backfill guidance attribution theo mentor hợp lệ tại thời điểm viết. Source-request FK dùng NO ACTION DEFERRABLE INITIALLY DEFERRED để không phá hard-delete project cascade hiện có. Thêm outbox columns và email preference trên hạ tầng Notification/Profile cũ.

Migration `20261018010000_mentor_positions_and_invitation_content` bổ sung vị trí, trạng thái đóng và ba bảng nội dung/bản nháp. Mentor ACTIVE sớm nhất thành PRIMARY, người thứ hai thành SECONDARY, đồng bộ vai trò source request; giữ nguyên IDs, nội dung, deadline và lịch sử cũ. Nếu có project trên hai mentor ACTIVE, migration dừng trong transaction để xử lý dữ liệu có chủ đích, không tự xóa/kết thúc quan hệ. Database trigger yêu cầu consent ACCEPTED khớp project/mentor/vị trí và kiểm tra primary VERIFIED khi phân công secondary. Triển khai bằng `db:migrate:deploy`, không dùng `migrate dev` hoặc reset volumes.

Đã kiểm tra migration trên DB scratch từ 54 migrations trước với legacy pending/active/ended và nhiều active mentor. Đã backup DB local trước deploy, sau đó áp dụng migration thành công trên lumigap_db; không reset DB/volumes.

## 15. Kết quả kiểm tra workflow gốc (2026-10-07)

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

**Chính sách hiện tại:** owner quản lý Academic Support; tối đa 1 PRIMARY + 1 SECONDARY, ba lời mời đang chờ trên mỗi vị trí, thời hạn bảy ngày; giữ lịch sử cũ. Khi verification mất hiệu lực thì đình chỉ quyền hiện tại và giữ quan hệ để các bên kết thúc; re-verification khôi phục quyền cho relationship vẫn ACTIVE; archived/completed đọc được lịch sử, không nhận mới/góp ý.

**Cần quyết định sản phẩm nếu mở rộng:** ủy quyền academic-support manager cho member; policy independence mentor/reviewer chặt hơn; tự kết thúc quan hệ khi project hoàn thành; quy trình xử lý email UNCERTAIN. Các mục này không phải blocker cho V1.

**Chưa xác nhận ngoài kiểm thử:** giao thư qua SMTP thật. Không báo mock delivery thành email đã tới hộp thư.

## 17. Kiểm tra bổ sung ngày 2026-10-18

- `node apps/backend/scripts/test-mentorship-integration.mjs --browser`: **91/91 PASS**, gồm sáu suite PostgreSQL/HTTP/browser và kiểm tra replay migration giữ dữ liệu legacy. Dùng database `_test` và Redis tách biệt, tắt email delivery, dọn fixtures sau khi chạy.
- `node apps/backend/scripts/test-mentorship-integration.mjs --browser --http-only`: **5/5 PASS** sau chỉnh responsive. Browser đi qua member suggestion, owner invitation có PDF + PNG, autosave/đóng/mở lại/chọn mentor khác, lecturer tải tệp/chấp nhận, scoped context, kết thúc và lecturer offer → owner acceptance. Kiểm tra cả chiều rộng trang lẫn `scrollWidth` bên trong popup ở 390px.
- `pnpm --filter web test src/features/projects/__tests__/mentorship-invitation-content.test.tsx`: **6/6 PASS**. Bao gồm tái sử dụng nội dung/tệp, serial save/version, conflict giữ input và reload, autosave/bỏ tệp, đổi vị trí được phép và partial upload failure.
- Backend/web production build, PostgreSQL runtime audit và ESLint các file triển khai đã qua.
- Migration đã áp dụng trên database local sau backup `apps/backend/uploads/backups/mentorship-before-20261018.dump` (ignored). Không reset database hoặc volumes.
- Ảnh kiểm tra nằm trong `apps/web/test-results/mentorship/` (ignored).
- Localhost đã dùng image backend mới và worker notifications mới. Docker Engine local (~3 GB RAM) trả lỗi 500 khi build web trong container; web được production-build bằng cùng lệnh trên máy rồi đóng gói assets + cấu hình Nginx hiện tại vào image `lumigap-web:local`. Không sửa Dockerfile/Compose của repo. Sau triển khai: `/ready` 200, login/API positions/private draft 200, HTML khớp build, popup thật trên cổng 8080 có upload và không tràn ngang ở 390px; không có page errors. QA production chỉ mở/đóng composer bằng tài khoản demo, không gửi lời mời.

Các file thay đổi cho phần mở rộng này:

- Persistence/types: `apps/backend/prisma/collaboration.prisma`, `apps/backend/prisma/mentorship-content.prisma`, `apps/backend/prisma/migrations/20261018010000_mentor_positions_and_invitation_content/migration.sql`, `packages/shared-types/src/project.ts`.
- API/domain: `apps/backend/src/modules/projects/{mentorship-content.routes,mentorship-content.service,mentorship-positions,project-mentorship.controller,project-mentorship.service,mentorship-discovery.service,project.routes}.ts`.
- Upload errors/notifications: `apps/backend/src/common/middleware/error-handler.ts`, `apps/backend/src/modules/projects/{mentorship-notifications,mentorship-mail.service}.ts`.
- UI: `apps/web/src/pages/academics/academic-support.tsx`, `apps/web/src/features/projects/api/academic-support.api.ts`, `apps/web/src/features/projects/components/mentorship-invitation-content.tsx`, `apps/web/src/features/projects/mentor-discovery.css`, `apps/web/src/i18n/locales/academic-support.ts`.
- Tests: `apps/backend/src/modules/projects/__tests__/{mentorship-workflow,mentorship-http,academic-relationships}.persistence.test.ts`, `apps/web/src/features/projects/__tests__/mentorship-invitation-content.test.tsx`.
- Documentation: tài liệu này. Các thay đổi khác đang có trong working tree thuộc công việc trước đó.

## 18. Rà soát lại luồng mời và phân công (2026-10-18)

Các lỗi đã tái hiện và sửa:

1. Composer thiếu cảnh báo chưa lưu. Dùng lại guard hiện có cho reload/link/chuyển mục và flush bản nháp khi SPA unmount trước debounce; không flush sau đăng xuất hoặc đổi tài khoản. Flush khi unmount là best effort nếu mạng lỗi.
2. Đổi project/user/direction giữ refs bản nháp cũ. Tách session theo context; phản hồi save/upload đến muộn không ghi đè nội dung/version của context mới.
3. UI cho chọn tệp tổng trên 20 MB rồi mới lỗi khi lưu/gửi. Kiểm tra tổng trước upload và byteSize sau xử lý ảnh; bổ sung giới hạn tổng trong hướng dẫn EN/VI.
4. Autosave xóa lỗi upload một phần. Tách lỗi upload khỏi lỗi lưu, giữ tệp thành công và không gợi ý reload bản nháp cho lỗi upload.
5. Reload khi mất mạng có thể thay nội dung đang nhập bằng cache cũ. Chỉ thay input sau refetch thành công.
6. Search vẫn gợi ý mentor vừa từ chối/có lời mời bị hủy dù create đang áp dụng cooldown. Search nay áp dụng cùng chính sách; mentor xuất hiện lại khi hết hạn chờ.

Kiểm thử: PostgreSQL/HTTP/browser **93/93 PASS**; invitation hook **16/16 PASS**; workspace coordination **31/31 PASS**; PostgreSQL runtime audit **4/4 PASS**. Backend/web production build và ESLint các file audit đã qua. Bốn regression đầu đã thất bại trước sửa. Kiểm tra thêm phản hồi đến muộn, reload thất bại giữ input, flush khi unmount và không flush dưới tài khoản khác.

Không đổi schema/migration trong lượt audit; không gửi lời mời trên dự án thật hoặc SMTP thật. Giao thư qua SMTP vẫn chưa được xác nhận.

File sửa: `mentorship-discovery.service.ts`, `mentorship-workflow.persistence.test.ts`, `mentorship-invitation-content.tsx`, `mentorship-invitation-content.test.tsx`, `pages/academics/academic-support.tsx`, `i18n/locales/academic-support.ts` và tài liệu này.

Đã cập nhật image backend/web và worker notifications trên localhost. Smoke test cổng 8080 qua: `/ready`, HTML khớp production build, demo login, mentorship/search/private-draft API, popup tiếng Việt 390px có giới hạn tổng 20 MB và không tràn ngang. Chỉ mở/đóng composer, xác nhận không có project write request hoặc page error. Đã dừng Vite QA cổng 5180.

## 19. Thu gọn trang Tìm cố vấn (2026-10-18)

- Gỡ bốn khối Team mentor suggestions, Research context, Mentor guidance và Academic Reviews khỏi trang dự án; gỡ các component/query chỉ phục vụ các khối này. Dữ liệu lịch sử và API hiện có được giữ.
- Đưa tiêu đề lên đầu, thu gọn vị trí mentor chính/phụ thành hai ô trạng thái. Tách hai tab Tìm cố vấn và Lời mời & cố vấn, có số lời mời đang chờ; hỗ trợ bàn phím Arrow/Home/End.
- Nhu cầu và lĩnh vực được trình bày ngắn bên cạnh nút chỉnh sửa. Form chỉnh nhu cầu dùng lại editor/API/version/unsaved guard, mở trong popup responsive.
- Giữ search/filter, profile mở tab mới, lời mời có message/file/draft, chấp nhận/từ chối/hủy/kết thúc và lịch sử. Tối đa bốn tag chuyên môn mỗi dòng kết quả, phần còn lại có số lượng; loại thông tin chủ đề quan tâm trùng chuyên môn.
- Mentor vẫn có liên kết đến kế hoạch/câu hỏi được chia sẻ; trang tìm cố vấn không hiển thị nội dung nghiên cứu dài.
- Kiểm tra: TypeScript/ESLint qua; frontend **45/45**, HTTP/browser thật với PostgreSQL tách biệt **5/5** (hai chiều consent, popup nhu cầu, tab bàn phím, file privacy, revocation). QA read-only tài khoản demo ở 1440px/390px không có page errors hoặc project write request. Ảnh nằm trong `apps/web/test-results/mentorship/{finder,preferences}-*.png` (ignored).

File thay đổi: `apps/web/src/pages/academics/academic-support.tsx`, `apps/web/src/features/projects/mentor-discovery.css`, `apps/web/src/i18n/locales/academic-support.ts`, `apps/backend/src/modules/projects/__tests__/mentorship-http.persistence.test.ts` và tài liệu này. Không thay đổi backend runtime/schema.

## 20. Kiểm tra nhánh trước khi push (2026-10-18)

- Nhánh `codex/mentor-invitations-review` được kiểm tra trong worktree riêng, tích hợp `origin/main` tại `1b3183c`. Không lấy các thay đổi chưa commit của forum/home/chat/about/contributions từ workspace gốc.
- Giải quyết xung đột `reports/rag.service.ts`: giữ kiểm tra quyền theo project và lưu `groundingChecks` mới từ main.
- PostgreSQL/HTTP/browser: **93/93 PASS**, sáu suite; hai chiều consent, privacy, rejection, duplicates, acceptance races, primary/secondary, uploads/private drafts và revocation. Replay migration giữ dữ liệu legacy; database/Redis thử nghiệm đã dọn.
- Frontend: **69/69 PASS**, gồm invitation content, lecturer controls và workspace coordination hiện có trong nhánh.
- Report prompt/grounding: **42/42 PASS**. PostgreSQL runtime audit: **4/4 PASS**. Shared types/backend/web production builds và ESLint file mentor đã qua.
- Sửa seed demo để lời mời mới hết hạn sau **7 ngày**, khớp chính sách domain. Rerun không thay mật khẩu hay quyết định mentorship có sẵn.
- Giới hạn còn lại: chưa thử giao email qua SMTP thật; web build vẫn báo một số chunk lớn, nhưng bundle budget gate đã qua.
