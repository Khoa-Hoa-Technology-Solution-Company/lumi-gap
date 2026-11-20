# Mentor Permissions & Research Resource Sharing

Ngày kiểm tra: 20/11/2026. Workspace: `D:\lumi-gap`.
Nhánh hiện tại: `feat/mentor-workflow-single-sidebar-20261116`.

Đã triển khai chia sẻ Paper theo tài nguyên, đơn giản hóa Support và thêm hộp tài liệu chung trong Mentor Workspace. Không tạo hệ thống permission, review hoặc notification song song. Không commit, push hoặc deploy.

## 1. Kết quả audit và mô hình quyền

Ba nguồn quyền vẫn độc lập:

1. Quan hệ Mentor đã đồng thuận, còn ACTIVE: tổng quan nghiên cứu được phép công bố cho Mentor, trạng thái dự án, công việc trực tiếp được giao và Mentor Chat.
2. Chia sẻ trực tiếp: chỉ tài nguyên đã chọn; Paper có `VIEW` hoặc `COMMENT`.
3. Review Request: assignment và revision cụ thể trong workflow góp ý bản thảo hiện có.

Mentor không trở thành thành viên nhóm có quyền quản trị. Accept không mở toàn bộ Library, Evidence Matrix, Team Chat, working draft hay quyền sửa/xóa bản gốc. Mentor chính/phụ là trách nhiệm học thuật; không dùng làm cấp quản trị.

Mặc định mới: `OVERVIEW_VIEW`, `MENTOR_CHAT`. Không còn buộc sinh viên chọn preset hoặc cấu hình 16 checkbox. Các policy được gửi/lưu từ trước không bị tự động thay quyền.

### 16 permission cũ

Nguồn định nghĩa: `packages/shared-types/src/mentor-access.ts`. Kiểm tra quyền tài nguyên/feedback tại `mentor-access.service.ts`, quyền quan hệ tại `academic-relationship-access.ts`, các tuyến scoped workspace và luồng review hiện có.

| Permission | Cách dùng và tương thích |
| --- | --- |
| OVERVIEW_VIEW | Xem snapshot tổng quan được chia sẻ; không mở kế hoạch riêng tư |
| PAPERS_VIEW | Đọc Paper đã chia sẻ theo cơ chế cũ; không đồng nghĩa xem toàn bộ Library |
| PAPERS_COMMENT | Comment Paper legacy; mode mới của Paper được kiểm tra riêng |
| PAPERS_SUGGEST | Đề xuất cho Paper legacy, không tự sửa bài báo; COMMENT mới không tự cấp SUGGEST |
| GAPS_VIEW | Đọc snapshot cơ hội nghiên cứu đã chia sẻ |
| GAPS_COMMENT | Nhận xét đúng snapshot cơ hội nghiên cứu |
| GAPS_RECOMMEND | Gửi đề xuất, không đổi dữ liệu gốc |
| TASKS_VIEW | Xem tài nguyên công việc đã chia sẻ; công việc trực tiếp giao Mentor được kiểm tra riêng |
| TASKS_SUGGEST | Gửi đề xuất cho công việc/cột mốc đã chia sẻ |
| MANUSCRIPTS_VIEW | Đọc phần nội dung legacy được duyệt, không đọc toàn bộ LaTeX source |
| MANUSCRIPTS_COMMENT | Nhận xét phần bản thảo legacy được chia sẻ |
| MANUSCRIPTS_SUGGEST | Đề xuất cho phần bản thảo legacy; không sửa working draft |
| MANUSCRIPTS_REVIEW | Giữ tương thích phản hồi REVIEW trên phần legacy; không thay assignment của Review Request |
| MENTOR_CHAT | Kênh giữa Mentor và nhóm khi quan hệ còn hiệu lực |
| SUBMISSIONS_VIEW | Nội dung submission chia sẻ theo cơ chế cũ; quyền review chính thức vẫn theo assignment/version |
| CONTRIBUTIONS_VIEW | Xem nội dung đóng góp đã chia sẻ; không tự xác nhận tác giả hoặc phần trăm đóng góp |

Giữ OBSERVER/ADVISOR/REVIEWER và API quản trị cũ để tương thích. Các cờ nhận xét/đề xuất cần quyền xem cùng loại. Backend không chấp nhận quyền quản trị tự chèn vào payload. Không có flag nào tự tạo quyền sửa/xóa bản gốc.

### Những bất cập đã xử lý

- Default ADVISOR có nhiều quyền không phù hợp trải nghiệm mời Mentor đơn giản: default mới chỉ tổng quan và chat.
- Chia sẻ Paper phụ thuộc cấu hình permission thủ công: thêm mode trên bản chia sẻ hiện có.
- Chưa có nơi Mentor tổng hợp tài liệu trực tiếp giữa nhiều dự án: thêm projection có phân trang.
- Chưa có PDF Paper được cấp quyền riêng: đọc PDF qua API có xác thực, cố định file tại lúc chia sẻ.
- Trigger lưu lịch sử bất biến từ chối cả thay đổi mode: migration chỉ cho sửa mode và revoked_at, vẫn khóa nội dung/tác giả/file đã công bố.
- Mở lại dialog của Paper chỉ xem vẫn chọn COMMENT: giữ đúng quyền hiện tại, chỉ thay khi người dùng chọn.
- Reader lấy trang đầu feedback của cả quan hệ: lọc phía server theo shareId, có phân trang riêng từng tài liệu.
- Nút thu hồi có thể hiện cho thành viên không phải người chia sẻ: server trả canUnshare theo owner/người chia sẻ, UI dùng quyền này; backend vẫn xác minh lại.

## 2. Trải nghiệm đã triển khai

### Phía nhóm

- Library Paper detail có **Chia sẻ với cố vấn**.
- Dialog chọn Mentor đã Accept và còn hiệu lực; mặc định tài liệu mới là **Xem và góp ý**, lựa chọn **Chỉ xem**.
- Không nhập lý do, expiry hay checklist quyền; lỗi giữ lựa chọn để retry.
- Paper đang chia sẻ hiện đúng mode; gửi lại cùng quyền không tạo grant, audit hay notification trùng.
- **Ngừng chia sẻ** có xác nhận, chỉ thu hồi direct share. Chủ dự án được thu hồi mọi direct share; thành viên thu hồi bản do mình chia sẻ.
- Support dùng **Tài liệu đã chia sẻ**; card Mentor có hồ sơ, thông tin đơn vị/vai trò/ngày bắt đầu thực tế, chat và tài liệu.
- Kết thúc hướng dẫn nằm trong phần quản lý có xác nhận.
- Direct share và manuscript review hiện riêng nguồn quyền; bản thảo có revision và link đến Review Request cũ. Hủy review dùng workflow review, không dùng revoke direct share.

### Phía Mentor

- `/mentor-workspace?view=resources` và sidebar **Tài liệu đã chia sẻ**.
- Tổng hợp giữa nhiều dự án, phân trang phía server. Bộ lọc hiện tại được ghi rõ **Lọc trên trang này**.
- Mở đúng nội dung được chia sẻ, PDF đã cố định, góp ý khi COMMENT; VIEW ẩn composer và backend từ chối comment/suggestion.
- Feedback có phân trang theo Paper, không bị tin nhắn hoặc feedback tài liệu khác đẩy khỏi danh sách.
- Mở PDF bằng reader riêng hiện có, hỗ trợ fit/zoom; không tạo public URL.
- Bản thảo cần review tiếp tục nằm trong Work Queue hiện có, không tạo một queue thứ hai.

Bổ sung dịch Anh/Việt cho các thành phần chia sẻ mới. Giữ shell/sidebar chính và design system hiện có.

## 3. Authorization, tính nhất quán và lịch sử

- Kiểm tra authenticated user, project, lời mời ACCEPTED, quan hệ ACTIVE, tài khoản/giảng viên hợp lệ, tài nguyên và nguồn cấp quyền.
- Share Paper chỉ nhận identity tài nguyên và mode; title/abstract/DOI lấy từ project Paper thực tế, không tin nội dung hoặc permission do client tự dựng.
- Ghi trong transaction/khóa workspace hiện có; expectedVersion chống ghi đè và retry đồng thời được deduplicate.
- Chia sẻ pin `source_file_id` hiện có; upload Paper PDF mới không thay nội dung đã chia sẻ.
- Legacy share không tự nhận quyền đọc PDF mới. Không sửa snapshot hay tự mở rộng quyền cũ.
- Revoke direct share không chạm assignment/review feedback; chấm dứt quan hệ/expiry/mất xác minh làm vô hiệu truy cập theo quan hệ.
- File/PDF đọc lại quyền mỗi request, kiểm tra project/Paper/file; trả `private, no-store`, PDF MIME và nosniff.
- Reader ẩn nội dung cache khi refresh báo lỗi; polling tài liệu đang mở 5 giây, inbox 10 giây. Server từ chối ngay request mới sau revoke. Không thể thu hồi các byte đã tải về thiết bị người nhận trước đó.
- Realtime giữ cơ chế kiểm tra quyền người nhận cũ, không thêm broadcast chứa nội dung Paper.
- Dùng notification/outbox hiện có với event key riêng từng share/version; retry không tạo thông báo trùng. Nội dung notification không chứa abstract/private PDF.
- Audit giữ actor/project/resource/action, mode trước/sau và timestamp. Không yêu cầu người dùng giải thích mỗi thao tác.

## 4. API, schema và các tệp thay đổi

### Backend/shared types

- `packages/shared-types/src/mentor-access.ts`: safe defaults, Paper mode/input, resource inbox/review projection và canUnshare.
- `apps/backend/prisma/mentor-access.prisma`: accessMode/sourceFileId nullable.
- `apps/backend/prisma/migrations/20261120090000_mentor_paper_share_mode/migration.sql`: additive, replay-safe, giữ các guard lịch sử.
- `apps/backend/src/modules/projects/mentor-access.service.ts`: sharing/reader/inbox, quyền theo tài nguyên, revoke, feedback và projections.
- `apps/backend/src/modules/projects/mentor-access.controller.ts`: thin handlers và private PDF response.
- `apps/backend/src/modules/projects/mentor-access.routes.ts`: validate/rate limit và file route.
- `apps/backend/src/modules/projects/dto/mentor-access.schema.ts`: strict Paper input, optional shareId cho feedback, action reason default.
- `apps/backend/src/modules/projects/mentorship-dossier.ts`: default invitation policy an toàn.
- `apps/backend/src/modules/projects/project.routes.ts`: mount global resource projection.
- `apps/backend/scripts/test-mentor-workspace.mjs`: tùy chọn chạy focused sharing suite.

API tái sử dụng:

- `POST /api/v1/projects/:id/mentor-access/:accessId/shares` nhận `{kind:"PAPER", resourceId, accessMode, expectedVersion}`; vẫn hỗ trợ payload legacy.
- `POST /api/v1/projects/:id/mentor-access/:accessId/shares/:itemId/revoke`.
- `GET /api/v1/projects/:id/mentor-access/:accessId/shares/:itemId`.
- `GET /api/v1/projects/:id/mentor-access/:accessId/feedback?page=1&shareId=<uuid>`; bỏ shareId giữ hành vi cũ.

API projection/file mới trên cùng service/model:

- `GET /api/v1/projects/academic-support/resources?page=1`.
- `GET /api/v1/projects/:id/mentor-access/:accessId/shares/:itemId/pdf`.

### Frontend

- Mới: `apps/web/src/features/projects/components/mentor-paper-sharing.tsx`.
- `apps/web/src/features/projects/components/mentor-access-workspace.tsx`.
- `apps/web/src/features/projects/components/collaborative-library.tsx`.
- `apps/web/src/features/projects/components/mentor-project-workspace.tsx`.
- `apps/web/src/features/projects/api/mentor-access.api.ts`.
- `apps/web/src/pages/academics/academic-support.tsx`.
- `apps/web/src/pages/academics/mentor-workspace.tsx`.
- `apps/web/src/components/layout/app-single-sidebar.tsx`.
- `apps/web/src/features/notifications/utils/notification-destination.ts`.
- Mới: `apps/web/src/i18n/locales/mentor-sharing.ts`; tích hợp `en.ts`, `vi.ts`.

Sửa regression được chứng minh trong `apps/web/src/pages/submissions/submission-detail.tsx`: khai báo/gate visibleHistory khi lỗi, không dùng cached history đã bị từ chối, chỉ mở editor khi sourceManuscriptWritable, không âm thầm chuyển revision không tồn tại sang bản mới nhất, bỏ props không còn hợp lệ của FeedbackPanel.

Danh sách máy đọc được: [27 tệp thuộc nhiệm vụ](changed-files.json).

Các tệp có thay đổi sẵn trong working tree được giữ; danh sách trên mô tả phần thay đổi của nhiệm vụ này, không có nghĩa toàn bộ diff trong mỗi tệp đều do nhiệm vụ này tạo.

### Tests

- Mới: `apps/web/src/features/projects/__tests__/mentor-paper-sharing.test.tsx`.
- Mới: `apps/backend/src/modules/projects/__tests__/mentor-sharing.browser.ts`.
- Bổ sung: `apps/backend/src/modules/projects/__tests__/mentor-access.persistence.test.ts`.
- Bổ sung: `apps/backend/src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts`.

## 5. Kiểm thử thực tế

Các lượt có giao nhau, không cộng số test thành một tổng mới.

| Lượt chạy | Kết quả |
| --- | --- |
| Shared types build, Prisma generate | Đạt |
| Web regression 7 file | 107 passed |
| Backend regression 5 file, database sạch | 95 passed, 1 skipped (interactive fixture có chủ đích) |
| Focused sharing sau chỉnh sửa cuối, có browser thật | 35 passed |
| Realtime project/team chat, 2 file | 4 passed |
| Scoped backend/web lint | Đạt |
| git diff --check với các tệp thuộc nhiệm vụ | Đạt |
| Web Vite bundle + bundle budget, chạy riêng | Đạt; không thay thế typecheck/full build |
| Backend/web full typecheck và full build | Chưa đạt, lỗi ngoài phạm vi bên dưới |

Backend runner tạo database PostgreSQL test riêng, chạy migrations từ đầu rồi dọn đúng database test. Không dùng database ứng dụng để tạo fixture. Test bao phủ Pending/Accept, từ chối truy cập dữ liệu riêng tư, chat, assigned tasks, hai chiều invitation, scope project/mentor/resource, API/file, replay/concurrency, revoke/expiry/end/ineligible, feedback/history và nguồn quyền review độc lập. Luồng review kiểm tra v1/v2/working draft, feedback và rereview; không chỉ mock database.

Browser dùng hai session xác thực riêng với API và PostgreSQL test thật, component React thật, canvas PDF.js thật. Harness riêng ghép các component sản phẩm, không thay API bằng response giả. Đây không phải một lượt đăng nhập thủ công qua toàn bộ app shell tại cổng 8080.

Chuỗi đã chạy: Owner share COMMENT → Mentor đọc PDF/comment → Owner đổi VIEW → Mentor reload vẫn thấy feedback, không composer → Owner revoke → Mentor reload không còn tài liệu. Không có page exception hoặc tràn ngang ở mobile.

Kích thước: desktop 1440×900, tablet 1024×768, mobile 390×844; có dark mode.

Lệnh tái chạy chính (browser flag cần Vite test chạy ở terminal riêng):

```powershell
# Terminal riêng, từ apps/web, chỉ phục vụ browser test
node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8091 --strictPort

# Từ apps/backend
$env:MENTOR_SHARING_BROWSER = '1'
node scripts/test-mentor-workspace.mjs --regression
node scripts/test-mentor-workspace.mjs --sharing-only
# Browser harness dùng Vite tại 127.0.0.1:8091; xem mentor-sharing.browser.ts.

# Từ apps/web
node ../../node_modules/vitest/vitest.mjs run src/features/projects/__tests__/mentor-paper-sharing.test.tsx src/features/projects/__tests__/mentor-workspace.test.tsx src/features/projects/__tests__/mentor-conversation.test.tsx src/features/projects/__tests__/mentorship-invitation-viewer.test.tsx src/pages/academics/__tests__/mentor-project.test.tsx src/features/submissions/__tests__/submission-detail-redesign.test.tsx src/features/submissions/__tests__/mentor-manuscript-dialog.test.tsx --maxWorkers=1 --minWorkers=1
node scripts/build.mjs
```

Log đầy đủ (được ignore): `apps/web/.cache/mentor-sharing-tests-final.log`, `apps/backend/.cache/mentor-sharing-browser-final.log`, `apps/backend/.cache/mentor-sharing-browser-visual-final.log`, `apps/backend/.cache/mentor-sharing-realtime-tests.log`, `apps/{web,backend}/.cache/mentor-sharing-{lint,types,build}-final.log` (full build cũ dùng `mentor-sharing-build.log`), `apps/web/.cache/mentor-sharing-bundle-final.log`.

### Bằng chứng UI

- [Dialog desktop](owner-share-dialog-desktop.png), [tablet](owner-share-dialog-tablet.png), [mobile](owner-share-dialog-mobile.png).
- [Support và tài liệu chia sẻ](owner-shared-resources.png).
- [Mentor đọc và góp ý](mentor-resource-feedback.png), [dark mode](mentor-resource-dark.png).
- [Chỉ xem, mobile](mentor-view-only-mobile.png).
- [Đã thu hồi, mobile](mentor-revoked-empty-mobile.png).
- [Kết quả browser](browser-results.json).

## 6. Database local và migration

Database local `lumigap_db` được audit riêng, không chứa fixture của test.

Trước/sau: 0 direct shares, 0 mentor feedback, 1 review request, 166 migration ledger rows. Không thay các bản ghi cũ.

Policy legacy thực tế: 1 ADVISOR chỉ có MENTOR_CHAT; 1 ADVISOR với 15 quyền ban đầu; 8 ADVISOR permissions rỗng. Không tự nâng cấp các policy này hoặc tự chia sẻ tài liệu.

Đã áp dụng đúng SQL migration mới theo transaction để local hiểu hai cột nullable và guard mode. Không chạy full migrate deploy vào database ứng dụng vì còn các migration cũ chưa giải quyết. `_prisma_migrations` giữ nguyên; migration mới vẫn pending trong ledger, không được đánh dấu applied giả. SQL replay-safe để lần deploy migration chuẩn sau này ghi nhận bình thường.

Có 7 migration pending theo ledger:

1. `20261102090000_papers_openalex_id_unique`
2. `20261107113000_orcid_verified_unique`
3. `20261107120000_topic_watches`
4. `20261110090000_screening_team_workflow`
5. `20261112090000_screening_workflow_status_compatibility`
6. `20261113090000_paper_ingest_source`
7. `20261120090000_mentor_paper_share_mode` (schema compatibility SQL đã áp dụng, ledger chưa ghi nhận)

Không có migration đã applied bị thiếu file local. Trong 58 checksum khác raw file, 50 khớp khi chuẩn hóa CRLF/LF/BOM; 8 còn khác cần đối chiếu bản SQL đã triển khai. Không kết luận toàn bộ migration history bị hỏng.

Vẫn có 7 nhóm OpenAlex ID trùng. Không xóa/merge bản ghi hoặc cố áp unique constraint. Cần rà FK/tham chiếu, quyết định Paper chuẩn và kế hoạch hợp nhất có backup trước khi xử lý migration unique.

Bằng chứng: [audit dữ liệu](local-data-audit.json), [schema compatibility](local-schema-compatibility.json), [ledger](local-migration-audit.json), [phân loại checksum](local-migration-checksums.json).

Phục hồi an toàn: giữ các cột nullable và nội dung đã xuất bản; không drop dữ liệu để rollback. Nếu tắt giao diện mới, vẫn giữ backend kiểm tra accessMode và nguồn grant. Không quay về backend cũ bỏ qua mode vì có thể mở lại quyền legacy ngoài ý muốn. Ưu tiên migration forward sau khi audit blockers, không sửa trực tiếp lịch sử.

## 7. Giới hạn và điều kiện bàn giao

- **P1, chặn build:** các kiểu `evidenceStatus` giao nhau thành `never` trong Manuscript AI/editor/integrity service; `AvailableMentor.institution` không tồn tại trong mentor-match-evidence-dialog. Các lỗi này nằm ngoài thay đổi chia sẻ của nhiệm vụ. Full build/typecheck không được báo xanh.
- **P1, chặn triển khai migration toàn bộ local:** 6 migration cũ pending, 8 checksum chưa giải thích bằng xuống dòng và dữ liệu OpenAlex trùng. Không tự sửa lịch sử hoặc dữ liệu để vượt qua.
- **P2:** filter hộp tài liệu hiện giới hạn trên trang hiện tại; đã ghi rõ nhãn. Không phải tìm kiếm toàn bộ corpus.
- **P2:** workspace cũ vẫn có các query theo từng quan hệ trong trang 20 policy; phần review projection mới được batch và global inbox không tải content/PDF toàn bộ. Chưa có benchmark tải lớn để khẳng định hiệu năng quy mô cao.
- Legacy share giữ nguyên nội dung đã chọn và quyền cũ; PDF không được tự mở thêm. Team có thể chia sẻ Paper mới khi muốn cấp PDF hiện tại một cách rõ ràng.

Phần chia sẻ Mentor đã có kiểm thử chức năng, quyền và browser thực tế. Chưa đủ điều kiện coi toàn repository là CI-green hoặc triển khai cho đến khi xử lý build và migration blockers. Không tự động commit/push/deploy, reset database hay xóa dữ liệu.
