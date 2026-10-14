# LumiGap: kiểm tra workspace nghiên cứu và gia cố

Ngày kiểm tra: **14/10/2026**. Phạm vi: working tree tại `D:\lumi-gap`, HEAD `db20cc6`, cùng các thay đổi chưa commit. Đây là kết quả kiểm tra mã và bản **localhost:8080**, không phải chứng nhận cho bản GitHub hoặc production.

Tài liệu này cập nhật kết quả thực thi sau [đề xuất kiến trúc](research-workspace-architecture-audit.md). Các ADR và hợp đồng API đề xuất không được tính là tính năng đã triển khai.

## A. Executive Summary

**Kết luận: có thể trình diễn phần cộng tác nghiên cứu đã kiểm chứng; chưa đạt toàn bộ luồng nghiên cứu và chưa sẵn sàng production theo yêu cầu này.**

Đã triển khai lưu trữ thật cho kế hoạch, lịch sử kế hoạch, công việc/cột mốc, thảo luận, quyết định và chia sẻ một phiên bản kế hoạch với cố vấn. Các phần này dùng Project, ProjectMember, identity, messages và notifications hiện có. Không tạo hệ thống dự án hoặc phản biện song song.

Đã sửa các lỗi ghi đè khi sửa đồng thời, mất bản nháp khi dữ liệu tự tải lại, quyền của người đã rời dự án, thao tác corpus trong dự án lưu trữ, liên kết bằng chứng khác dự án, thông báo cho cố vấn và danh sách quyền chia sẻ bị cắt. Câu hỏi trong kế hoạch có thể lưu nguồn khoảng trống và bằng chứng; backend kiểm tra nguồn và ngăn xóa câu hỏi đang được công việc/thảo luận/quyết định tham chiếu.

**Chưa có** manuscript LaTeX, file tree, CRDT gateway, durable update journal, compiler sandbox, snapshot nguồn hoặc liên kết source revision với PDF. Không có endpoint compile giả được thêm để che phần thiếu. DraftWorkspace hiện tại là trình soạn các section, không phải editor LaTeX cộng tác.

Hai vấn đề cần giải quyết trước khi tuyên bố phạm vi đầy đủ: cơ chế cố vấn cũ cấp quyền đọc bối cảnh nghiên cứu rộng theo quan hệ ACTIVE, trong khi cơ chế kế hoạch mới dùng quyền chia sẻ từng revision; quá trình thẩm định khoảng trống chưa có vòng đánh giá gắn với phiên bản bất biến. Chi tiết và mức độ ở C, F, J.

## B. Architecture Findings

### Nguồn dữ liệu có thẩm quyền

| Nội dung | Nguồn thực tế | Giới hạn |
|---|---|---|
| Danh tính/phiên đăng nhập | User, AcademicProfile, RefreshToken; RS256 và kiểm tra session đang hoạt động | Không lấy vai trò từ nhãn frontend. |
| Dự án/nhóm | Project, ProjectMember, ProjectInvitation | OWNER quản lý dự án; mentor là quan hệ riêng, không tự thành member. |
| Kế hoạch | ResearchPlan hiện hành, PlanRevision bất biến khi UPDATE | Criteria cũ được chụp vào cùng lịch sử; quyền cố vấn dựa trên PlanShare. |
| Công việc | ProjectTask, ProjectMilestone, ProjectWorkspaceRevision | Có optimistic version, trạng thái hoàn thành/mở lại, lịch sử. |
| Thảo luận | ProjectDiscussion + ProjectTeamMessage hiện có | thread_id NULL giữ lại chat cũ và read receipts. |
| Quyết định | ProjectDecision + ProjectWorkspaceRevision | Ghi rõ người lập và lý do; không tự biến bình luận thành quyết định. |
| Tài liệu/sàng lọc | ProjectPaper | LiteratureCorpus/CorpusPaper vẫn là collection/evidence phụ; hai loại included cần tiếp tục thống nhất ngữ nghĩa. |
| Khoảng trống/bằng chứng | ResearchGap, GapEvidenceRecord, GapValidation | Candidate và tín hiệu AI không tương đương kết luận khoa học. |
| Cố vấn | MentorshipRequest, MentorRelationship; PlanShare cho kế hoạch | Hai phạm vi truy cập cũ/mới còn khác nhau. |
| Phản biện | SubmissionRevision, ReviewRequest, ReviewerAssignment, HumanReview | Assignment/revision có thẩm quyền, không phải danh xưng Lecturer đơn thuần. |
| Bản thảo hiện có | DraftWorkspace, WorkspaceSection, section revisions/comments | Không có CRDT/file source/PDF compile pipeline. |
| Thông báo | Notification trong PostgreSQL, BullMQ và worker recovery | Nội dung workspace tối thiểu; email workspace mới đang SKIPPED. |

### Ma trận bao phủ yêu cầu

API dưới đây có tiền tố `/api/v1`. `P` là `/projects/:id`; UI workspace là `/projects/:id?tab=...`. IMPLEMENTED chỉ áp dụng cho khả năng được mô tả, không thay cho kết luận E2E đầy đủ.

| Module | Trạng thái | Source/API | Entity/UI | Bằng chứng và phần thiếu/rủi ro |
|---|---|---|---|---|
| Project Creation | IMPLEMENTED | `projects/project.service.ts`, POST `/projects` | Project, owner membership, ResearchPlan; create-project-form | 17 integration cases nhóm creation/team; 5 component cases tạo dự án. Title bắt buộc, mặc định private, không ép mentor/team/plan hoàn chỉnh. Chưa chạy lại email đăng ký/onboarding từ trình duyệt mới. |
| Project Settings | IMPLEMENTED | PUT P, archive/restore/transfer-ownership | Project.version; `tab=members` | Owner-only, cập nhật lỗi thời bị chặn; không biến PUBLIC thành công khai nội dung nội bộ. |
| Team Membership | IMPLEMENTED | P/team, invitations, leave | ProjectMember/Invitation; `tab=members` | Consent, email được xác minh, retry, expiration, cancellation/accept races, chuyển owner và rời nhóm được kiểm tra bằng DB thật. |
| Project Privacy | PARTIAL | Project hydration, project membership, workspace-access | PRIVATE/PUBLIC summary | Member-only nội dung workspace đã kiểm tra; bucket ACL, toàn bộ PDF storage và mọi API cũ chưa được kiểm tra thực địa. |
| Mentorship Discovery | IMPLEMENTED | `/projects/academic-support/opportunities`, P/available-mentors, P/mentorship-discovery | safe preview, SEEKING_MENTOR | Test private seeking project và verified lecturer opt-in; không yêu cầu công khai cả dự án. |
| Workspace Overview | IMPLEMENTED | `project-overview.service.ts`, GET P/workspace | Counts và saved activities; `tab=overview` | DB counts thật, memberCount riêng không bị giới hạn 100; chỉ liệt kê mentor còn verified. Chưa load test. |
| Research Plan | IMPLEMENTED | `project-plan.service.ts`, GET/PUT P/plan, revisions | ResearchPlan/PlanRevision; `tab=plan` | Partial draft, optimistic version, lịch sử, đổi approach không xóa nội dung. Browser Back có hạn chế bảo vệ draft. |
| Tasks & Milestones | PARTIAL | `project-tasks.service.ts`, P/tasks, P/milestones | Task/Milestone/Revision; `tab=tasks` | Assign current members, complete/reopen, due/blocked, links/history. Milestone creation chưa có durable retry receipt. |
| Discussions & Decisions | PARTIAL | `project-discussions.service.ts`, P/discussions, P/decisions | Existing messages + revisions; `tab=chat` | Threads, replies, conclusion, decisions có persisted history. Decision creation chưa chống trùng sau mất response. |
| Shared Literature Library | PARTIAL | `project.service.ts`, `literature.service.ts`; P/papers, `/literature/corpora` | ProjectPaper, CorpusPaper; `tab=papers` | Duplicate membership, member/archive guards và source-removal guards. Project hydration còn tải toàn bộ papers; không xác nhận corpus lớn. |
| Screening | PARTIAL | PATCH P/papers/:paperId | ProjectPaper + ProjectActivity | Reviewer/time/reasons được giữ; web gửi expectedUpdatedAt, concurrent edit bị 409. Chưa có independent votes, MAYBE, assignment chuyên biệt hoặc conflict adjudication. Task chỉ hỗ trợ phân công bằng link. |
| Evidence Extraction | PARTIAL | `gap-validation.service.ts`; `/gaps/:id/evidence` | GapEvidenceRecord | Supporting/counter records và nguồn cùng project được kiểm tra. Chưa có evidence review/version model độc lập; độ đúng của trích xuất AI không được kiểm chứng ở đây. |
| Research Gaps | PARTIAL | `gaps.service.ts`, `gap-validation.service.ts`; `/gaps/candidates`, request-validation, validations | ResearchGap/GapValidation; `tab=gaps` | Owner quyết định đưa gap private tới expert; removed creator không vượt được current membership. Thiếu immutable validation round; xem C. |
| Research Questions | PARTIAL | ResearchPlan.questions, PUT P/plan | Structured JSON + PlanRevision | sourceGapId/evidenceIds được validate và lưu lịch sử; không tự chấp thuận một AI suggestion. Chưa pin revision nội dung gap/evidence hoặc vòng đời question riêng. |
| Academic Mentorship | PARTIAL | `project-mentorship.service.ts`; P/mentorships, offers, academic-support | MentorshipRequest/Relationship; `tab=support` | Verified + consent + revocation được kiểm tra. Legacy context đọc rộng; cần chính sách resource scope thống nhất. |
| Mentor Feedback | PARTIAL | P/plan/shares, P/workspace/comments, mentor questions | PlanShare + revision comments; `/projects/:id/plan-review` | Revision kế hoạch được pin, later edits riêng tư, revocation chặn đọc/bình luận/notification. Generic guidance cũ chưa pin artifact/version; thiếu feedback request/resolution đầy đủ. |
| Formal Academic Review | PARTIAL | `reviews/review.routes.ts`, review-request.service, peer-review-access | SubmissionRevision/Assignment/HumanReview; `/review-requests/:id` | 13 DB cases: verified non-FPT, exact assignment/revision, stale role denial, version resubmit, old PDF policy. Chưa nối tới manuscript snapshot; mentor COI cần checkpoint rõ. |
| Manuscripts | NOT_IMPLEMENTED | Không có manuscript domain API | DraftWorkspace chỉ là legacy section draft | Không tính UI/ADR là triển khai manuscript. |
| Real-time Collaborative LaTeX | NOT_IMPLEMENTED | Không có authenticated manuscript WebSocket/CRDT gateway | Không có durable update journal/presence | Scenario hai editor, convergence, restart và eviction không thể chạy. SSE chat không thay thế CRDT. |
| PDF Compilation | BLOCKED | Không có safe compile endpoint/worker | Không có compile run/source manifest/PDF mapping | Thiếu execution boundary, limits, network/secret isolation và sandbox verification. Không chạy TeX trong API/container app. |
| BibTeX | NOT_IMPLEMENTED | Không có project manuscript citation/BibTeX API | Không có citation-key registry | Không xác nhận citation keys ổn định/unique hoặc import parser. |
| LaTeX Templates | NOT_IMPLEMENTED | Chỉ có review templates, không phải TeX templates | Không có template source/build smoke tests | Chưa kiểm tra license/font/package compatibility. |
| Source/PDF Versions | NOT_IMPLEMENTED | SubmissionRevision có sẵn cho uploaded artifact | Không có immutable source snapshot liên kết PDF | Không có source ZIP/restore sang working draft hoặc snapshot → review bridge. |
| Notifications and Email | PARTIAL | notification.service, notification.worker, domain outboxes | Notification + jobs | Minimal durable events, worker recovery, queue/email failure tests. Chưa gửi SMTP/Expo thật; workspace email không được quảng bá là đã hoạt động. |
| Authorization and Privacy | PARTIAL | Auth/session, membership, workspace-access, scoped targets | Server-side checks | HTTP + service tests thực thi; chưa kiểm hết API/upload/object storage, không có manuscript WS để đánh giá. |

## C. Business Logic Findings

1. **P0 / release blocker đối với yêu cầu chia sẻ theo từng artifact:** `project-mentorship.service.ts::workspace` gọi `mentorshipResearchContext` cho một mentor ACTIVE còn VERIFIED. Hàm này đọc description, criteria, notes trên papers, gaps, reports, evidence và member names. PlanShare mới không hạn chế endpoint cũ này. Existing tests còn yêu cầu mentor đọc “Team evidence note”. Đây là chính sách cấp quyền rộng đang tồn tại, không phải bằng chứng người ngoài không có quan hệ đọc được dữ liệu. Không thể tuyên bố toàn bộ hệ thống đã có artifact-only mentor privacy. Cần chuyển grant cũ sang scope rõ ràng, có owner consent và migration/compatibility plan; không âm thầm cắt hoặc mở rộng quy tắc đang dùng.
2. **P1:** GapValidation chưa gắn quyết định expert với immutable gap/evidence revision và validation round. Số phiếu cũ có thể tiếp tục gắn với nội dung đã được bổ sung. Chưa chứng minh được “scientifically validated” theo yêu cầu. Giữ trạng thái này như quy trình sản phẩm và hiển thị candidate, không xem heuristic là kết luận.
3. **P1:** Independent screening assignment/votes/conflict resolution chưa có. Cập nhật shared screening hiện hành an toàn hơn nhưng chưa tương đương quy trình hai reviewer độc lập.
4. **P1:** Mentor không tự được ReviewerAssignment; điều này đã được kiểm tra. Tuy nhiên `assertReviewAdmission` chặn author/member/declared conflicts nhưng chưa đưa quan hệ mentor vào một checkpoint COI rõ ràng. Không gọi kết quả này là independent review chỉ vì lecturer đã VERIFIED. Chính sách có thể yêu cầu chặn mentor hoặc ghi nhận ngoại lệ được phê duyệt; chưa chọn ngầm một trong hai.
5. Project lifecycle, researchStage và academic approval được tách biệt. Hoàn thành task/cột mốc hoặc lưu plan không tự đổi nghiên cứu thành được duyệt.
6. Student không bị yêu cầu là FPT để tạo project. Tạo dự án đã thử với fixture non-FPT. `completeProfileSchema` hiện vẫn từ chối noAffiliation trong một nhánh onboarding; kiểm thử fixture đã onboard không chứng minh onboarding độc lập affiliation hoạt động đầy đủ.

## D. Workflow Audit

### Scenario matrix

PASS ở một hàng chỉ bao phủ bước và lớp kiểm tra ghi trong cột Evidence. Kết quả trình duyệt đọc dữ liệu thật không được cộng thành một E2E hoàn chỉnh khi chưa thao tác đủ hai tài khoản.

| Flow | Expected Behavior | Actual Implementation | Status | Evidence | Defect/limit |
|---|---|---|---|---|---|
| A1 Register/onboard non-FPT student | Đi qua form và email thật | Source có public registration; test dùng identity đã xác minh | NOT_TESTED | Auth DTO, creation integration fixtures | Không gửi email onboarding thật; noAffiliation còn bị chặn. |
| A2 Create → owner/private → open | Transaction tạo project/plan/owner/event, không ép mentor | Có persistence và idempotency | PASS | project-creation-team 17; create-project-form 5; browser open project | Không phải kiểm thử đăng ký mới. |
| A3 Add objective and plan revision | Reload được, retained history | Có ResearchPlan/PlanRevision | PASS | workspace collaboration: save/reload/history/concurrency; frontend tests | Browser lần này chỉ đọc và thử bản nháp, không lưu dữ liệu audit vào dự án người dùng. |
| A4 Invite → accept → shared project | Chỉ cấp membership sau consent | Có invitation status/token/email binding | PASS | project creation/team + workspace persistence | SMTP thật chưa chạy. |
| A5 Nonmember denied | Không đọc nội bộ dù có project ID | 404 trong services/HTTP | PASS | Signed session HTTP test, public-summary tests | Không bao gồm mọi storage backend. |
| B1 Add/duplicate papers | Một membership mỗi paper/project | Unique pair và service retry | PASS | workspace persistence | Large corpus pagination chưa hoàn chỉnh. |
| B2 Assign/screen | Phân công reviewer, independent decisions và xử lý conflict | Task có link SCREENING; shared current status + reviewer/reasons | PARTIAL | Task/link + concurrent screening tests | Không có independent votes/adjudication. |
| B3 Extract/support/counterevidence | Đúng project, included source, có provenance | Records và checks có thật | PARTIAL | Corpus/evidence/removed creator integration | Không có immutable evidence revision/human extraction review. |
| B4 Candidate → limitations → team decision | Candidate và lý do được ghi rõ | Gap + threads + decisions | PARTIAL | Gap suites, discussion history, browser empty state | Gap version/round pin thiếu. |
| B5 Gap/evidence → question | Lưu source IDs đúng project/gap | SavePlan checks + revision snapshot | PASS | Persistence rejects cross-project/wrong-gap/missing-gap refs; UI counterevidence test | PASS cho traceable references, không xác nhận scientific validity. |
| B6 Question → linked tasks/milestones | Task refer thật, không mất source vì xóa question | Có typed link và deletion guard | PASS | Linked question/milestone test, archive race | Source content revision pin vẫn thiếu. |
| C Verified lecturer opt-in/consent | Availability riêng, explicit acceptance | Có live verification + ACTIVE relation | PASS | 34 mentorship workflow tests, 9 academic relationship tests | Fixture verified, không giả lập verification bằng UI badge. |
| C Scoped plan feedback → revise → revoke | Chỉ đúng revision, lịch sử vẫn còn | New PlanShare API đáp ứng | PASS | Workspace mentor tests, notifications delivery checks | Chỉ kế hoạch và câu hỏi được chia sẻ theo API mới. |
| C All authorized mentor resources | Mọi artifact có scope rõ | Legacy context rộng theo ACTIVE relationship | PARTIAL | Source và test đọc Team evidence note | P0 scope-policy mismatch ở C1. |
| C Unverified/ended mentor | Không đọc/ghi tiếp | Recheck live relationship/profile | PASS | Mentorship + workspace tests | Không có WS editor để thử eviction. |
| D Private SEEKING_MENTOR → offer → owner accepts | Safe preview, không lộ nội bộ | Có opt-in discovery và transactional acceptance | PASS | Mentorship discovery/offer/race integration | Chưa chạy bằng hai browser accounts ở lần kiểm tra này. |
| E Two LaTeX editors/reload/offline/restart/removal | Durable convergence và real presence | Không có gateway/editor/journal | NOT_IMPLEMENTED | Repository/runtime search, ADR proposed | Không có test mô phỏng được gắn nhãn PASS. |
| F Template → citations → compile → PDF/errors/snapshot/ZIP/restore | Source và PDF cùng revision, safe limits | Không có pipeline | BLOCKED | Không có compiler route/model/worker | Chưa có sandbox đủ an toàn để expose compile. |
| G Manuscript V1 feedback → V2 formal review | Mentor comments giữ V1, reviewer pin V2 | Plan feedback và uploaded submission review có riêng | PARTIAL | Peer-review 13, plan revision integration | Chưa có manuscript version bridge; không gộp hai phần thành PASS. |
| Security auth/session/DTO | JWT giả/thu hồi, outsider, stale version đều bị chặn | Express router + middleware thật | PASS | HTTP integration: 401/400/404/409 và signed RS256 sessions | Test keys sinh tạm, không dùng mật khẩu người dùng. |
| UI navigation desktop/mobile | Không crash, section/action đúng bối cảnh | Mở các section trên localhost đã rebuild | PASS | Browser snapshots, screenshots, error console rỗng | Không phải automated two-user E2E. |

## E. UI/UX Findings

Đã kiểm tra Tổng quan, Kế hoạch, Tài liệu, Cơ hội nghiên cứu, Công việc, Thảo luận/Quyết định, Hỗ trợ học thuật, Sản phẩm, Gửi bài, Nhóm và Đóng góp trên localhost với phiên đã đăng nhập.

- Điều hướng được nhóm theo hoạt động nghiên cứu; desktop sidebar, mobile select. Project switcher không buộc quay về directory trước khi mở nội dung.
- Nền `body` đo được `rgb(255,255,255)` ở mobile 390×844; document không tràn ngang. Đây là kiểm tra một viewport/project, không phải bảo đảm mọi thiết bị/nội dung.
- Sau lần rebuild/recreate cuối, desktop 1440×1000 cũng có nền `rgb(255,255,255)`, document width 1425px và không tràn ngang; console không ghi nhận error. Ảnh desktop đã được lưu và xem trực tiếp để xác nhận bố cục.
- Empty/loading/error states có thật. Không thêm metric giả, fake collaborators hoặc nút compile không có backend.
- Sửa copy “Confirmed by corpus” thành tín hiệu so sánh corpus; tooltip nói rõ không phải scientific validation. Bản dịch cho các nhãn Comments/Screening và bằng chứng được bổ sung.
- Form plan và task giữ draft khi background refetch; discussion edit và conclusion cũng giữ version gốc. Có tải phiên bản mới rõ ràng và giữ input khi 409/network error.
- Component tests kiểm tra một lần xác nhận khi nhiều form cùng dirty. Thử live native confirmation qua browser tool không thu được dialog ổn định (click timeout rồi chuyển tab); **không tính thao tác hủy dialog trên browser là PASS**.
- **P1/P2 còn lại:** Browser Back/Forward có thể đi ngoài guard custom vì BrowserRouter chưa dùng DataRouter blocker. Không tuyên bố chống mất draft cho mọi đường đi. Cần draft recovery hoặc một navigation blocker được kiểm chứng.
- **P2:** Các nhãn trong raw history snapshot vẫn có technical keys; liên kết GAP/EVIDENCE/QUESTION đôi khi tới section thay vì mở đúng record. Mobile touch targets cần kiểm tra đầy đủ với keyboard/screen reader và nội dung dài.
- Các link footer hiện trỏ lại route hiện tại thay vì policy/support page riêng. Đây là UI shell cũ, không phải hoàn tất các trang chính sách.

Ảnh: `artifacts/workspace-collaboration/mobile-overview.jpg`, `desktop-overview.jpg`.

## F. Security Findings

### Ma trận quyền thực tế

O = owner đang hoạt động; M = member ACTIVE; T = mentor ACTIVE và VERIFIED nhưng không là member; R = verified lecturer có assignment hợp lệ; X = người khác. Mọi quyền cần account/session hợp lệ. Review và mentor không kế thừa member privileges.

| Hành động | O | M | T | R | X |
|---|---|---|---|---|---|
| Xem private project coordination | Có | Có | Không qua API coordination chung | Không chỉ vì assignment | Không |
| Sửa settings/team/stage/share plan | Có, project mutable | Không | Không | Không | Không |
| Sửa plan/tasks/thread/team decisions | Có | Có | Không | Không | Không |
| Đọc revision plan | Có | Có | Chỉ revision còn PlanShare + relation hợp lệ | Không | Không |
| Comment shared plan | Có | Có | Chỉ shared revision, không mention private members | Không | Không |
| Đọc/trả lời mentor question | Có | Có | Đúng relationship + shared plan target | Không | Không |
| Xem private notes/gaps/reports qua legacy academic-support | Có | Có | Có theo grant relationship hiện có; rộng hơn PlanShare | Không chỉ vì assignment | Không |
| Mở expert gap validation ra bên ngoài | Owner | Không | Không do mentor role | Chỉ theo expert workflow sau request, không do assignment riêng | Không |
| Formal review submit | Không nếu author/member/conflicted | Không | Không tự động | Có khi verified, assignment/revision/state hợp lệ | Không |
| Đọc submitted PDF | Theo submission ownership/access | Theo submission policy | Không tự động | Chỉ assigned revision theo service | Không |
| Chỉnh dự án ARCHIVED | Không | Không | Không | Review save bị chặn | Không |
| Thu hồi PlanShare khi archived | Có, là security revocation | Không | Không | Không | Không |
| Manuscript WS/source/compile | Chưa có | Chưa có | Chưa có | Chưa có | Chưa có |

Đã thử forged/stale session, cross-project IDs, removed creators, changed retry payload, immutable UPDATE triggers, mentor termination/verification change, archived writes và XSS literal rendering trong discussion. Backend dùng parameterized Prisma SQL, Zod strict DTO và createRateLimiter; không thêm LLM/network call ngoài abstraction hiện có.

Notifications mới không chứa private question/body/plan text. Delivery recheck membership hoặc exact mentor share trước push. Notification inbox giữ sự kiện tối thiểu trong lịch sử; việc thu hồi không thể xóa dữ liệu đã được đọc trước đó. Không tuyên bố revoke là thu hồi bản sao phía client.

**Chưa kiểm chứng:** bucket/object ACL ngoài localhost, toàn bộ upload fuzzing, pen test toàn ứng dụng, private PDF trên từng provider, WebSocket room hijacking/file traversal/TeX privilege escalation (các thành phần manuscript chưa tồn tại). Không có kết quả sandbox PASS.

## G. Data Integrity Findings

- Migration `20261014000300_project_workspace_collaboration` bổ sung bảng/cột/index; giữ IDs của team messages và receipts cũ. Không chạy migrate dev, reset, drop schema hoặc sửa migrations đã áp dụng.
- Có composite project FKs cho milestone/task, mentor relation/share, discussion/message/reply; live plan share unique index; state CHECKs cho DONE/completedAt và BLOCKED/reason; unique retry keys cho task/thread/comment/messages.
- DB trigger chặn UPDATE PlanRevision/ProjectWorkspaceRevision. Điều này **không** làm toàn bộ dữ liệu immutable ở tầng DB: privileged DELETE/root cascades vẫn có thể xóa. API có history/empty-project deletion guard. Quyền DBA và retention/backup policy vẫn phải quản lý riêng.
- Dùng khóa account/project và recheck membership trong transaction cho workspace writes; serialize với archive/removal. expectedVersion chặn stale saves.
- Screening re-read trong transaction, expectedUpdatedAt do web gửi và timestamp tăng đơn điệu. Client cũ bỏ timestamp chỉ được bảo vệ đối với in-flight race, không phát hiện mọi stale edit đã mở từ lâu.
- Screening events lưu before/after reviewer/time/reasons/status, kể cả chỉ sửa rationale. Đây là application event history, chưa có DB immutable trigger cho mọi ProjectActivity.
- Task/discussion retry so sánh original creation payload trong immutable first revision. Reused key với payload khác bị 409; retry cũ sau collaborator edit trả cùng resource.
- Source paper không bị gỡ khỏi project/corpus khi GapEvidenceRecord còn tham chiếu. Plan save kiểm tra sourceGapId cùng project và evidence thuộc đúng gap; câu hỏi đang được live work tham chiếu không được xóa lặng lẽ.
- **P1/P2:** Milestone và decision creation chưa có durable command receipt. Click mutex không đủ chống response-loss retry. Comment receipt chưa đóng băng toàn bộ mention payload. Questions/gaps/evidence links chưa pin content revision, dù PlanRevision giữ câu hỏi lịch sử.

### Migration và recovery evidence

65 migrations đã áp dụng thành công trên disposable PostgreSQL; migration mới cũng được migrate deploy vào DB localhost sau backup. Prisma validate thành công, migration status báo up to date. Source data và hai papers cũ vẫn hiện sau restart.

Backup trước local migration: `C:\Users\tdinh\AppData\Local\Temp\lumigap-before-workspace-20261014.dump` (11,055,207 bytes). `pg_restore --list` đọc được 1,271 TOC entries. **Chưa thực hiện full restore drill**; kiểm tra list không chứng minh restore toàn bộ thành công. Backup chứa dữ liệu riêng tư, không đưa vào git.

## H. Fixes Applied

Thay đổi bao gồm phần triển khai workspace được tiếp tục từ phiên trước và các sửa lỗi trong audit này. Working tree còn nhiều thay đổi khác từ các yêu cầu trước; không quy toàn bộ git diff cho audit.

| Nhóm file | Sửa và tác dụng |
|---|---|
| `prisma/project-workspace.prisma`, migration workspace; shared-types/project-workspace.ts | Model coordination, immutable revision, project scope constraints và shared contracts. |
| `projects/workspace-access.ts`, project-plan/tasks/discussions/overview services, workspace controller/routes | Transactional current auth, scope validation, optimistic versions, history, exact plan sharing và meaningful overview. |
| `workspace-notification-access.ts`, notification worker | Minimal durable notices, recovery và delivery authorization cho revoked members/grants. |
| `project.service.ts`, project.controller.ts, shared-types/project.ts | Safe screening conflict checks/history; ngăn xóa source đang có evidence. |
| `literature.service.ts`, `gap-corpus.ts`, `gap-validation.service.ts` | Current membership thay historical creator, corpus archive/removal locks, included/source checks, owner-triggered external disclosure. |
| `workspace-plan.tsx`, workspace-tasks/discussions/common.tsx | Giữ draft/version gốc qua refetch, lỗi save giữ input, unsaved confirmation deduplication. Question source picker đọc evidence thực của gap. |
| `projects-workspace.tsx`, section nav, coordination CSS | Sidebar chỉ hiện quyền member phù hợp, grouped navigation/mobile select, keyboard target cuộn vào vùng nhìn thấy, pure-white surface. |
| `project-overview.service.ts`, workspace-overview.tsx | Member count chính xác dù preview members bị giới hạn; loại mentor đã mất verification khỏi danh sách chia sẻ. |
| `project-plan.service.ts` | Active grants không bị 100 revoked records che mất; validate question provenance và chặn xóa question đang được tham chiếu. |
| `gap-card.tsx`, gap-detail-drawer.tsx, translations | Bỏ khẳng định heuristic là scientific validation; dọn dead ConfidenceBar/import và bổ sung nhãn tiếng Việt. |
| `workspace-collaboration.persistence.test.ts`, workspace-coordination.test.tsx | DB/HTTP auth/concurrency/provenance/mentor regression tests và frontend draft/error tests. |

## I. Test Results

### Môi trường

Disposable PostgreSQL 16 + pgvector tại `127.0.0.1:15439`, DB `lumigap_project_slice_test`; Redis riêng tại `127.0.0.1:16389`. Integration fixtures không chạy trên DB của người dùng. Guard trong suite kiểm tra PROJECT_SLICE_TEST, DATABASE_URL và Redis URL. Test credentials chỉ là synthetic cho containers dùng kiểm thử.

Kết thúc kiểm tra, hai container test đã được stop để giảm tài nguyên; dữ liệu test vẫn giữ. Có thể mở lại bằng `docker start lumigap-workspace-test-20261014 lumigap-workspace-redis-20261014`. Stack ứng dụng localhost vẫn chạy; image ID của cả backend/web đã đối chiếu khớp bản build cuối.

Fixture Lecturer/profile verification là trạng thái seed trong DB test; formal reviewer vẫn qua service checks. HTTP case dùng RS256 keys được token service sinh khi VITEST=true và RefreshToken family lưu thật. Không mock auth/member/version middleware ở case HTTP.

### Lệnh và kết quả

| Lệnh thực thi | Kết quả | Evidence |
|---|---|---|
| `pnpm --filter @trend/shared-types build` | PASS | Build thực tế; Docker build cũng build package này. |
| `pnpm --filter backend exec tsc --noEmit` | PASS, chạy lại sau sửa cuối | `artifacts/workspace-collaboration/backend-typecheck-final.log` (tsc thành công không in output) |
| `pnpm --filter web typecheck` | PASS, chạy lại sau sửa cuối | `web-typecheck-final.log`; production Docker web build chạy tsc -b. |
| `pnpm --filter mobile typecheck` | PASS | `mobile-typecheck.log`, kiểm tương thích shared types. |
| Backend Vitest 9 suites, flags PROJECT_SLICE_TEST/MENTORSHIP_INTEGRATION/STUDENT_AFFILIATION_INTEGRATION, maxWorkers=minWorkers=1 | **111/111 PASS** | `backend-final-tests.log` |
| Targeted backend persistence rerun sau question deletion guard | **26/26 PASS** | `persistence-final.log` |
| `pnpm --filter web exec vitest run src/features/projects/__tests__ src/features/home/__tests__/home-search.test.tsx` | **88/88 PASS**, 10 files | `frontend-final-tests.log` |
| Focused ESLint trên workspace services/DTO/tests, gap/corpus changes, workspace UI/shared types | PASS, 0 errors và 0 warnings | `lint.log`; sửa cuối kiểm lại bằng `--max-warnings 0` trong `backend-lint-final.log`, `web-lint-final.log` (thành công không in output). Không phải full-repository lint. |
| `docker compose build backend web` | PASS | `docker-build-final.log`; gồm Prisma generation, backend tsc build, web production build. |
| Backend runtime PostgreSQL-only audit trong Docker build | **4/4 PASS** | Trong build log. Không audit Python sidecar. |
| `docker compose run --rm --no-deps migrate` | PASS | `local-migration.log`, migration workspace mới applied. |
| `docker compose run --rm --no-deps migrate pnpm --filter backend db:validate` | PASS | `prisma-validation.log` |
| `docker compose run --rm --no-deps migrate pnpm --filter backend db:migrate:status` | PASS, up to date | `local-migration-status.log` |
| Local Compose rebuild/recreate API/web/workers + authenticated browser navigation | PASS trong phạm vi đọc UI, backend healthy | `local-restart-final.log`, screenshots và browser observations |
| Real SMTP/Expo/AI provider output | NOT_TESTED | Failure/retry/AI fallback trong suites được mock có chủ đích. |
| Two-user browser E2E, LaTeX convergence/crash, sandbox exploits, source/PDF hash match | NOT_IMPLEMENTED/BLOCKED | Không có pipeline tương ứng để chạy. |
| Production scale, p95 latency, backup full restore | NOT_TESTED | Không suy ra từ thời gian chạy unit/integration suites. |

Backend 9 suites: workspace-collaboration **21**, project-workspace **5**, project-creation-team **17**, mentorship-workflow **34**, academic-relationships **9**, peer-review **13**, gap-pipeline-scope **4**, gap-validation-quorum **4**, gap-validation-access **4**. Tổng 111; targeted rerun là tập con, không cộng thành 137 test khác nhau.

Các lệnh backend Vitest để tái chạy (chỉ dùng DB/Redis kiểm thử riêng; bật `PROJECT_SLICE_TEST=1`, `MENTORSHIP_INTEGRATION=1`, `STUDENT_AFFILIATION_INTEGRATION=1`, `EMAIL_DELIVERY_MODE=disabled` và trỏ `DATABASE_URL`/`REDIS_URL` tới hạ tầng disposable):

```powershell
pnpm --filter backend exec vitest run src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts src/modules/projects/__tests__/project-workspace.persistence.test.ts src/modules/projects/__tests__/project-creation-team.persistence.test.ts src/modules/projects/__tests__/mentorship-workflow.persistence.test.ts src/modules/projects/__tests__/academic-relationships.persistence.test.ts src/modules/reviews/__tests__/peer-review.persistence.test.ts src/modules/gaps/__tests__/gap-pipeline-scope.persistence.test.ts src/modules/gaps/__tests__/gap-validation-quorum.persistence.test.ts src/modules/gaps/__tests__/gap-validation-access.persistence.test.ts --maxWorkers=1 --minWorkers=1
pnpm --filter backend exec vitest run src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts src/modules/projects/__tests__/project-workspace.persistence.test.ts --maxWorkers=1 --minWorkers=1
```

Lệnh thứ hai là lượt 26 ca sau khi thêm guard `QUESTION_IN_USE`; lượt frontend 88 ca cũng đã chạy lại sau thay đổi này.

Lần frontend đầu khi thêm provenance test có 1 failure vì resetAllMocks xóa response fixture evidence. Fixture đã được thiết lập lại trong beforeEach; lần chạy sau cùng toàn bộ 88 test đều qua. Không bỏ qua test lỗi để lấy kết quả xanh.

Native `pnpm --filter backend typecheck/build` có vấn đề Prisma CLI do local hoisted jiti/c12 resolution ở phiên trước. Không cài dependency mới hoặc sửa lockfile để che lỗi môi trường. Direct tsc và Prisma/Docker production build đã được chạy thành công; không báo root `pnpm typecheck` là đã chạy.

## J. Unresolved Issues

| Ưu tiên | Việc còn lại | Tác động / bước thực hiện cụ thể |
|---|---|---|
| P0 scope-policy gap | Legacy mentor research-context rộng | Chọn explicit owner-authorized resource scopes, migrate grants cũ theo chính sách được thông báo, sửa GET academic-support và guidance access; test mentor A/B và revocation cho mọi artifact. PlanShare một mình chưa đủ. |
| P1 | Không có manuscript/CRDT service | Implement theo ADR có proof trước: current member auth, tickets/session revocation, journal commit receipts, offline/restart convergence, file policy. Không dùng polling overwrite. |
| P1/BLOCKED | Không có verified compiler isolation | Provision execution boundary riêng; bounded CPU/RAM/time/files/output, no secrets/network, path checks, shell escape disabled, queue fairness và adversarial tests trước endpoint. |
| P1 | Gap/evidence validation chưa pin round/revision | Immutable review packet + evidence manifest, thay đổi nội dung mở vòng mới, votes đúng revision; không tái dùng quorum cũ. |
| P1 | Independent screening và question lifecycle chưa đủ | Canonical screening decisions, reviewer assignments/votes/adjudication; question derivation pin source version và decision history. |
| P1 | Manuscript snapshot → SubmissionRevision chưa có | Exact source manifest/PDF hash, immutable snapshot, restore sang draft mới, request/review pin cùng artifact. |
| P1 | Mentor/reviewer COI checkpoint | Quy định explicit policy và enforce trong admission, recommendation, accept và submit; verified không có nghĩa independent. |
| P1/P2 | Browser Back/Forward draft loss | DataRouter blocker hoặc durable draft recovery theo user/project/resource/version; regression test thực với browser history. |
| P2 | Retry receipt cho milestone/decision | Durable creation key + immutable normalized payload, changed-payload rejection và response-loss tests. |
| P2 | Notification deep links | Entity-specific authorized task/revision/thread links; mentions hiện có thể chỉ tới chat. |
| P2 | Performance và pagination | Overview reads đang giữ account/project lock qua nhiều query; project detail loads whole library; active shares chưa phân trang. Đo contention/p95 trên dữ liệu thật trước tối ưu có căn cứ. |
| P2 | Accessibility/localization | Full keyboard/screen reader/contrast audit và history labels; mobile 48dp targets; exact source drawers; footer destinations. |
| P2 | Affiliation-independent onboarding | Resolve noAffiliation policy/DTO, test non-FPT registration → verification → onboarding → project qua HTTP/browser. |
| P2 | Operational readiness | Full restore drill, object ACL audit, email deliverability, alerting, retention, native Prisma dependency resolution và production CI gates. |
| P3 | Productivity | Optional task views, better source search, check-in agenda/resolution và richer history diff sau các gate trên. |

## K. Recommended Next Steps

1. Khóa và triển khai thống nhất **mentor resource scopes + version-pinned gap validation** trước khi quảng bá quyền riêng tư và thẩm định đầy đủ. Các thay đổi chính sách phải được giải thích, không tự suy ra từ một UI badge.
2. Hoàn thiện workflow vote/conflict screening, question/evidence revision provenance và durable retry còn thiếu trên model hiện có.
3. Triển khai một lát manuscript hẹp có durability proof và hai authenticated browser sessions. ADR `0001-collaborative-latex.md` hiện vẫn là đề xuất, không phải deliverable đã hoạt động.
4. Chỉ mở compilation khi sandbox và storage/source/PDF revision mapping vượt security gates. Template/BibTeX/source ZIP/snapshot restore phụ thuộc bước manuscript và compile này.
5. Nối immutable output vào SubmissionRevision/ReviewRequest/ReviewerAssignment hiện có; kiểm mentor COI và historical feedback sau sửa draft.
6. Chạy E2E đầy đủ A–G trên hai tài khoản, SMTP/Expo/provider integration thật, load/restore và upload/object-security checks. Giữ kết quả NOT_TESTED tới khi có evidence thực.

**Readiness cuối:** phần project/team và coordination đã có dữ liệu thật, kiểm tra quyền và kiểm tra concurrency để trình diễn trên localhost. Toàn bộ hành trình từ nghiên cứu tới LaTeX/PDF/phản biện chưa hoàn chỉnh, và chưa đủ bằng chứng để triển khai production an toàn theo tiêu chí của yêu cầu này.
