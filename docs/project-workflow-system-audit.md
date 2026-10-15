# LumiGap — Complete Project Workflow, Business Logic & End-to-End System Audit

Ngày kiểm tra: **14/10/2026**. Phạm vi: working tree tại `D:\lumi-gap`, bao gồm các thay đổi nghiên cứu/cộng tác đang có; không phải một release hoặc commit đã được chứng nhận.

## A. Executive Summary

**Kết luận: luồng nghiên cứu và cộng tác có nền tảng lưu trữ thật, nhưng toàn bộ hệ sinh thái được yêu cầu chưa sẵn sàng để gọi là hoàn chỉnh.**

Tạo dự án, lời mời thành viên, kế hoạch nháp, sàng lọc, bằng chứng, ứng viên khoảng trống, công việc, thảo luận, quan hệ mentor và phản biện có dịch vụ và dữ liệu PostgreSQL. Các kiểm tra bên dưới đi qua dịch vụ thật, một số đi qua HTTP thật, thay vì chỉ xác nhận nút hoặc component tồn tại.

Trong lượt audit này đã sửa:

1. SSE của hai loại chat tiếp tục sống sau khi session bị thu hồi: xác thực lại token/session và quyền hiện hành trước mỗi sự kiện, cùng heartbeat.
2. Chat và trình soạn thảo section dùng quyền kiểm tra trước đó để ghi: kiểm tra lại trong transaction, đồng bộ với khóa tài khoản/dự án.
3. Yêu cầu góp ý khoảng trống không đến đúng mentor: sửa loại thông báo, điều kiện giao và đích điều hướng; giữ tương thích thông báo cũ.
4. Bằng chứng có cấu trúc không kết nối đầy đủ với công việc/thảo luận: thống nhất bộ chọn, xác thực liên kết, đường dẫn đến đúng bản ghi và bản ghi legacy.
5. Cache nghiên cứu có thể cũ sau thao tác ở module điều phối: bổ sung invalidation đúng người dùng/dự án.
6. Dọn trạng thái bằng chứng trống và ba chuỗi tiếng Anh của sản phẩm nghiên cứu.

**Các giới hạn ngăn kết luận hoàn chỉnh:**

- Chưa có Manuscript/file tree/CRDT/WebSocket document server/BibTeX workspace. `DraftWorkspace` là bản nháp theo section, một workspace cho mỗi dự án.
- Chưa có pipeline biên dịch LaTeX của sản phẩm. Production compilation: **BLOCKED** cho tới khi có thiết kế và bằng chứng cô lập mã không tin cậy.
- Mentor đang hoạt động được đọc khá rộng qua context API hiện có, trong khi kế hoạch mới dùng `PlanShare` theo revision. Cần thống nhất chính sách đồng ý/phạm vi truy cập trước khi mở rộng.
- Phản biện đã ghim `SubmissionRevision` thật; chưa có cầu nối từ snapshot mã nguồn manuscript.
- Chưa kiểm tra email/Expo thực, chất lượng LLM thực, tải lớn hoặc hai trình duyệt cùng sửa tài liệu.

Kết quả lũy kế: **161 backend tests**, **81 frontend tests**, thêm **4 PostgreSQL runtime boundary tests** đã đạt qua các lượt chạy. Một lượt peer-review gặp timeout Prisma và đã đạt 13/13 khi chạy riêng; chi tiết ở I. Không cộng lại các lần rerun vào tổng.

Không thêm migration trong lượt audit này. Các migration/feature đang có từ các bước triển khai trước được giữ nguyên. Không commit/push hoặc thay dữ liệu nghiên cứu thật để làm mẫu kiểm thử.

## B. Architecture Findings

### B1. Kiến trúc và nguồn dữ liệu thật

| Thành phần | Triển khai quan sát được | Nguồn |
|---|---|---|
| Web | React 18, Vite, React Router, TanStack Query, Zustand; route dự án giữ tab/subview trong URL | `apps/web/package.json`; `apps/web/src/pages/projects/projects-workspace.tsx`; `apps/web/src/pages/projects/project-detail.tsx` |
| API | Express 5, TypeScript, Zod; controller gọi service; envelope `{ success, data, meta }` | `apps/backend/src/app.ts`; `apps/backend/src/modules/projects/project.routes.ts`; `project-workspace.routes.ts`; `project-research.routes.ts` |
| Identity/session | JWT ký RS256; refresh token băm, family/session trong PostgreSQL; mỗi request xác thực account và session hiện hành | [auth.ts:29](D:/lumi-gap/apps/backend/src/common/middleware/auth.ts:29); `apps/backend/src/modules/auth/token.service.ts` |
| Persistence | PostgreSQL/pgvector qua Prisma 7; migration SQL là phần bắt buộc của schema thực | `apps/backend/prisma/collaboration.prisma`; `project-workspace.prisma`; `project-research.prisma`; `research.prisma`; `migrations/` |
| Quyền dự án | OWNER/MEMBER từ owner hiện tại và membership ACTIVE; mentor/reviewer đi qua quan hệ riêng | [project-transaction.ts:28](D:/lumi-gap/apps/backend/src/modules/projects/project-transaction.ts:28); [workspace-access.ts:18](D:/lumi-gap/apps/backend/src/modules/projects/workspace-access.ts:18); `academic-relationship-access.ts`; `peer-review-access.ts` |
| AI/async | LLM qua `modules/llm`; Redis cache; BullMQ và worker độc lập cho gap/report/AI processing | `apps/backend/src/modules/gaps/gaps.service.ts`; `apps/backend/src/modules/reports/report.service.ts`; `apps/backend/src/workers/` |
| Thông báo | Bản ghi notification/outbox bền vững, worker phân phối; email mời dùng token mã hóa và token hash | [project-invitation-delivery.ts:29](D:/lumi-gap/apps/backend/src/modules/projects/project-invitation-delivery.ts:29); `apps/backend/src/workers/notification.worker.ts` |
| PDF nguồn dự án | `ProjectPaperFile` lưu bytes riêng theo project, checksum, quota; endpoint có quyền | [project-sources.service.ts:44](D:/lumi-gap/apps/backend/src/modules/projects/project-sources.service.ts:44) |
| PDF submission | Revision/checksum và storage abstraction local/R2/Cloudinary; đọc sau kiểm tra submission/revision | [submission.service.ts:283](D:/lumi-gap/apps/backend/src/modules/submissions/submission.service.ts:283); `apps/backend/src/infrastructure/pdf-storage.service.ts` |
| Realtime hiện có | SSE chat với event hub trong process; lịch sử chat lưu DB | `apps/backend/src/modules/projects/project-team-chat.events.ts`; `project-chat.events.ts`; hai controller SSE |
| Writing hiện có | Section + SectionRevision + WorkspaceComment, optimistic version; không có document synchronization | [workspace.service.ts:28](D:/lumi-gap/apps/backend/src/modules/workspaces/workspace.service.ts:28); [collaboration.prisma:735](D:/lumi-gap/apps/backend/prisma/collaboration.prisma:735) |

Không tìm thấy implementation của manuscript source tree, CRDT persistence, document rooms hoặc compiler queue trong nguồn runtime đã rà. Markdown/math renderer, PDF preview và sourceRevision của submission không chứng minh các chức năng đó đã tồn tại.

### B2. Phân loại module sau các bản sửa

`IMPLEMENTED_AND_VERIFIED` bên dưới chỉ áp dụng cho năng lực và biên kiểm tra nêu trong hàng; không đồng nghĩa đã xác minh mọi cấu hình production. `PARTIALLY_IMPLEMENTED` gồm phần thật đã có và phần nối còn thiếu.

| Module/năng lực | Phân loại | Bằng chứng và giới hạn |
|---|---|---|
| Signed-session guard và thu hồi SSE chat | IMPLEMENTED_AND_VERIFIED | `auth.ts:64`, hai controller; HTTP streaming thật kiểm tra account/session/membership mất quyền |
| Tạo dự án và membership owner | IMPLEMENTED_AND_VERIFIED | `project.service.ts:270`; creation/team persistence 17 cases |
| Archive/restore/transfer/delete guards | IMPLEMENTED_AND_VERIFIED | `project.service.ts:400,414,431,736`; bảo toàn lịch sử và chặn ghi archive trong các suite dự án |
| Invitation/acceptance/membership | IMPLEMENTED_AND_VERIFIED | `project.service.ts:546,660`; concurrent accept/cancel, email-bound consent, no premature access |
| Delivery email/push ngoài hệ thống | PARTIALLY_IMPLEMENTED | Outbox/claim/recovery có thật; SMTP/Expo thật chưa kiểm tra |
| Research plan và chia sẻ revision | IMPLEMENTED_AND_VERIFIED | `project-plan.service.ts`; nháp chưa đủ trường, lịch sử, conflict, PlanShare |
| Library/import/private source PDF | IMPLEMENTED_AND_VERIFIED | `project-sources.service.ts`; DOI retry, missing metadata, PDF bounds/isolation; không chứng nhận mọi storage provider |
| Screening exploratory/independent | IMPLEMENTED_AND_VERIFIED | `project-screening.service.ts`; vote riêng, blinding/conflict/resolution/history |
| Evidence extraction/review/history | IMPLEMENTED_AND_VERIFIED | `project-evidence.service.ts`; provenance, source snapshot, human review, version conflicts |
| Gap evidence/team assessment/question | IMPLEMENTED_AND_VERIFIED | `project-gap-research.service.ts`; support/counterevidence, revision pins, mentor không ghi đè quyết định |
| AI generation chất lượng khoa học | PARTIALLY_IMPLEMENTED | Pipeline/scope có kiểm tra với provider mock; chất lượng suy luận và trích dẫn thực chưa đo |
| Tasks và cập nhật milestones | IMPLEMENTED_AND_VERIFIED | `project-tasks.service.ts`; assignment, completion/reopen, isolation, versions, notifications |
| Retry tạo milestone | PARTIALLY_IMPLEMENTED | `saveMilestone:89` chưa có durable request key như task |
| Discussion/replies/history | IMPLEMENTED_AND_VERIFIED | `project-discussions.service.ts`; scope, text rendering, retry keys, history |
| Decision records | PARTIALLY_IMPLEMENTED | Có persistence/history; tạo mới chưa có durable idempotency key |
| Lecturer verification dependency | PARTIALLY_IMPLEMENTED | Policy/unit và downstream DB authorization đạt; cuộc đua hai admin xác minh chưa chạy trên DB trong lượt này |
| Mentorship consent/capacity/termination | IMPLEMENTED_AND_VERIFIED | `project-mentorship.service.ts`; 34 cases, không tạo ProjectMember |
| Owner-consented grants cho mọi mentor artifact | PARTIALLY_IMPLEMENTED | PlanShare đúng revision; context API hiện tại rộng hơn cơ chế share |
| Gap guidance notifications/deep links | IMPLEMENTED_AND_VERIFIED | `project-gap-research.service.ts:35`, notification access/destination; kiểm tra dữ liệu và component |
| Formal review assignment/version/history | IMPLEMENTED_AND_VERIFIED | `review-request.service.ts`, `review.service.ts`, `peer-review-access.ts`; 13 cases |
| Report → submission revision | PARTIALLY_IMPLEMENTED | Bridge có thật tại `review-request.service.ts:67`; không phải manuscript source snapshot |
| Versioned section editor | IMPLEMENTED_AND_VERIFIED | Existing editor có persistence/conflict/current permission; không có đồng bộ từng thao tác |
| Multiple manuscripts/templates/file tree | NOT_IMPLEMENTED | DraftWorkspace unique theo project, không có Manuscript/file model tương ứng |
| Collaborative LaTeX/CRDT/remote cursors/offline merge | NOT_IMPLEMENTED | Không có server hoặc client workflow để thực hiện scenario D |
| LaTeX compiler của sản phẩm | NOT_IMPLEMENTED | Không có compile revision/job/worker/result workflow |
| Production-safe compilation | BLOCKED | Thiếu isolation, quotas, network/filesystem policy và bằng chứng kiểm thử |
| Source snapshots/ZIP export/references.bib | NOT_IMPLEMENTED | Submission revisions không chứa cây mã nguồn nhất quán |

Không dùng `UI_ONLY` để mô tả những tính năng không có cả UI lẫn backend. Các lỗi `IMPLEMENTED_BUT_BROKEN` được xác nhận ở đầu audit đã sửa và được liệt kê riêng ở H.

### B3. Chuỗi xuyên tầng đã truy vết

1. **Creation/team:** form giữ request key → projects API → signed active session → account/onboarding và owner authorization → transaction tạo Project/ResearchPlan/OWNER/activity hoặc invitation/outbox → worker → Query cache/refetch và điều hướng project ID trả về.
2. **Research:** literature/screening/evidence UI → research API + DTO → `withWorkspace` → khóa account/project + membership hiện hành → ProjectPaper/votes/evidence/revisions/gap links → job AI khi có yêu cầu → UI dùng cache có user/project scope.
3. **Mentor:** owner request hoặc lecturer offer → verification + availability + consent → MentorRelationship → context/shared revision/gap feedback → notification durable và worker access check → academic-support/team workspace.
4. **Review:** report hoặc submission → immutable SubmissionRevision → request/assignment được nhận → eligibility và COI → HumanReview ghim revision/round/template → team đọc lịch sử. Không có bước manuscript source snapshot.
5. **Writing:** workspace API → current membership → section transaction/version/history → response. Không có CRDT/WebSocket/compile chain để nối tiếp.

## C. Business Logic Findings

### C1. Khái niệm domain

| Khái niệm | Kết quả |
|---|---|
| SystemRole / AcademicRole / ProjectRole | Guard runtime phân biệt USER/ADMIN, academic profile và owner/member. Tên role tương thích cũ còn trong `common/authorization/permissions.ts`; không dùng chuỗi Lecturer tự khai làm bằng chứng xác minh |
| Lecturer verification | Active account + verified email + academicRole LECTURER + roleVerificationStatus VERIFIED + positionStatus VERIFIED. UNVERIFIED/PENDING/NEEDS_MORE_INFORMATION/REJECTED không đạt equality guard VERIFIED; affiliation/email trường không tự tạo mentor/reviewer |
| Non-FPT access | Creation tests chấp nhận student/lecturer/researcher ngoài FPT sau onboarding. Không thêm domain restriction |
| Visibility | PRIVATE mặc định. PUBLIC_SUMMARY/PUBLIC chỉ cho bản tóm tắt, không mở nội dung corpus/notes/team |
| Mentorship discovery | CLOSED mặc định; SEEKING_MENTOR là đồng ý hiển thị safe preview, không cấp membership |
| Research stage | Độc lập với lifecycle/status; không khóa navigation theo thứ tự nghiên cứu |
| Team assessment | ACCEPT/SUPPORT của nhóm là nhận định có lịch sử, không được diễn đạt như xác nhận khoa học |
| Mentor feedback | Ý kiến được gắn người và revision; không thay screening/evidence/team conclusion và không tạo formal review assignment |
| Formal review | Verified Lecturer + capability + assignment hợp lệ + revision/round/template; mentor alone không đủ |

**Cần quyết định:** `COMPLETED` cấm ghi mentor guidance cũ, trong khi nhiều thao tác research chỉ coi `ARCHIVED` là read-only. Chưa tự đổi semantics hoàn thành dự án. Quy tắc mentor đang/đã hướng dẫn có phải COI tự động của formal review cũng cần chủ sản phẩm quyết định; hiện guard chặn author/member/owner và conflict đã khai báo/ghi nhận.

### C2. Ma trận quyền hiện hành

Giả định tài khoản hợp lệ và dự án chưa archive. Actor trong mỗi cột không đồng thời có vai trò khác. `Có*` là quyền có điều kiện ở chú thích; `Không` không bị đổi thành quyền bởi UI ẩn/hiện. Admin là admin ngoài dự án.

| Thao tác | OWNER | MEMBER | Active MENTOR | Assigned FORMAL REVIEWER | Nonmember | ADMIN |
|---|---|---|---|---|---|---|
| Đọc private project workspace | Có | Có | Context riêng* | Không | Không | Không tự động |
| Đọc public/mentor-discovery summary | Có | Có | Có* | Có* | Có* | Có* |
| Sửa metadata/settings/privacy | Có | Không | Không | Không | Không | Không |
| Mời/xóa thành viên; chuyển owner | Có | Không | Không | Không | Không | Không |
| Rời dự án | Sau chuyển owner | Có | Không áp dụng | Không áp dụng | Không | Theo membership |
| Xem papers/notes | Có | Có | Context API* | Chỉ artifact được giao* | Không | Không tự động |
| Thêm/xóa/organize nguồn dự án | Có* | Có* | Không | Không | Không | Không |
| Vote screening | Có* | Có* | Không | Không | Không | Không |
| Đổi screening policy/assignment | Có | Không | Không | Không | Không | Không |
| Tạo/sửa/review evidence | Có | Có | Không | Không | Không | Không |
| Tạo/revise gap, team assessment | Có | Có | Không | Không | Không | Không |
| Đọc gap/gửi guidance | Có | Có | Có* | Không | Không | Không |
| Sửa plan/current questions | Có | Có | Không | Không | Không | Không |
| Đọc/comment plan revision | Có | Có | PlanShare* | Không | Không | Không |
| Share/revoke plan share | Có | Không | Không | Không | Không | Không |
| Tạo/sửa task/milestone | Có | Có | Không | Không | Không | Không |
| Xóa task | Có | Chỉ task mình tạo | Không | Không | Không | Không |
| Discussion/reply/decision | Có | Có* | Reply thread được share* | Không | Không | Không |
| Team chat | Có | Có | Không | Không | Không | Moderation riêng* |
| Request mentor/gap guidance | Có* | Có* | Không | Không | Không | Không |
| Quản lý consent/discovery/mentor | Có | Không | Chỉ nhận/từ chối/kết thúc của mình | Không | Không | Không tự động |
| Section draft hiện có | Có | Có | Không | Không | Không | Không tự động |
| Multiple manuscripts / edit LaTeX | Chưa có | Chưa có | Chưa có | Chưa có | Chưa có | Chưa có |
| Download private source PDF | Có | Có | Không | Không | Không | Không tự động |
| Đọc submission/PDF revision | Có | Có | Không | Đúng assignment/revision* | Không | review:assign* |
| Quản lý submission revision | Có* | Author/creator hiện còn member* | Không | Không | Không | review:assign* |
| Tạo yêu cầu formal review | Có* | Không theo owner request flow | Không | Không | Không | Không tự động trong owner request flow |
| Nộp structured formal review | Không do owner | Không do member | Assignment riêng, COI* | Có* | Không | Không do admin alone |
| Archive/restore/delete | Có* | Không | Không | Không | Không | Không tự động |

Điều kiện cần đọc cùng bảng:

- Mentor context hiện cho papers/notes, gaps, reports, legacy evidence và danh sách tên thành viên; không tương đương quyền private source PDF hoặc member edit. Đây là vấn đề phạm vi ở J1.
- PlanShare ghim đúng revision/relationship, cần quan hệ ACTIVE và vẫn VERIFIED; thread mentor chỉ hiện các thread được cấp scope.
- Reviewer chỉ được đọc revision thuộc assignment/round/historical review của chính mình; accepted assignment cần eligibility hiện hành. Historical completed assignment có đường đọc lịch sử riêng. Không mở corpus dự án.
- Admin có đường moderation team chat và quyền review management/submission access qua `review:assign`. Đây là các ngoại lệ đang có, không phải quyền sửa toàn dự án. Cần mô tả công khai trong policy quản trị.
- Screening independent yêu cầu assignment hợp lệ. Team member có thể sửa nội dung nghiên cứu chung, không cần được assign task để cập nhật task; đây là mô hình hiện hành, không phải task assignee độc quyền.
- Team member có thể đề nghị góp ý gap; quản lý quan hệ mentor/chia sẻ plan thuộc owner. Gửi request không tự tạo mentor.
- Archive cấm research writes; đọc lịch sử vẫn được theo quyền hiện hành. Rời dự án, restore/delete owner và thu hồi share vì an toàn có ngoại lệ cụ thể. Delete bị chặn nếu phá hủy nghiên cứu/lịch sử người khác hoặc quan hệ cần giữ; archive là lối thay thế.

Nguồn quyền: `project-workspace.rules.ts`, `project-transaction.ts`, `workspace-access.ts`, `project-screening.service.ts`, `project-plan.service.ts`, `project-discussions.service.ts`, `academic-relationship-access.ts`, `peer-review-access.ts`, `submission.service.ts:43–95`, `common/authorization/permissions.ts`.

## D. Workflow Audit

Các trạng thái bên dưới là trạng thái **sau sửa**. PASS chỉ cho hành vi được mô tả và có evidence thực; không chuyển phần NOT_TESTED thành PASS vì một unit test có tên tương tự.

### D1. Workflow matrix

| Flow | Expected Behavior | Actual Implementation | Status | Evidence | Defect |
|---|---|---|---|---|---|
| Create project | Non-FPT onboarded user, title đủ, PRIVATE/CLOSED, owner+plan atomic, keyed retry một ID | Có DTO/form, server eligibility, idempotencyKey và transaction; trả ID thật | PASS | creation/team 17; create form 5; `project.service.ts:270` | Fresh signup/email/browser journey chưa chạy; API key optional theo tương thích hiện có |
| Invalid create/network failure | Không false success; giữ draft và cùng request key | Form tests có pending click, lost response/remount và malformed stored input | PASS | `create-project-form.test.tsx:34–83` | Không chứng nhận mọi offline/browser crash |
| Invitation → accept | Consent đúng tài khoản/email đã verified; pending không có quyền | Invitation, token binding/hash, outbox, atomic accept; retry không trùng membership | PASS | creation/team: duplicate, bound account, post-registration, concurrent accept | External SMTP chưa thử |
| Decline/cancel/expire/resend | Token cũ vô hiệu; cancel/accept nhất quán | Cooldown, expired state, serialized race | PASS | creation/team:133–174 | Không có |
| Remove/leave/transfer | Không orphan owner; creator cũ mất quyền; lịch sử còn | Current membership + account/project locks | PASS | creation/team:175,220; collaboration revocation tests | Browser session của hai người chưa diễn tập |
| Archive/restore/delete | Read-only/archive giữ lịch sử; restore không tự mở sharing | Guards, pending invite/discovery closure, protected deletion | PASS | creation/team; workspace collaboration; mentorship; review archived test | COMPLETED semantics chưa đồng nhất |
| Plan draft → revision | Partial draft, giữ hidden fields khi đổi approach, version conflicts | JSON/content plan + immutable PlanRevision; expectedVersion | PASS | workspace collaboration:97–114; coordination UI tests | Back/Forward recovery chưa đầy đủ |
| Add/import paper | DOI normalized/deduped, DOI-less không merge theo title, source history | Existing canonical Paper + ProjectPaper; DOI lock, request-key hash | PASS | collaborative research:62–82; source service | Không tự bảo đảm độ đúng metadata nhập từ nguồn |
| Private source PDF | Project-bound permission, bounds, duplicate bytes, safe response | DB bytes/quota/checksum + authorized file endpoint | PASS | collaborative research:73,197 | Provider ACL và full upload fuzzing chưa kiểm tra |
| Remove source with linked work | Không bỏ rơi provenance/evidence | Removal guards và project corpus filters | PASS | workspace collaboration:159; collaborative research:73 | Corpus-scale removal/load chưa đo |
| Exploratory screening | Không bắt buộc dual review; MAYBE/exclusion rationale/history | Policy riêng, versioned decisions | PASS | collaborative research:83 | Không có |
| Independent screening | Vote riêng, blinded reads, conflict resolution không overwrite | Assignments/decisions + final canonical ProjectPaper state | PASS | collaborative research:90,108 | Multi-browser visual journey chưa chạy |
| Evidence extraction | Valid included source, origin/snapshot/locator; pending human review | ProjectEvidenceItem + history; AI suggestion không tự accepted | PASS | collaborative research:126,140; research UI:39–61 | LLM quality chưa kiểm tra |
| Evidence → task/discussion → focused view | ID đúng, legacy tương thích, foreign ID denied | Unified picker + assertWorkspaceLink + `itemId` resolver/deep link | PASS | collaborative research:150; research UI:65,75,81 | Đã sửa trong H4 |
| Gap support/counter → question | Accepted evidence revisions, team rationale, question pins | Gap revision/evidence/assessment/derived plan question | PASS | collaborative research:168,184; workspace plan tests | Không là scientific validation tự động |
| AI analysis → candidate | Corpus được giới hạn project, status candidate, durable jobs | Existing gap/report workers và scope tests | PARTIAL | gap pipeline scope 5; gap validation access/quorum 8 | Actual provider quality/worker failure matrix chưa kiểm tra đầy đủ |
| Task → assigned → done → reopen | Durable retry, active member, notice/history | Task key+revision+activity+notification trong transaction | PASS | workspace collaboration:115,125,131,210,286 | Không có quyền riêng chỉ assignee; đúng mô hình hiện tại |
| Milestone create/update | Persist, history, notify linked assignees khi deadline đổi | Có update/version; create thiếu request-key dedupe | PARTIAL | `project-tasks.service.ts:89` | P2 J3 |
| Discussion/replies | Project scope, mentor scope, retry/history, safe text | Existing ProjectTeamMessage cho thread reply, distinct general chat | PASS | workspace collaboration:216,239; coordination text tests | Không có |
| Decision create/revise | Rationale/history không lấy reaction làm quyết định | Persisted decision/revision; thiếu idempotent create | PARTIAL | workspace collaboration:230; service:125 | P2 J3 |
| Lecturer verified → eligible | Self-declared/institution alone không đủ | Role+position verification, account/email/capability guards | PASS | mentorship 34; peer-review role denials; policy 6 | Hai admin duyệt cùng request: NOT_TESTED trên DB |
| Owner invites lecturer | Verified/available, consent, capacity, no member promotion | Dedicated request/relationship/notification | PASS | mentorship:96–149 | Delivery external chưa kiểm tra |
| Lecturer offers mentorship | SEEKING safe preview, owner consent; no private corpus while pending | Discovery projection và explicit acceptance | PASS | mentorship:205,218; creation summary test | Không có |
| Active mentor artifact access | Owner-approved resources/revisions, read/guidance only | Exact PlanShare nhưng existing context API rộng theo active relation | PARTIAL | `mentorship-context.service.ts:7`; plan share tests | P1 policy J1 |
| Mentor gap feedback → team revise → end | Version-pinned feedback/history; no team overwrite; revoke after end | Durable guidance activity + notices; tests revise then terminate | PASS | collaborative research mentor test; notification guards; mentorship termination | Không phải manuscript feedback workflow |
| Formal review exact version | Verified assigned Lecturer, no member/self review, immutable revision/round | SubmissionRevision + ReviewerAssignment + HumanReview | PASS | peer-review 13 | Transient Prisma timeout khi chạy nhóm; xem I |
| Manuscript snapshot → formal review | Source snapshot đúng revision, không đổi source được review | Chỉ có report/PDF submission revisions | NOT_IMPLEMENTED | `review-request.service.ts:67`; `submission.service.ts:245` | Thiếu source snapshot bridge |
| Legacy section editing | Persist/history, conflict, no writes sau removal/archive | Recheck authorization trong transaction, SectionRevision | PASS | collaboration tests cả 4 operation × removal/archive | Không phải realtime collaborative editing |
| Create multiple LaTeX manuscripts | Templates/files/private ownership | Không có Manuscript subsystem | NOT_IMPLEMENTED | DraftWorkspace unique project; không có source file tree runtime | J2 |
| Two-user LaTeX convergence/offline/restart | CRDT + durable acknowledged updates | Không có document server/protocol | NOT_IMPLEMENTED | Không có implementation để chạy scenario D | Không mô phỏng PASS |
| Compile → PDF source revision | Durable job, isolated compiler, authorized result | Không có application compile pipeline | NOT_IMPLEMENTED | Không có compile models/worker/routes | Production isolation: BLOCKED |
| Source snapshots/restore/ZIP/BibTeX | Consistent immutable tree, bibliography not evidence | Không có file tree/snapshot/bibliography system | NOT_IMPLEMENTED | Không có manuscript source implementation | J2 |
| SSE chat after revoke | Không giao event riêng tư sau mất session/member/account | Recheck trước event, heartbeat 25 giây và close | PASS | HTTP streaming cả team-chat/chat × 3 revoke modes | Multi-instance delivery chưa có |
| AI chat save after access loss | Không lưu turn; gọi refund trên lỗi persistence | Transaction live membership + refund path | PASS | Real DB test với LLM/credits mock | Crash giữa charge/refund chưa có durable reconciliation proof |
| Cross-module UI refresh | Mutation refresh own research/project, không ảnh hưởng project khác | Thêm scoped research invalidation | PASS | coordination query cache test | Không thay realtime cross-device sync |
| Real SMTP/Expo delivery | Giao đến recipient thật và rõ trạng thái | Có adapter/outbox, transport mocked/disabled khi test | NOT_TESTED | Các bài test delivery chỉ chứng minh claim/intent/template | Cần staging delivery exercise |

### D2. Mandatory scenarios A–F

| Scenario | Kết quả thực hiện | Status |
|---|---|---|
| A — Non-FPT student tạo dự án → mời → nhận → mục tiêu | Creation/team tests dùng persona ngoài FPT, transaction owner/defaults/invite/accept; workspace tests lưu objectives và đọc lại. UI form/draft/redirect đã kiểm tra riêng. Không có một browser signup/email test nối toàn chuỗi | PARTIAL — backend segments verified; fresh browser journey NOT_TESTED |
| B — Paper → screen → evidence → candidate → counterevidence → question | Persistence tests kiểm tra source/import, human vote, accepted extraction revisions, gap support/counter, pinned derived question. AI scope tests dùng LLM mock; không có kết quả provider thật được chứng thực | PARTIAL — persisted research chain verified; live AI NOT_TESTED |
| C — Verified lecturer → consent → gap feedback → team revision → end | Mentorship suite kiểm tra consent/eligibility; research test gửi feedback đúng revision, nhóm sửa mà không rewrite feedback, kết thúc rồi mất quyền; notice/deep link có regression | PARTIAL — workflow đạt trong DB; generic mentor artifact scope còn J1 |
| D — Hai member sửa LaTeX → reconnect → safe compile → snapshot | Không có implementation; không mở hai editor giả hoặc xem section version conflict như convergence | NOT_IMPLEMENTED; compiler safety BLOCKED |
| E — Immutable manuscript → assigned verified lecturer → formal assessment/history | Existing immutable report/PDF SubmissionRevision, assignment, structured review, resubmit/history đạt. Nguồn manuscript/file snapshot chưa có | PARTIAL |
| F — Outsider reads/PDF/forged membership/mentor/review/room | HTTP/DB tests deny project/PDF/cross-project IDs, forged invitation/mentorship và review without assignment. SSE unauthorized/revoked session covered. Manuscript edits/WebSocket rooms không tồn tại | PARTIAL — implemented endpoints denied; absent subsystem NOT_IMPLEMENTED |

### D3. Concurrency và failure recovery

| Tình huống | Bằng chứng / kết quả |
|---|---|
| Hai người sửa metadata/plan/task/evidence/gap | expectedUpdatedAt/expectedVersion và locks; chỉ một cập nhật từ revision cũ thắng, conflict không overwrite draft của người còn lại |
| Hai người screening | Vote tách theo reviewer; final conflict xử lý riêng, history còn; removal/rejoin không tái kích hoạt phiếu cũ |
| Accept invitation/mentor đồng thời | DB tests có accept/accept, accept/cancel, capacity across pending requests; chỉ một kết quả nhất quán |
| Member removed/archive giữa precheck và write | Section regression đặt thay đổi ở khe giữa hai bước; cả createSection/updateSection/addComment/updateComment bị chặn, source/comment/history không bị thay |
| Member removed lúc AI chạy | Provider mock thực hiện removal, DB từ chối save turn, refund được gọi, không có chat rows |
| Session revoked sau SSE ready | Token ký và refresh family thật; có authorized event trước, event sau revoke không đến và stream kết thúc |
| Mentor ended/verification lost | Subsequent reads/comments denied, feedback/history được giữ; pending share không tự bỏ qua active/verified condition |
| Superseded review revision | Assignment/review vẫn ghim bản cũ; resubmit có round/revision rules; foreign revision bị chặn |
| API lỗi/network lost response | Component giữ create/plan/task/evidence/decision drafts và retry keys nơi đã có; server durable keys tránh tạo trùng project/task/thread/reply |
| Email/queue failure | Persistence/outbox không rollback consent đã commit; retry definite failures, uncertain delivery không tự replay vô hạn; chưa kiểm tra SMTP thật |
| Hai admin cùng duyệt verification | NOT_TESTED trên PostgreSQL trong lượt này; policy/unit tests không thay thế concurrency test |
| Upload failure/provider ACL | Local DB private-source isolation và invalid file đã kiểm tra; provider outage/ACL/full fuzzing NOT_TESTED |
| CRDT restart/offline/undo; source đổi khi compile | NOT_IMPLEMENTED; không có phép thử hợp lệ để gán PASS |

## E. UI/UX Findings

### E1. Kiểm tra trực tiếp bản đã deploy localhost

Đã dùng phiên đăng nhập được người dùng khôi phục để đọc dự án thật; không thêm gap/evidence/mentor giả. Các tab overview, plan, library, evidence, gaps, tasks, discussions, support, reports, submissions, members/settings, contributions đã mở được. Các nhánh có dữ liệu phong phú hơn được xác nhận qua component và DB fixtures riêng, không suy từ empty state.

Kiểm tra sau build cuối:

- Desktop 1440×1000: body `rgb(255,255,255)`, document width 1425 ≤ innerWidth 1440; không tràn ngang.
- Mobile 390×844: body `rgb(255,255,255)`, document width 375 ≤ innerWidth 390 cho library/evidence. Long paper title không đẩy layout ra ngang.
- Popup đọc bài mobile mở đúng paper; dialog khoảng 359 px, scrollWidth bằng clientWidth 358, đóng được mà không thay note/screening.
- Evidence empty state bỏ column headers và pager rỗng; có next action và giải thích review không chứng minh kết luận khoa học.
- Reports empty state đã dịch tiếng Việt trên bản mới: “Chưa có sản phẩm nghiên cứu”, mô tả và CTA tiếng Việt.
- Mobile navigation chuyển sang section select. Đã reset viewport override về kích thước ban đầu sau kiểm tra.

Ảnh kiểm tra bản cuối:

- [Desktop evidence](D:/lumi-gap/artifacts/project-workflow-audit/desktop-evidence.png)
- [Mobile literature](D:/lumi-gap/artifacts/project-workflow-audit/mobile-literature.png)
- [Mobile reader](D:/lumi-gap/artifacts/project-workflow-audit/mobile-paper-reader.png)
- [Mobile evidence](D:/lumi-gap/artifacts/project-workflow-audit/mobile-evidence.png)

### E2. Persona journeys

| Persona | Goal / entry | Steps và expected behavior | Permissions | Blocker / success |
|---|---|---|---|---|
| A Student mới | Bắt đầu ý tưởng từ Projects → Create | Chỉ title bắt buộc → PRIVATE/CLOSED project → lưu mục tiêu chưa hoàn chỉnh → thêm nguồn sau | Active verified-email/onboarded user, không cần verified Lecturer hoặc có đội trước | Signup/email browser chưa test; success là ID project/owner/plan lưu thật và mở đúng workspace |
| B Researcher liên trường | Cùng đọc/sàng lọc/evidence | Nhận invite theo verified email → nguồn → screening theo approach → review extraction → gap/question | Current MEMBER; không bị FPT domain restriction | Thiếu manuscript chain; success là provenance/history còn qua reload |
| C Owner | Quản lý team và research access | Mời/accept state → share revision → task/discussion → archive/transfer khi cần | Owner-only settings/member/mentor management | Mentor generic context rộng hơn PlanShare; success là consent/quyền hiện hành phản ánh đúng, không orphan owner |
| D Verified Lecturer mentor | Góp ý hướng nghiên cứu | Opt-in availability → nhận offer/invite → xem context/shared revision → feedback → team revise → end | Verified active relationship, guidance; không edit conclusions/screening | Cần scope policy thống nhất; success là feedback đúng bản, history còn, quyền hết khi relationship ended |
| E Assigned Lecturer reviewer | Structured review một phiên bản | Nhận request → accept → xem pinned revision → lưu draft riêng → submit assessment → xem lịch sử | Verified/capability/assignment/COI/round hợp lệ | Chưa có manuscript source snapshot; success là review không bị chuyển sang revision mới |
| F Member viết LaTeX | Sửa đồng thời và xuất PDF | Create manuscript → two-user edit → reconnect → compile → snapshot | Cần per-document read/write/session guards | NOT_IMPLEMENTED; section editor hiện tại không đáp ứng success condition |

### E3. Vấn đề còn lại

| Mức | Vấn đề | Hướng xử lý |
|---|---|---|
| P2 | Footer Privacy/Terms/Support hiện trỏ lại route project, không đến nội dung tương ứng | Cấp route/trang hoặc support destination thật; tránh link tạo cảm giác đã có policy |
| P2 | Khi session hết hạn từng thấy project error chung thay vì hướng dẫn đăng nhập lại rõ ràng | Phân biệt 401/403/404 và giữ return URL; không hiển thị false “project missing” |
| P2 | Bảo vệ draft chủ yếu app controls + beforeunload; Back/Forward/unmount/crash chưa có recovery hoàn chỉnh | Router-aware navigation guard và local draft recovery có TTL/user/project scope |
| P2 | “Sản phẩm nghiên cứu” hiện chủ yếu là report, còn artifact picker có tên Writing workspace cho section draft | Copy phải nói rõ loại output; không thêm nút “LaTeX collaboration” trước khi có backend |
| P2 | Imported record đang có title là tên journal và thiếu tác giả trên dữ liệu thật | Kiểm tra chất lượng metadata/upstream import; không bịa tác giả, năm hoặc đổi nghiên cứu của user trong audit |
| P3 | Một số accessible labels/header vẫn tiếng Anh (Primary navigation, Change language...) | Rà i18n/accessibility theo bộ component chung; chưa có screenreader audit đầy đủ |

## F. Security Findings

### F1. Lỗi xác nhận và đã sửa

| ID | Severity trước sửa | Vấn đề / bản sửa / bằng chứng |
|---|---|---|
| SEC-01 | P0 — private data exposure qua session đã revoke | SSE trước chỉ có quyền ở bước đầu và project access; thêm `assertLiveRequestSession`, verify JWT và current refresh family trước event/heartbeat. Actual HTTP test cả hai routes, session/member/account revoke đều đóng stream trước private event |
| SEC-02 | P1 — mutation sau mất quyền | Team chat/AI turn/pin không cùng transaction với quyền hiện hành; thêm khóa và authorizeProjectTransaction; AI late-save bị chặn/refund path được gọi |
| SEC-03 | P1 — legacy editor authorization race | Initial section precheck không đủ chống removal/archive trước commit; khóa account/project và authorize lại cho create/update/comment/resolve, reread section version khi comment |

Heartbeat là 25 giây; khi có event, guard chạy trước event đó. Không tuyên bố đây là push revocation đồng bộ tức thời ở mọi network/process. Đây là SSE chat, không phải WebSocket manuscript room security.

### F2. Biên đã kiểm tra và biên chưa đủ

- Current membership thay historical creator attribution khi đọc corpus/report/draft. Pending invitation/mentor request không cấp quyền.
- Đã kiểm tra forged project/resource IDs, foreign evidence/task/discussion links, private PDF access, owner-only operations, nonverified mentor/reviewer, assignment/revision mismatch.
- Parameterized Prisma SQL dùng cho artifact picker/provenance; user text hiển thị như text trong component tests, không chạy HTML được nhập.
- Invitation tokens được hash; durable email payload mã hóa AES-GCM ràng buộc invitation ID. Notification thường không chứa nội dung nghiên cứu riêng tư.
- Worker kiểm tra current access trước giao thông báo workspace. GAP_GUIDANCE yêu cầu đúng hoạt động/relationship verified; forged activity/user không mở đường nhận.
- ADMIN không tự có academic verification hoặc project membership. Existing review-management/team-chat moderation exceptions được giữ và ghi rõ ở C2.
- Mentor context rộng là policy gap còn mở, không gán thành outsider bypass đã chứng minh. Chưa thay quyền âm thầm.
- Private source bytes endpoint được kiểm tra; bucket/CDN ACL, mọi URL signed trong từng provider, toàn bộ upload attack surface chưa được audit thực nghiệm.
- Không có product compiler đang được thêm/chạy trong lượt này. Không có bằng chứng sandbox để kết luận production compilation an toàn.
- Không chứng nhận pen-test toàn ứng dụng, CSP/XSS mọi renderer, distributed revocation hoặc email privacy trên mọi template.

## G. Data Integrity Findings

### G1. Các bảo đảm quan sát được

| Biên dữ liệu | Cơ chế / kiểm tra |
|---|---|
| Project/owner/initial plan | Transaction tạo cùng nhau; owner transfer/remove/leave serialize; lost response retry không tạo project thứ hai |
| Authorization transaction | `lockProjectAccounts`: tài khoản sort rồi project; current account/email/membership được kiểm tra trước mutation; giữ thứ tự khóa dùng chung với mentorship |
| Concurrent changes | expectedVersion/updatedAt, immutable revision/activity trong transaction; conflicting clients không silent overwrite |
| Canonical bibliographic identity | Paper tách ProjectPaper; DOI normalized + transaction advisory lock; không merge DOI-less papers chỉ vì cùng title |
| Screening | Reviewer decisions tách nhau; final ProjectPaper là kết quả team; history và stale-vote/rejoin policy có test |
| Evidence/gaps | Evidence provenance/source snapshot + revision; accepted extraction vẫn là human review state; gap support/counter liên kết revision và team rationale riêng |
| Research question | Derive ghim gap/evidence đã dùng vào plan question; revise gap không rewrite provenance cũ |
| Cross-module artifact links | Structured evidence và legacy evidence được xác thực cùng project; không tạo một Evidence subsystem mới để che sự lệch ID |
| Notification integrity | Invitation/consent/task intent và related activity được commit bền vững; event keys chống duplicate ở các flow có hỗ trợ |
| Formal review | Immutable SubmissionRevision; assignment/human review giữ revision/round/template; resubmission không sửa review cũ |
| Section history | Version update và SectionRevision cùng transaction; authorization race tests xác nhận rejected writes giữ nguyên content/comment states |

### G2. Giới hạn

- Polymorphic artifact IDs cần service validation; không phải mọi kiểu liên kết đều có thể dựa vào một FK. Không tuyên bố đã quét hết orphan record trong dữ liệu production.
- Milestone/decision create chưa có durable idempotency. Disable button chỉ giảm double-click, không bảo vệ response bị mất. Create Project UI luôn gửi `idempotencyKey`; server chỉ dedupe khi client gửi key này, không tự coi hai request không key là cùng một dự án.
- Chat event hubs trong process không cung cấp replay/delivery giữa nhiều API instance. DB history bền vững không đồng nghĩa event transport bền vững.
- AI chat charge/refund là các bước riêng. Test chứng minh gọi refund khi save bị từ chối, không chứng minh tự phục hồi nếu process chết giữa hai bước.
- Project detail hydration vẫn lấy nhiều/đủ paper data của project ở đường cũ, dù research endpoints mới có pagination. Chưa có corpus-scale query/load benchmark.
- Source snapshots, merge/undo, restore tree và export ZIP của manuscript chưa có dữ liệu để kiểm tra.

## H. Fixes Applied

Danh sách dưới chỉ mô tả sửa trong lượt audit này; working tree còn nhiều implementation/migration từ những bước trước. Không dùng toàn bộ `git diff` như bằng chứng tất cả là bản sửa audit mới.

| Nhóm | Files thay đổi | Tác dụng / xác minh |
|---|---|---|
| H1 Session-aware SSE | `apps/backend/src/common/middleware/auth.ts`; `modules/projects/project-team-chat.controller.ts`; `project-chat.controller.ts` | Verify token/session/account trước event và heartbeat, close khi fail; streaming tests thật |
| H2 Live chat writes/credits | `modules/projects/project-team-chat.service.ts`; `project-chat.service.ts` | Active-account check, transaction membership/archive guard cho write/pin; charge sau prompt preparation; refund khi không lưu được turn |
| H3 Section editor authorization | `modules/workspaces/workspace.service.ts` | Khóa/recheck trong create workspace/section/update/comment/resolve; comment ghi version hiện hành; 4 operations × 2 revoke modes |
| H4 Mentor gap delivery | `modules/projects/project-gap-research.service.ts`; `workspace-notification-access.ts`; `apps/web/src/features/notifications/utils/notification-destination.ts`; `apps/web/src/pages/academics/academic-support.tsx` | GAP_GUIDANCE → mentor context gap, mentor reply → team overview; chấp nhận pending legacy eventKey đúng loại; current verified relationship check |
| H5 Evidence artifact continuity | `modules/projects/workspace-access.ts`; `project-overview.service.ts`; `project-evidence.service.ts`; `dto/project-research.schema.ts`; `packages/shared-types/src/project-research.ts`; `apps/web/src/features/projects/api/project-research.api.ts`; `components/workspace-common.tsx`; `components/research-evidence.tsx`; `apps/web/src/i18n/locales/research-workflow.ts` | Picker thống nhất, giữ ID, focused/legacy resolution, related gap links, foreign IDs 404; không mất draft khi quay lại matrix |
| H6 Fresh connected UI | `apps/web/src/features/projects/hooks/use-workspace.ts` | Invalidate own user/project research cache sau command, unrelated project giữ nguyên |
| H7 Empty state/i18n | `apps/web/src/features/projects/components/research-evidence.tsx`; `apps/web/src/pages/projects/project-detail.tsx:630` | Không hiện empty table headers/pager; t() cho 3 report strings đã có translations; verified bản Docker mới |
| Regression coverage | `workspace-collaboration.persistence.test.ts`; `collaborative-research.persistence.test.ts`; `apps/web/src/features/projects/__tests__/research-workflow.test.tsx`; `workspace-coordination.test.tsx`; `apps/web/src/features/notifications/utils/notification-destination.test.ts` | Test quyền thu hồi/races/provenance/deep links/cache/destination; dùng disposable PostgreSQL và component fixtures |

Các đường dẫn `modules/...` trong H đều dưới `apps/backend/src/`; `components/...` trong H5 dưới `apps/web/src/features/projects/`.

## I. Test Results

### I1. Môi trường và cách đọc evidence

- PostgreSQL/pgvector disposable: `lumigap-workspace-test-20261014`, port 15439; Redis: `lumigap-workspace-redis-20261014`, port 16389.
- Các suite persistence bật `PROJECT_SLICE_TEST=1`, `MENTORSHIP_INTEGRATION=1`, `STUDENT_AFFILIATION_INTEGRATION=1`; DATABASE_URL/REDIS_URL trỏ môi trường test; `EMAIL_DELIVERY_MODE=disabled`.
- Database rows/transactions/locks là thật. Một số provider, credit charge/refund, delivery hoặc injection seam dùng mock/spy; không ghi nhận thành công của dịch vụ ngoài từ các test này.
- Hai container disposable đã **stop**, không xóa volume hoặc dừng stack chính. Local backend/web/workers đã cập nhật từ image build.

### I2. Backend

Đường dẫn các suite projects: `apps/backend/src/modules/projects/__tests__/`; các suite khác ở module tương ứng.

| Suite | Cases đạt lũy kế | Loại |
|---|---:|---|
| workspace-collaboration.persistence | 26 | PostgreSQL, actual HTTP/session/SSE ở các cases tương ứng |
| collaborative-research.persistence | 12 | PostgreSQL/private source/provenance/mentor/research chain |
| mentorship-workflow.persistence | 34 | PostgreSQL consent/capacity/termination; transport mocked |
| project-creation-team.persistence | 17 | PostgreSQL lifecycle/invite/concurrency |
| academic-relationships.persistence | 9 | PostgreSQL relationship/access |
| project-workspace.persistence | 5 | PostgreSQL legacy workspace |
| peer-review.persistence | 13 | PostgreSQL assignment/revision/review |
| gap-validation-access.persistence | 4 | PostgreSQL validation access |
| gap-validation-quorum.persistence | 4 | PostgreSQL quorum/current revision |
| gap-pipeline-scope.persistence | 5 | PostgreSQL/pipeline; AI output mocked |
| position-verification.lifecycle | 9 | Mocked unit lifecycle; không là DB concurrency proof |
| academic-verification.policy | 6 | Unit policy |
| project-chat | 17 | Unit chat behavior |
| **Tổng** | **161** | Không tính lặp các lượt rerun |
| postgres-only-runtime | **4** | Build gate; kiểm tra runtime import boundary |

Các lệnh kiểm tra đã dùng trong phiên gồm `pnpm exec vitest run --fileParallelism=false` với các file suite phía trên, được chia nhiều lượt. Hai lượt xác minh sau bản sửa liên quan:

```powershell
# cwd: D:\lumi-gap\apps\backend; environment trỏ DB/Redis test
pnpm exec vitest run --fileParallelism=false src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts src/modules/projects/__tests__/project-creation-team.persistence.test.ts
# 43/43 đạt sau sửa section authorization

pnpm exec vitest run --fileParallelism=false src/modules/reviews/__tests__/peer-review.persistence.test.ts
# 13/13 đạt khi chạy riêng
```

Research + gap pipeline scope đã rerun **17/17 đạt** sau thêm mentor-feedback → team revision assertions. Một file filter không tồn tại `src/modules/reports/__tests__/report-gap-fanout.test.ts` có trong lượt gọi đó nhưng **không chạy**; không có claim fanout test đã được thực thi.

Lượt chạy nhóm 12 suites trước đó có **153 pass / 1 fail** do Prisma timeout khi truy vấn revision trong `review-request.service.ts::summary`. Không phải assertion business logic thất bại. Suite peer-review chạy riêng sau đó đạt 13/13. Vẫn ghi nhận timeout này là độ ổn định môi trường/query cần theo dõi, không coi một rerun là bằng chứng chịu tải.

### I3. Frontend

| Suite | Cases |
|---|---:|
| research-workflow | 12 |
| workspace-coordination | 13 |
| create-project-form | 5 |
| project-team-settings | 4 |
| project-workspace-navigation | 10 |
| notification-destination | 37 |
| **Tổng** | **81** |

Chạy bằng `pnpm exec vitest run` với các file tương ứng. Research 12 cases đã chạy lại sau dọn empty matrix. Component tests dùng API fixtures; không thay thế full browser E2E.

### I4. Typecheck, lint, build và runtime

| Check | Kết quả |
|---|---|
| Shared types build trước các consumer | PASS — tránh race khi xóa/rebuild dist |
| Backend native `pnpm exec tsc --noEmit` | PASS |
| Web native `pnpm exec tsc -b` | PASS |
| ESLint targeted backend/frontend modified files và regression tests | PASS |
| Final `pnpm exec eslint src/pages/projects/project-detail.tsx` (cwd apps/web) | PASS, exit 0 |
| `docker compose build backend web` | PASS: shared types, Prisma generation, backend tsc, runtime boundary 4 tests, web tsc/Vite |
| Final `docker compose build web` | PASS, exit 0; gồm bản dịch và evidence empty-state cuối |
| `docker compose up -d --no-deps --no-build web` | PASS; web container recreated/started |
| Backend và các worker dùng image đã rebuild | Đã recreate; không chạy migration mới trong audit |
| `GET http://localhost:4000/ready` | PASS, PostgreSQL và Redis `ok: true` |
| Browser read-only desktop/mobile | PASS trong phạm vi E1, bằng account owner/admin đang là owner của project |
| Full automated Playwright E2E mọi persona | NOT_TESTED |
| Native Prisma CLI | Có vấn đề dependency jiti/createJiti từ môi trường trước; Docker Prisma generation đạt. Không cài dependency để che lỗi |
| `git diff --check` | PASS; chỉ warning LF/CRLF của working tree Windows, không có whitespace error |

Không chạy toàn bộ repo lint/test/mobile hoặc tuyên bố CI GitHub đã xanh từ các targeted gates này. Không kiểm tra screenreader, p95/load, external storage ACL, SMTP/Expo delivery thật hoặc actual LLM factual accuracy.

## J. Unresolved Issues

| ID | Priority | Vấn đề còn mở | Quyết định/điều kiện để đóng |
|---|---|---|---|
| J1 | P1 — access policy trước mở rộng mentor | Active mentor đọc context rộng, trong khi PlanShare là exact grant. Chưa thống nhất owner consent cho papers/notes/gaps/reports/evidence/members | Chốt existing relationship consent có nghĩa gì. Nếu cần resource grants, thiết kế một cơ chế thống nhất, default phù hợp và migration an toàn; không tự thu hồi quyền đang được chấp nhận |
| J2 | P1 — thiếu tính năng cốt lõi theo yêu cầu | Multiple manuscripts, real collaborative LaTeX, CRDT persistence, source snapshots, bibliography, compiler/result chain đều thiếu | Thiết kế/triển khai Manuscript dựa trên project membership hiện có; compiler safety BLOCKED đến khi isolation tests đạt |
| J3 | P2 | Tạo milestone và decision chưa idempotent sau response loss | Durable scoped request key + payload hash + retry result, cần schema/migration riêng được review |
| J4 | P2 | Chat SSE hubs trong process; không có multi-instance delivery/replay | Định nghĩa delivery/reconnect guarantee; shared transport và replay cursor nếu cần; giữ DB history làm nguồn thật |
| J5 | P2 | AI charge/refund có crash window, chưa có recovery proof | Durable reconciliation theo transaction/request ID; test process death sau charge/trước save/refund |
| J6 | P2 | Project hydrate/paper retrieval có đường lấy toàn corpus; một Prisma timeout ở broad test | Query budget/pagination trên đường cũ; đo representative dataset trước tối ưu; kiểm tra timeout tái diễn |
| J7 | P2 | Draft recovery/expired-session/footer routes/i18n labels còn bất tiện | Chỉnh route guards, draft persistence và links/copy có hành vi thật; xem E3 |
| J8 | P2 — policy | COMPLETED write rules và mentor-review COI chưa rõ | Chốt domain rules, thêm state/COI matrix và regression; không suy đoán thay người dùng |
| J9 | Verification gap | Email/push, multi-browser writes, double-admin verification, worker crash recovery, storage-provider ACL chưa thực nghiệm | Staging sandbox + disposable personas/provider stubs theo fault cases; không dùng dữ liệu nghiên cứu thật |

Các bản sửa P0/P1 đã xác nhận trong scope an toàn nằm ở H/F1. J1/J2 cần quyết định kiến trúc hoặc chính sách; không được gọi là đã xử lý chỉ vì test của phần khác đạt.

## K. Recommended Next Steps

1. **Chốt mentor artifact scope và COI/lifecycle policy.** Viết owner consent rõ trong UI/API, giữ phân biệt member/mentor/reviewer. Đây là dependency của manuscript sharing và feedback.
2. **Triển khai Manuscript tối thiểu với nguồn dữ liệu bền vững.** Multiple manuscripts, validated templates/path/file tree, per-document membership access, immutable source revisions; tái sử dụng project và academic relationships hiện có.
3. **Hoàn thiện realtime writing trước khi quảng bá collaboration.** Chọn CRDT protocol/persistence, update acknowledgement, reconnect/offline merge và undo; test hai tài khoản thật, restart, removal và session revocation. Presence không thay synchronization.
4. **Thiết kế compiler riêng và kiểm chứng sandbox.** Capture exact source revision, durable queue, CPU/memory/time/storage quotas, no shell escape, network deny, filesystem isolation, authorized private output. Chỉ mở production sau attack/recovery tests.
5. **Nối immutable source snapshot với mentor feedback/formal review.** Reviewer vẫn phải có verified eligibility và explicit assignment; PDF/ZIP/BibTeX phải mô tả đúng source revision, không thay academic evidence bằng citation.
6. **Bổ sung idempotency/reconciliation còn thiếu.** Milestone/decision create, AI credits crash recovery, shared SSE delivery nếu scale nhiều API instance.
7. **Khép vòng kiểm chứng staging.** Fresh non-FPT signup → invite/email → research → mentor → immutable review qua browser; SMTP/Expo sandbox; dual-admin race; provider/worker failure và query/load profile.
8. **Dọn UX có tác động rõ.** Session-specific guidance, draft Back/Forward/recovery, footer thật, metadata quality và accessibility/i18n. Giữ nền trắng `#FFFFFF`, search/filter gọn và không thêm controls cho năng lực chưa có.

Điều kiện báo cáo “hoàn chỉnh” là các đoạn thiếu của D/E/F được thực thi và chứng minh bằng persistent state, authorization, recovery và UI thực. Báo cáo này chưa đưa ra cam kết production readiness cho toàn bộ hệ thống.

Gợi ý commit sau khi review riêng các file audit, tránh gom toàn bộ working tree đang có: `fix(projects): harden workspace authorization and research links`.
