# LumiGap Academic Mentorship — Architecture, Business Logic & Security Review

Ngày review: 2026-10-07. Stack thực tế: React/Vite, Express, Prisma/PostgreSQL, Redis/BullMQ.

## Audit trước khi sửa

Các findings dưới đây đã được báo trước khi sửa. Phạm vi gồm schema/migration, service, authorization, API DTO, UI, profile privacy, project workspace, Formal Review, notification/email và regression tests.

| Severity | Location | Current behavior trước sửa | Expected behavior | Risk | Minimal fix / kết quả |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | `project-mentorship.service.ts / present()` | Trả `responseNote` và `endReason` cho thành viên project thường. | Ghi chú phản hồi chỉ dành cho các bên consent; lý do kết thúc dành cho owner/mentor. Thành viên vẫn xem được trạng thái và lịch sử. | Chia sẻ lý do riêng tư quá rộng trong team. | Lọc ngay ở DTO backend. **Đã sửa, có tests cho hai chiều request và termination.** |
| MEDIUM | `project-mentorship.service.ts / collection()` | Chỉ sắp request theo ngày tạo. | Request PENDING được ưu tiên trước lịch sử, có thứ tự ổn định khi phân trang. | Request cần xử lý có thể biến mất khỏi trang đầu trong khi counter vẫn báo pending. | Thêm thứ tự status, sau đó createdAt và id. **Đã sửa, có regression cho list/mine.** |
| MEDIUM | `mentorship-notifications.ts / dispatchMentorshipNotifications()` | Truy vấn outbox ở ngoài khối bắt lỗi delivery. | Lỗi secondary delivery được ghi nhận và worker phục hồi sau domain commit. | API báo thất bại dù request/consent đã lưu thành công. | Bắt cả lỗi scan và từng lỗi dispatch. **Đã sửa, test retry không tạo bản ghi trùng.** |
| MEDIUM | `project-mentorship.service.ts / record()`; admin audit/activity DTO | Sao chép nguyên văn guidance note vào global AuditLog; nội dung được trả qua các bề mặt Admin audit. | Audit giữ event, actor, target, project và attribution; nội dung guidance nằm trong scoped ProjectActivity. | Bản sao riêng tư có phạm vi hiển thị/retention rộng hơn project, có thể còn sau khi xóa project. | Allowlist audit metadata cho guidance; migration 007 bỏ bản sao note cũ. **Đã sửa và áp dụng trên DB local; guidance gốc được giữ.** |

Không phát hiện lỗi CRITICAL/HIGH trong các đường authorization và consent đã kiểm tra. Kết luận này giới hạn trong workflow mentorship và các bề mặt liên quan được nêu trong báo cáo.

## 1. Overall mentorship architecture assessment

Kiến trúc dùng các module có sẵn của LumiGap. Request lưu consent, relationship lưu quyền mentorship theo project. Mentor làm việc qua Academic Support workspace, với quyền đọc context và gửi guidance. Owner quản lý mentorship.

UI dùng actions từ backend để hiển thị controls. Backend kiểm tra quyền lại ở mọi mutation; việc hiện/ẩn nút không quyết định authorization. Project Members hiển thị Mentor bằng summary riêng, có đường dẫn tới Academic Support.

## 2. Canonical models / source of truth

| Khái niệm | Nguồn dữ liệu canonical |
| --- | --- |
| Tư cách Lecturer | `AcademicProfile.academicRole`, `roleVerificationStatus`, `positionStatus`; trạng thái account/email được kiểm tra live |
| Mentoring availability | `AcademicProfile.supportAvailability.enabled` |
| Project discovery | `Project.mentorshipDiscovery`, `mentorshipSummary`, `mentorshipExpertise` |
| Consent | `MentorshipRequest`: `PROJECT_TO_LECTURER` hoặc `LECTURER_TO_PROJECT` |
| Quyền Mentor của project | `MentorRelationship`: `ACTIVE / ENDED`, liên kết `sourceRequestId` |
| Quyền thành viên | `ProjectMember`: `OWNER / MEMBER`, trạng thái membership riêng |
| Formal Review | `ReviewRequest / ReviewerAssignment`, exact artifact/revision riêng |

Các tên direction trong repository tương ứng semantics Team → Lecturer và Lecturer → Team. Không có writable `Project.mentorId`, `supervisorId`, `advisorId`, `User.isMentor` hay role ProjectMember = MENTOR được dùng làm nguồn quyền thứ hai. Helper rules cũ còn tồn tại nhưng không được runtime service sử dụng; xem mục 19.

## 3. Lecturer availability assessment

Official eligibility yêu cầu account ACTIVE, email verified, academic role LECTURER, role verification VERIFIED và position VERIFIED. Student/Researcher có thể khai general research support; các truy vấn/mutation official mentorship luôn kiểm tra eligibility Lecturer riêng.

Availability mặc định OFF qua JSON `{}` và mapping `enabled === true`. Chuyển academic role sang Lecturer cũng yêu cầu opt-in mới. Bật ON qua endpoint preferences hoặc profile update đều kiểm tra live verification.

OFF chặn lời mời mới, offers mới, discovery opportunities và available-mentor search. Pending hiện có vẫn được phản hồi; ACTIVE/history vẫn được giữ. Quyền mentor hiện có được quyết định bởi relationship và live verification.

## 4. Available Mentor search assessment

Backend SQL chỉ chọn Lecturer live verified, account/email hợp lệ, availability ON, profile PUBLIC/MEMBERS_ONLY và `showInResearcherSearch`. Loại owner, active members, active mentor của project và cặp đang có pending request.

Filters được xử lý trên server: name/query, institution, current position, research area và interest. Page size tối đa 30, thứ tự có id làm tie-breaker. Expertise/interests PRIVATE được loại trước cả filtering/ranking, tránh suy ra thông tin ẩn qua kết quả tìm kiếm.

DTO chỉ trả identity/profile summary cần thiết. Không trả email, staff ID, tài liệu verification, Admin notes, scholarly links riêng tư hoặc private project participation. Matching dùng overlap, cùng institution và fallback name/id; không tạo mentorScore hay academic-authority ranking.

## 5. Team → Lecturer request assessment

Chỉ current owner có quyền search/invite/manage discovery. Create kiểm tra project lifecycle, live Lecturer eligibility/availability, member conflict, active capacity, duplicate pending/active pair, pending cap, cooldown và hourly cap.

Create chỉ lưu PENDING request, activity/audit và notification outbox trong transaction. Request chưa được chấp nhận không cấp workspace access và không tạo ProjectMember/relationship.

Lecturer recipient mới được accept/decline. Khi accept, backend kiểm tra lại current owner authority của requester, current verification, lifecycle, expiry, status và capacity trước khi tạo ACTIVE relationship.

## 6. Lecturer → Team offer assessment

Lecturer phải live verified, availability ON; project phải SEEKING_MENTOR và đang mở cho mentorship. Không thể offer vào project mình sở hữu hoặc đang là thành viên ACTIVE.

Offer lưu PENDING, notify owner và chỉ chia sẻ safe preview. Current owner mới được accept/decline. Lecturer sender có thể withdraw bằng cancel. Tắt availability sau khi offer đã tồn tại vẫn cho phép owner phản hồi pending consent.

## 7. Mutual-consent assessment

Cả hai chiều đều cần hành động từ bên nhận. Acceptance transaction đổi request sang ACCEPTED và tạo relationship ACTIVE cùng lúc. Không có luồng Admin assignment hoặc one-sided request/offer tự kích hoạt Mentor.

Request terminal không quay về PENDING hay đổi sang trạng thái phản hồi khác. Retry cùng action trả trạng thái đã lưu; các response từ sai actor bị từ chối trước khi trả dữ liệu. Idempotency key được giới hạn theo requester và đối chiếu project, lecturer, direction, message.

## 8. MentorRelationship assessment

Relationship có project/mentor, unique source request, startedAt, endedAt, endedBy và endReason. DB có FK provenance, status constraints và partial unique ACTIVE pair. Unique PENDING pair nằm ở request table.

Default active cap là **1/project**, pending cap **5/project**; cap được tập trung trong env và backend policy DTO. Mutations serialize bằng project row lock. Các project có nhiều mentor hợp lệ từ legacy được giữ; không được nhận thêm khi đang đạt/vượt cap. UI dùng count/policy thực tế để khóa hành động nhận thêm.

Owner hoặc mentor có thể end, idempotent. ENDED giữ lịch sử, thu hồi future scoped access. Các lần delete project rõ ràng vẫn theo cascade policy của project hiện có.

## 9. Mentor Project permissions assessment

Workspace kiểm tra active team membership hoặc ACTIVE mentorship kèm live Lecturer verification trong transaction. Context gồm project description/criteria, paper abstracts/team notes, candidate gaps/rationale, evidence, report markdown và tên/role thành viên. Các section có pagination.

Mentor được đọc context và gửi guidance có attribution. Membership, owner settings, visibility, project deletion, screening/evidence mutation, team chat và submit thay nhóm vẫn dùng boundary riêng của project workflow. Mentorship acceptance không tạo membership.

End và feedback cùng khóa project, nên guidance chỉ được lưu nếu có quyền tại thời điểm transaction; mọi lần gửi tiếp theo sau end bị từ chối. Khi verification mất hiệu lực, official Mentor access bị suspend, history vẫn tồn tại.

## 10. Project privacy / discovery assessment

`PRIVATE + SEEKING_MENTOR` hoạt động qua safe DTO: title, explicit mentorship summary, research field, stage, expertise và discovery state. Internal description, papers, gaps, evidence, reports, files và team chat không nằm trong opportunity/request preview.

`PUBLIC_SUMMARY + CLOSED` không tự xuất hiện trong mentor opportunities. Summary chia sẻ được nhập riêng bởi owner; UI nhắc giữ nội dung nghiên cứu mật ngoài preview. Discovery không đổi project visibility.

Response/end notes đã được lọc cho ordinary members. Nội dung guidance đã được tách khỏi global audit metadata, gồm cả dữ liệu cũ bằng migration 007.

## 11. Academic Review separation assessment

Formal Review vẫn yêu cầu verified Lecturer, capability phù hợp, explicit accepted assignment/request và exact artifact revision. Save/submit review kiểm tra current account/verification, assignment, project/submission và pinned revision trong transaction.

`assertVerifiedLecturer` reuse helper kiểm tra eligibility; helper đó không cấp assignment. Mentor relationship không tạo quyền review. UI có phần Academic Reviews riêng và hiển thị request mà actor được backend cho phép xem.

Một mentor có thể nhận assignment độc lập theo policy hiện tại; DTO có `mentorRelationshipActive` để nhận diện quan hệ. Chính sách conflict of interest cho hai vai trò này được nêu ở mục 20.

## 12. Notifications assessment

Các event request/offer received, accepted/declined, cancellation/expiry và mentorship ended dùng Notification store hiện có. Recipients của các sự kiện consent chính là owner/requester/mentor phù hợp; ordinary members không được broadcast lý do phản hồi.

Notification được persist cùng transaction với domain state, có unique eventKey theo event/record/recipient. Payload chỉ chứa actor/project title và CTA; không chứa note riêng, research artifacts hay verification evidence. Search, view profile và availability changes không tạo notification.

Dispatch diễn ra sau commit. Đã bổ sung recovery cho lỗi scan outbox; lỗi Redis/dispatch giữ bản ghi chờ worker xử lý. Deep links về Academic Support vẫn phải qua backend authorization.

## 13. Email template / delivery assessment

Các template consent hai chiều và termination reuse `authMailService` cùng branded layout, EN/VI. Nội dung gồm actor/project title và CTA đã xác thực, không chứa invitation/decline note, private research hoặc auth token. HTML escape tên/nội dung do user cung cấp.

Worker kiểm tra current account, email verification, mentorship email preference và delivery mode. Atomic PENDING → SENDING claim ngăn hai delivery attempts cùng gửi thư. Definite SMTP rejection có thể retry; ambiguous outcome chuyển UNCERTAIN và không tự gửi lại. Cancellation/expiry dùng in-app notification.

Tests mock SMTP và kiểm tra payload/template, recipients, preference, duplicate claim và failure state. Không thực hiện gửi email thật để QA task này.

## 14. Spam / rate-limit / concurrency assessment

Defaults: 10 requests/giờ/requester, cooldown pair 24 giờ sau decline/cancel, request expiry 14 ngày, active cap 1 và pending cap 5/project. Create routes dùng rate limiter; service có durable hourly/cooldown/cap checks. Expiry dùng maintenance của notification worker mỗi 60 giây.

User locks được lấy theo thứ tự id, sau đó project lock. Service kiểm tra lại current state trong transaction. DB unique constraints bổ sung chống duplicate pair/source request.

Regression tests kiểm tra: accept/cancel, offer accept/withdraw, hai Lecturer accept cạnh tranh cap, invitation/offer đồng thời cùng pair, accept retry, và end/feedback đồng thời. Các outcome phải nhất quán giữa request, relationship, membership và notification.

## 15. Migration / legacy issues

Migration 006 đã tách combined legacy rows thành MentorshipRequest và MentorRelationship. Giữ request IDs/messages, ACTIVE/ENDED history, source provenance, nhiều mentor hợp lệ từ trước; legacy pending có deadline và guidance có attribution backfill. Source-request FK deferrable giữ project cascade delete hoạt động.

Review này thêm migration **007 — mentorship_audit_privacy**. Chỉ bỏ key `note` khỏi object details của audit event MENTOR_GUIDANCE; giữ audit identity, actor, target, project/attribution và mọi ProjectActivity guidance gốc. Không thay schema/domain models.

Runner giờ dựng legacy DB bằng các migrations trước boundary 006, rồi deploy cả 006 và các migration sau đó theo thứ tự. Fixture kiểm tra thêm audit redaction và guidance retention. Các migration cũ đã áp dụng được giữ nguyên.

007 đã deploy thành công vào DB local sau backup audit/activity. Truy vấn xác nhận số audit guidance objects còn key `note` là **0**. Migration được kiểm tra trên fixtures và DB local; chưa deploy sang môi trường khác.

## 16. Security / privacy issues fixed

- Request response notes chỉ trả cho current owner, mentor và original requester.
- Relationship end reason chỉ trả cho owner/mentor; thành viên vẫn thấy status/history.
- Global audit guidance chỉ giữ projectId/attribution và target activity, không sao chép nội dung note.
- Các bản sao audit note cũ đã được migration xử lý; canonical guidance vẫn nằm trong scoped project activity.
- Pending requests được ưu tiên ở list/mine; outbox scan failure không biến successful consent thành API failure.

Các file/API được sửa trong review này:

| File | Thay đổi |
| --- | --- |
| [project-mentorship.service.ts](D:/lumi-gap/apps/backend/src/modules/projects/project-mentorship.service.ts) | DTO privacy, pending-first pagination, guidance audit allowlist |
| [mentorship-notifications.ts](D:/lumi-gap/apps/backend/src/modules/projects/mentorship-notifications.ts) | Bắt lỗi scan outbox sau domain commit |
| [mentorship-workflow.persistence.test.ts](D:/lumi-gap/apps/backend/src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts) | Regression tests và audit privacy assertion |
| [test-mentorship-integration.mjs](D:/lumi-gap/apps/backend/scripts/test-mentorship-integration.mjs) | Legacy migration boundary, audit fixture/assertions, Node imports và cleanup helper để lint được |
| [007 migration.sql](D:/lumi-gap/apps/backend/prisma/migrations/20261007000700_mentorship_audit_privacy/migration.sql) | Redact historical guidance note copies trong AuditLog |

API hiện có chịu thay đổi: `GET /projects/:id/mentorships`, `GET /projects/academic-support/mine`; responses của request/offer/accept/decline/cancel/end dùng cùng DTO privacy. `POST /projects/:id/academic-support/guidance` giữ content/response scoped, ghi audit metadata giới hạn. Không thêm endpoint mới.

## 17. Tests added / changed

Thêm **7 test cases**:

1. Invitation và offer đồng thời cùng pair chỉ tạo một pending consent, một notification; chưa có membership/relationship.
2. Privacy responseNote chiều Project → Lecturer.
3. Privacy responseNote chiều Lecturer → Project.
4. Pending-first pagination cho project list và personal mine.
5. Privacy endReason với ordinary member, giữ relationship history.
6. End/feedback race, giữ guidance hợp lệ và chặn guidance sau termination.
7. Outbox scan failure sau commit và retry recovery không duplicate request/notification.

Bổ sung assertion vào scoped-context test: guidance gốc vẫn đọc được, audit details chỉ có projectId/attribution. Legacy migration fixture kiểm tra cùng invariant cho bản ghi cũ. Các tests chạy trên PostgreSQL thật và Redis tạm; SMTP được mock/tắt.

## 18. Test / typecheck / lint / build results

| Gate chạy trong review này | Kết quả |
| --- | --- |
| Legacy migration assertions, gồm 006 + 007 và audit privacy | PASS |
| PostgreSQL integration: mentorship, academic relationships, workspace, peer review, home research | **67/67 PASS**, 5 files |
| Web Lecturer controls, shared profile và notification destinations | **64/64 PASS**, 3 files |
| Backend typecheck | PASS |
| Web typecheck | PASS |
| ESLint ba file TS đã sửa và integration runner MJS | PASS |
| Node syntax check integration runner | PASS |
| Production backend Docker build, gồm PostgreSQL runtime audit 4/4 | PASS |
| Production web build và Docker web image | PASS |
| Local migration 007 deploy | PASS |
| API `/health`, web `/academic-support` | **HTTP 200 / 200** |
| Notification worker heartbeat | Fresh |
| Audit guidance note copies sau migration | **0** |
| Scoped `git diff --check` | PASS |

Các lần chạy đầu có lỗi mock Prisma trong test failure injection và lint của Node runner. Đã sửa, chạy lại các gates liên quan và chỉ ghi kết quả PASS ở trên sau khi xác nhận. React Router có future-flag warnings trong web tests; tests vẫn PASS.

Lệnh tái kiểm tra chính:

```powershell
node apps/backend/scripts/test-mentorship-integration.mjs
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter web test src/features/academic-profile/__tests__/lecturer-support.test.tsx src/features/academic-profile/__tests__/shared-academic-profile.test.tsx src/features/notifications/utils/notification-destination.test.ts
pnpm exec eslint apps/backend/src/modules/projects/project-mentorship.service.ts apps/backend/src/modules/projects/mentorship-notifications.ts apps/backend/src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts apps/backend/scripts/test-mentorship-integration.mjs
pnpm --filter web build
docker compose --env-file .env.compose build backend web
```

## 19. Remaining technical debt

Không còn implementation bug đã xác nhận trong review này chưa được sửa. Các mục còn lại được phân loại riêng:

| Classification | Location | Hiện trạng / hướng xử lý |
| --- | --- | --- |
| technical debt — LOW | `project-mentorship.rules.ts` và unit tests của helper | Helper còn type kết hợp request/relationship statuses và không được runtime service sử dụng. Cleanup sau nên bỏ hoặc đối chiếu với canonical guards để tránh tests gây hiểu nhầm về coverage authorization. |
| technical debt — LOW | `project-mentorship.service.ts / workspace()` | Guidance được giữ trong DB nhưng workspace chỉ đọc 50 mục mới nhất; chưa có UI/API paging để đọc toàn bộ guidance cũ. Đây là giới hạn browsing, dữ liệu không bị xóa. |
| technical debt — MEDIUM, operations | `mentorship-mail.service.ts`, notification worker | UNCERTAIN bảo vệ chống gửi email trùng; hiện chưa có workflow vận hành chuyên dụng để đối chiếu SMTP ambiguous delivery. In-app notification vẫn tồn tại. Cần quy trình reconciliation trước khi scale delivery. |

## 20. Remaining PRODUCT POLICY QUESTIONS

| Classification | Câu hỏi | Hành vi hiện tại |
| --- | --- | --- |
| product-policy question | Mentor của một project có được làm Formal Reviewer độc lập cho artifact của cùng project hay phải bị chặn vì conflict of interest? | Vẫn cần explicit request/accepted assignment và exact revision; relationship được đánh dấu qua `mentorRelationshipActive`. Mentorship không tự cấp quyền review. Chưa bổ sung lệnh cấm mới trong review này. |
| product-policy question | Khi Lecturer verification được khôi phục, team có cần xác nhận lại consent của relationship ACTIVE đã suspend không? | Live verification khôi phục scoped access cho ACTIVE relationship đang giữ nguyên; ENDED vẫn không được mở lại. Không chuyển status/hủy history tự động. |

Hai mục này cần quyết định sản phẩm nếu muốn thay đổi hành vi hiện tại; không được ghi nhận như implementation bugs đã sửa.

## Final acceptance checklist

- [x] Chỉ live VERIFIED Lecturer trở thành official Mentor.
- [x] Availability ON/OFF được backend kiểm tra.
- [x] OFF chặn request/offer/discovery mới, giữ pending và active relationships.
- [x] Team discover available Mentors qua server filters/pagination.
- [x] Search DTO không trả dữ liệu Lecturer riêng tư.
- [x] Current owner có thể invite Lecturer.
- [x] Invitation PENDING chưa cấp quyền project.
- [x] Recipient Lecturer có thể accept/decline.
- [x] Acceptance tạo relationship trong cùng transaction với consent.
- [x] Opportunities chỉ là SEEKING_MENTOR projects đang hợp lệ.
- [x] Private discovery chỉ trả safe preview.
- [x] Verified available Lecturer có thể offer mentorship.
- [x] Offer PENDING chưa cấp quyền project.
- [x] Current owner phải accept Lecturer offer.
- [x] Consent hai chiều được giữ.
- [x] Membership được quản lý độc lập; acceptance không tạo ProjectMember.
- [x] Mentor có scoped context/feedback access.
- [x] Project membership/ownership/admin mutations được bảo vệ bằng boundary riêng.
- [x] Formal Review yêu cầu explicit accepted assignment/exact revision riêng.
- [x] Owner hoặc mentor có thể end relationship.
- [x] ENDED mentor mất scoped access ở các lần truy cập tiếp theo.
- [x] Historical valid guidance và relationship events được giữ.
- [x] Consent notifications gửi đúng principal recipients.
- [x] Email reuse existing branded mail infrastructure.
- [x] Email payload không chứa private research/note/verification data.
- [x] Duplicate/idempotent retry behavior có regression tests.
- [x] Conflicting consent/capacity/end-feedback transactions được kiểm tra.
- [x] Legacy migration giữ request/relationship/guidance provenance trong fixtures.
- [x] Backend là authorization boundary.
