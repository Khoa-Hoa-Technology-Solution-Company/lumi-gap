# Mentor Workspace: lifecycle, follow-up and manuscript navigation

Ngày kiểm tra: 25/11/2026. Thay đổi tại local; không commit, push hoặc deploy.

Ghi chú khi chuẩn bị nhánh: báo cáo này ghi lại audit working tree gốc. Phạm vi và kiểm tra của nhánh được tách để push nằm trong [PUSH-VALIDATION.md](PUSH-VALIDATION.md).

## Kết quả audit

Đã đọc source hiện hành và các thay đổi chưa commit. Working tree có sẵn phần lớn implementation ban đầu của tác vụ; lần tiếp tục này kiểm tra, sửa các lỗi còn lại và bổ sung regression tests.

- Backend đã projection `REVISION_REQUESTED → WAITING`, câu hỏi đã được mentor trả lời cũng chuyển sang `WAITING`. Navigation trước đó thiếu tab chính tương ứng; chỉ xem Tất cả không cho biết nhóm nào đang chờ phản hồi.
- `ACTIONABLE` phải lọc theo `needsAction`, không phải `status=TODO`. Một việc `IN_PROGRESS` có thể xuất hiện trong cả Cần xử lý và Đang làm. Không cộng các facet thành tổng.
- Audit chỉ đọc trên database local của project/request được cung cấp cho thấy request hiện là `RESUBMITTED`, v2, vòng 2; có đúng một item `TODO`, `needsAction=true`. Facets: ALL=1, ACTIONABLE=1, IN_PROGRESS=0, WAITING=0, DONE=0. Những tab còn lại trống là đúng với dữ liệu hiện tại, không phải mọi empty state đều là bug.
- Query keys cần chứa actor và toàn bộ filters; không dùng dữ liệu của query trước làm placeholder. Danh sách revisions trước đây chỉ có submission ID, dễ giữ danh sách v1 khi request đã chuyển sang v2.
- Nút xem bản thảo trước đây đi tới `/projects/:id?tab=submissions`. Cần giữ shell mentor và tách đọc tài liệu khỏi flow chuẩn bị assignment.
- Sau submit, cần tải lại request đã lưu, giữ context vòng vừa gửi và trình bày feedback chỉ đọc thay vì chỉ để lại form disabled.
- Snapshot và authorization đã có ở `readableReviewAssignments`, `assertMentorReviewAccess`, `accessibleRevisionIds`, request/assignment binding và các endpoint revision/download. Tái sử dụng các cơ chế này.
- Test database thật phát hiện `submissionService.history()` query nhầm tên Prisma: `templateVersionId/title/reviewPerformanceLevel` thay vì `versionId/label/reviewCriterionLevel`. Lỗi này làm đọc lịch sử sau khi tạo v2 thất bại. Đã sửa và kiểm tra lại.

## Trạng thái và hành động

| Sự kiện / trạng thái nghiệp vụ | Work status | Cần mentor xử lý | Hành động chính |
| --- | --- | --- | --- |
| REQUESTED | TODO | Có, với dự án đang mở | Xem yêu cầu, phản hồi lời mời |
| ACCEPTED | TODO | Có | Bắt đầu đánh giá |
| Lưu nháp, IN_REVIEW | IN_PROGRESS | Có | Tiếp tục đánh giá |
| Submit góp ý thông thường và workflow đóng vòng | DONE | Không | Xem phản hồi đã gửi |
| Submit yêu cầu chỉnh sửa, REVISION_REQUESTED | WAITING | Không | Theo dõi chỉnh sửa |
| Nhóm gửi lại, RESUBMITTED | TODO | Có | Rà soát bản chỉnh sửa |
| Rà soát vòng mới, lưu nháp | IN_PROGRESS | Có | Tiếp tục đánh giá |
| Yêu cầu chỉnh sửa tiếp | WAITING | Không | Theo dõi chỉnh sửa |
| Chấp thuận nội bộ, COMPLETED | DONE | Không | Xem kết quả và lịch sử |
| Mentor trả lời câu hỏi đang mở | WAITING | Không | Chờ nhóm phản hồi |
| Công việc bị chặn | BLOCKED | Theo needsAction hiện có | Xem lý do / liên hệ nhóm nếu được phép |
| Project ARCHIVED / COMPLETED | Giữ status thực tế | Không | Giải thích chế độ lịch sử, chỉ đọc |
| Request hủy / từ chối / hết hạn, quyền bị thu hồi | Theo chính sách truy cập hiện có | Không | Không trình bày như hoàn thành thành công |

Góp ý thông thường, tự chỉnh sửa và chấp thuận nội bộ được phân biệt trong copy. Không kết quả nào được gọi là chấp nhận xuất bản.

## UI trước và sau

| Khu vực | Trước, theo audit source | Sau |
| --- | --- | --- |
| Danh sách công việc | WAITING không có tab chính | Năm tab có backend facet counts; empty state theo trạng thái |
| API lỗi | Nguy cơ hiểu nhầm dữ liệu rỗng / dữ liệu cũ | Hiển thị lỗi, retry; ẩn rows và counts cũ |
| Quay lại danh sách | Dễ reset bộ lọc | Project, status, search, kind, sort, page và grouping được giữ qua URL/return context |
| Task ở trang sau | Item selector có thể đi cùng offset cũ | Đọc item ở page 1, giữ page của queue để quay lại |
| Sau gửi review | Form dài / toast | Request detail với trạng thái, ai cần làm tiếp, vòng và phiên bản vừa lưu |
| Lịch sử | Khó tìm phản hồi từng vòng | Các vòng thu gọn; chỉ tự mở vòng được chọn sau submit |
| Feedback không chấm điểm | Có nguy cơ hiện 0 hoặc score cũ | Không hiển thị điểm giả; không tính lại điểm lịch sử |
| Theo dõi chỉnh sửa | Cần đọc lại review dài | Nội dung yêu cầu, phản hồi nhóm, phiên bản, trạng thái xác nhận và CTA hiện cạnh nhau |
| Xem bản thảo | Rời mentor shell | Reader chỉ đọc trong shell, đúng revision; không accept/save/submit tự động |
| PDF chỉ đọc | Nguy cơ dùng iframe thay reader hiện có | Tái sử dụng PDF.js viewer và toolbar; có native fallback, thu hồi blob URL khi bỏ dùng |

Không redesign Compact Rubric Matrix, Integrity Checklist hay PDF Viewer. Lịch sử dùng sẵn readonly variant của checklist.

## Dữ liệu, cache và quyền

- API workspace thêm `facets` cho ALL, ACTIONABLE, TODO, IN_PROGRESS, WAITING, BLOCKED, DONE, OVERDUE. Counts lấy từ cùng work projection và scope; áp dụng project/search/kind, bỏ status/item/pagination khi tính facets. Không có năm HTTP requests để đếm tab.
- Request detail giữ metadata của từng review: assignment, revision, round, template version và submitted timestamp; revision được ràng buộc với submission của request.
- Revisions query được phân biệt theo actor và revision hiện đang được request giao. Khi sang v2, không dùng lại danh sách v1 như kết quả mới.
- Accept, save, submit, resubmit và verify làm mới các query liên quan ngay sau mutation thành công. Các thay đổi quyền cũng invalidate reviews, request detail và revisions.
- Request detail cập nhật định kỳ; focus trở lại sẽ kiểm tra request, review workspace và versions. Khi refetch báo lỗi, UI không tiếp tục render tài liệu riêng tư từ data cũ.
- Chỉ chấp nhận return URL nội bộ tới work queue/project tasks với tham số được whitelist; không chấp nhận open redirect.
- Xem vòng 1 lấy revision từ chính submitted review, không từ assignment hiện tại đã chuyển sang vòng 2. Revision không khớp hoặc snapshot không còn truy cập được sẽ báo unavailable, không fallback latest.
- Không tạo endpoint ghi mới, source of truth cho revision items hay cơ chế contribution mới. Retry/read history tiếp tục dùng idempotency và contribution recording hiện có.
- Không migration/schema thay đổi cho tác vụ lifecycle. Các migration sẵn có được chạy bởi test runner chỉ trên database test tách biệt.
- Sửa một xung đột type `evidenceStatus` trong shared manuscript AI citations bằng `Omit` và thu hẹp type đầu vào của citation resolver. Đây là sửa type, không thay đổi workflow AI.

## File liên quan

Implementation lifecycle đã có trong working tree và được kiểm tra/hoàn thiện:

- `apps/backend/src/modules/projects/mentor-workspace.service.ts`
- `apps/backend/src/modules/reviews/review-request.service.ts`
- `apps/backend/src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts`
- `apps/backend/src/modules/projects/__tests__/mentor-workspace.persistence.test.ts`
- `apps/backend/src/modules/submissions/submission.service.ts`
- `apps/web/src/features/projects/components/mentor-work-queue.tsx`
- `apps/web/src/features/projects/components/mentor-project-tasks.tsx`
- `apps/web/src/features/projects/components/mentor-access-workspace.tsx`
- `apps/web/src/features/projects/utils/mentor-workspace-navigation.ts`
- `apps/web/src/features/projects/hooks/use-mentor-workspace.ts`
- `apps/web/src/features/reviews/components/mentor-review-follow-up.tsx`
- `apps/web/src/features/reviews/components/assigned-revision-reader.tsx`
- `apps/web/src/features/reviews/hooks/use-review-page-navigation.ts`
- `apps/web/src/features/reviews/hooks/use-reviews.ts`
- `apps/web/src/features/submissions/hooks/use-submissions.ts`
- `apps/web/src/pages/academics/mentor-workspace.tsx`
- `apps/web/src/pages/reviews/review-request-detail.tsx`
- `apps/web/src/pages/reviews/review-workspace.tsx`
- `apps/web/src/i18n/locales/mentor-lifecycle.ts`
- `apps/web/src/features/projects/__tests__/mentor-workspace.test.tsx`
- `apps/web/src/features/projects/__tests__/mentor-workspace-navigation.test.ts`
- `apps/web/src/features/reviews/__tests__/mentor-review-lifecycle.test.tsx`
- `apps/web/src/features/reviews/__tests__/compact-rubric-workspace.test.tsx`
- `apps/web/src/features/reviews/__tests__/compact-integrity-review.test.tsx`
- `packages/shared-types/src/mentor-workspace.ts`
- `packages/shared-types/src/manuscript.ts`
- `apps/backend/src/modules/workspaces/manuscript-ai.service.ts`
- `apps/web/src/features/manuscripts/ai-citations.ts`

Danh sách này là phạm vi lifecycle được kiểm tra trong working tree hiện hành, không phải toàn bộ diff từ HEAD của repo vốn có nhiều tác vụ khác chưa commit.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend: queue, navigation, lifecycle, rubric, integrity, draft, notification, citation regressions | 155 tests passed, 9 files |
| PostgreSQL tách biệt: mentor workspace + review workflow | 35 passed, 1 skipped; ca skipped là fixture cho QA tương tác |
| Fixture QA tương tác với API thật, database tách biệt | Đã chạy riêng và kết thúc thành công |
| Shared types build | Passed |
| Backend TypeScript | Passed |
| Backend production build, PostgreSQL runtime audit, Prisma generate | Passed |
| ESLint các file chỉnh sửa backend và frontend | Passed, 0 errors |
| Web production bundle trực tiếp qua `node scripts/build.mjs` | Passed; bundle budget check passed |
| Web `tsc -b` / full `pnpm --filter web build` | Còn lỗi ngoài phần lifecycle, xem giới hạn bên dưới |
| `git diff --check` các file liên quan | Passed; chỉ cảnh báo line ending của Git trên Windows |

Test quan trọng bao gồm: WAITING/ALL, overlapping actionable/in-progress, counts trước pagination/item selector, project/search/kind scope, literal SQL search, dedup legacy tasks, archive semantics, sai actor, revoked/expired access, replacement policy không khôi phục quyền cũ, v2 chưa chia sẻ, v1 history sau v2, read không tạo review/contribution, retry submit, cancel, concurrent revoke khi đọc PDF, response drafts riêng tư, author response không tự thành ACCEPTED, submit thất bại không chuyển trang và submit thành công giữ request/review/return context.

Browser QA dùng chính component production và API thật trên localhost với fixtures tách biệt. Đã xem desktop, mobile 390×844, tablet 820×1000, light/dark, VI/EN; kiểm tra work facets, WAITING, RESUBMITTED v2, lịch sử v1, reader chỉ đọc, phản hồi nhóm chờ xác nhận và COMPLETED comment-only không thành approval. Viewport đã reset sau QA. Các ảnh kiểm tra được hiển thị trong cuộc trò chuyện.

Phiên đang đăng nhập ở localhost:8080 được ứng dụng chuyển từ Mentor Workspace sang Hỗ trợ học thuật theo quyền hiện tại. Không thay tài khoản hay quyền dữ liệu thật để QA; các luồng mentor được kiểm tra bằng fixtures riêng.

## Giới hạn còn lại

- Full web TypeScript check còn lỗi ở docs source IDs, manuscript writing, mentor matching/preview, settings, trends và submission dialog callback trong working tree hiện tại. Không thể báo full web build xanh. Lỗi lifecycle phát hiện trong lần chạy đã được sửa; bundle production có thể tạo thành công.
- Browser QA không phải chứng nhận WCAG toàn ứng dụng hoặc toàn bộ tổ hợp viewport × ngôn ngữ × theme. Có kiểm tra keyboard tab switching, visible controls, wrap và thông báo status trong phạm vi thay đổi.
- Không xây dựng engine so sánh PDF/text mới. Annotation/evidence và previous revision verification tiếp tục dùng workflow sẵn có.
- Không thể thu hồi tài liệu mà người dùng đã tải về trước khi bị thu hồi quyền. Các request mới tiếp tục bị kiểm tra quyền ở backend; UI dừng hiển thị dữ liệu cache khi lần kiểm tra quyền tiếp theo thất bại.

## Tham khảo thiết kế

Trạng thái và hành động cạnh từng công việc theo [GOV.UK Task list](https://design-system.service.gov.uk/components/task-list/). Việc tách việc chờ và đã hoàn thành có tham khảo [OpenReview reviewer tasks](https://docs.openreview.net/getting-started/frequently-asked-questions/how-do-i-complete-my-tasks). Kiểm tra responsive, focus và thông báo status tham chiếu [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Commit message đề xuất khi người dùng sẵn sàng: `fix(mentor): complete review lifecycle and version-bound follow-up`.
