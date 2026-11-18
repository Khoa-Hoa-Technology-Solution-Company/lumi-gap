# Support: invitation viewer theo người xem

Triển khai tại `D:\lumi-gap`, 18/11/2026. Không commit, push hoặc deploy production.

## Lỗi đã xác minh

1. `InvitationDossierView` hiển thị phần “Nếu chấp nhận, bạn sẽ tham gia…” cho tất cả người xem, kể cả Owner gửi lời mời. Các nút đã được backend kiểm soát nhưng nội dung không phản ánh vai trò của người đang đọc.
2. Popup cũ chỉ tải lại detail cho dossier BRIEF; một số hồ sơ legacy dùng dữ liệu danh sách nên có thể hiển thị trạng thái cũ.
3. Support trộn relationship, pending request và lịch sử; mỗi relationship có cả nút mở lại dự án đang xem, kết thúc hướng dẫn và đường dẫn cấu hình quyền lặp với phần chia sẻ ở cuối trang.
4. Phân trang invitation history cũng phân trang relationships. Khi chuyển sang trang sau, cố vấn ACTIVE có thể biến mất dù tổng số đang hướng dẫn vẫn lớn hơn 0.
5. Validator chặn nội dung rỗng/số/placeholder ngắn nhưng chưa chặn nguyên văn câu hướng dẫn của form.

## Truy vết nội dung invitation thực tế

Đã đọc trực tiếp PostgreSQL local cho dự án `6ab33f1537802fe30d38753b`, không sửa dữ liệu. Request Pending hiện có lưu cùng câu:

> Giới thiệu vấn đề, mục tiêu và hướng nghiên cứu. Không cần một abstract hoàn chỉnh.

Câu này có sẵn trong cả `mentorship_requests.message`, `invitationSnapshot.dossierConfig.researchSummary`, `dossier.project.abstract`, `dossier.whyThisLecturer.message` và `invitationSnapshot.project.summary`.

Mã hiện tại gửi hai field riêng: textarea tóm tắt → `dossier.researchSummary` → snapshot abstract; textarea lời mời → `message` → snapshot `whyThisLecturer.message`. Renderer đọc từng field riêng, không fallback từ summary sang message hoặc ngược lại. Không có request log gốc để xác định thao tác nhập/copy đã tạo bản ghi này; bằng chứng database không đủ để khẳng định renderer đã tự tạo ra nội dung trùng.

Không thay nội dung cũ bằng ví dụ hay xóa chuỗi đã lưu. Lời mời đã gửi còn được database trigger bảo vệ bất biến. Bổ sung guard dùng chung frontend/backend để từ chối nguyên văn các câu hướng dẫn mặc định ở lần gửi mới. Nội dung nghiên cứu ngắn, tiếng Việt/Anh/Hán và câu có số vẫn được xử lý theo quy tắc hiện có; không dùng AI để chấm chất lượng.

## Hiển thị và hành động theo vai trò

API trả thêm `MentorshipRequest.viewer` với giá trị `SENDER`, `RECIPIENT` hoặc `TEAM`, tính từ authenticated account, direction và quyền Owner hiện tại. Đây là dữ liệu trả về, không phải viewerRole client được quyền gửi để cấp quyền. Accept/Decline/Cancel tiếp tục xác minh người thao tác trong transaction, không dựa vào trường UI.

`MentorshipInvitationViewer` thay thế popup cũ, dùng endpoint detail hiện có cho cả BRIEF và legacy. Component không nhận snapshot/role do caller tự truyền; chỉ nhận project/request ID rồi tải dữ liệu được phân quyền, với query key gắn account. Khi detail trả lỗi quyền, không hiện nội dung snapshot hoặc nút xử lý từ dữ liệu cũ.

| Người xem | Nội dung | Hành động |
| --- | --- | --- |
| Sender / Owner gửi lời mời | “Lời mời đã gửi”, giảng viên nhận, người gửi, ngày gửi, snapshot và trạng thái; Pending có “Đang chờ giảng viên phản hồi” | Đóng; Thu hồi khi server còn cho phép và trạng thái Pending |
| Recipient / Mentor | “Lời mời hướng dẫn”, người gửi/dự án và cùng snapshot; giải thích ngắn quyền sau Accept chỉ khi còn Pending | Accept/Reject khi server cho phép; sau xử lý chỉ xem kết quả và lối vào dự án phù hợp |
| Active Member của nhóm | Cùng nội dung đã được chia sẻ, không có lời giải thích nhập vai Mentor | Chỉ xem và đóng |
| Người ngoài / Mentor khác | API từ chối | Không có snapshot hay hành động |

Lời đề nghị từ Lecturer tới Project vẫn theo chiều gửi/nhận thực tế; Owner nhận offer không được mô tả như người sắp trở thành Mentor. Request đã Accepted/Declined/Cancelled không có nút xử lý lại, kể cả khi một DTO cũ còn cờ action. Các response conflict được tải lại trạng thái; khóa synchronous chống click đúp.

## Support UI

- **Đang hướng dẫn:** relationship ACTIVE, tên/đơn vị, vai trò thực tế, ngày tham gia, Xem hồ sơ ở tab mới và Trao đổi qua kênh Mentor hiện có.
- **Lời mời đang chờ:** người được mời, ngày gửi, trạng thái và Xem lời mời đã gửi. Offer nhận từ giảng viên dùng nhãn xem lời mời theo chiều tương ứng.
- **Lịch sử:** thu gọn mặc định. Các list/dialog giữ instance khi item đổi nhóm, nên trạng thái thành công không biến mất sau refetch.
- Không có nút Mở dự án trong cards/popup của chính Project đang xem.
- Kết thúc hướng dẫn nằm trong menu Quản lý cố vấn, mở bước xác nhận hiện có; chưa xác nhận thì relationship không đổi.
- Chỉ giữ một khu vực **Quyền & chia sẻ nâng cao** thu gọn cho Owner, tái sử dụng `MentorAccessWorkspace`. Bỏ nút cấu hình quyền lặp trên từng card trong Project.
- Khi phân trang lịch sử trong Project Support, API giữ các relationship ACTIVE đúng scope ở phần đầu; không mở rộng scope của global Mentor queue.
- Không đổi sidebar, layout shell, giới hạn Mentor hoặc nghiệp vụ phân vai. UNASSIGNED vẫn là mặc định; PRIMARY/SECONDARY chỉ thay đổi qua consent flow hiện có.

## Security và dữ liệu

Không tạo API/model invitation mới hoặc migration mới. Tái sử dụng `MentorshipRequest`, `MentorRelationship`, access policy và transaction/locks hiện có. Supervisor membership tiếp tục là relationship ACTIVE cùng quyền scoped, tách khỏi student `ProjectMember`.

Pending không cấp quyền Project. Accept tạo đúng một relationship; Decline/Cancel không tạo relationship. Member không được cancel hoặc Accept thay Owner/Mentor. Invitation ID ghép sai project, Mentor khác và outsider bị chặn. Không mở private library, evidence, live manuscript hoặc chat nội bộ qua viewer. Dossier legacy/file đã chủ động đính kèm vẫn theo access checks cũ.

Không tự thêm Mentor vào authorship hoặc tạo manuscript review chỉ vì Accept. Regression kiểm tra review v1/feedback/v2, grant đúng revision, endpoint PDF, nhiều Mentor/dự án và thu hồi quyền. Notifications, Project Members và Mentor Workspace dùng dữ liệu hiện có, được invalidate sau action.

## File thay đổi trong lượt này

| Nhóm | File |
| --- | --- |
| Backend | `apps/backend/src/modules/projects/project-mentorship.service.ts`: viewer context và giữ ACTIVE relationships khi phân trang Support |
| Shared | `packages/shared-types/src/project.ts`: viewer metadata optional; `research-introduction.ts`: từ chối câu hướng dẫn mẫu |
| Viewer mới thay popup cũ | `apps/web/src/features/projects/components/mentorship-invitation-viewer.tsx` |
| Compatibility helper | `apps/web/src/features/projects/utils/mentorship-viewer.ts` |
| Nội dung snapshot | `apps/web/src/features/projects/components/invitation-dossier-view.tsx`: tách thông báo quyền khỏi dữ liệu snapshot |
| Support integration | `apps/web/src/pages/academics/academic-support.tsx`: ba nhóm, menu quản lý, một điểm cấu hình nâng cao |
| i18n | `apps/web/src/i18n/locales/supervisor-invitation.ts` |
| Backend tests | `apps/backend/src/modules/projects/__tests__/supervisor-discovery.persistence.test.ts`, `supervisor-discovery.browser.ts`, `research-introduction.test.ts` |
| Web tests | `apps/web/src/features/projects/__tests__/mentorship-invitation-viewer.test.tsx`, `apps/web/src/pages/academics/__tests__/academic-support.test.tsx` |

Các thay đổi của task trước/người dùng trong cùng working directory được giữ nguyên.

## Kiểm thử đã chạy

- Web regression 12 files: **147 passed**. Bao gồm sender/recipient/member, terminal states/reload, lỗi quyền, mapping hai field, double-click, forms, notification navigation, Mentor Workspace, role allocation và manuscript send dialog.
- `node scripts/test-mentor-workspace.mjs --supervisor-only --supervisor-browser`: **55 passed, 1 skipped**. Bao gồm authenticated HTTP, forged viewerRole, scope theo project/request, dữ liệu lịch sử bất biến, giữ active mentors qua pagination, concurrent send/Accept/Cancel và Playwright thật với Member, Owner và hai Mentor.
- `node scripts/test-mentor-workspace.mjs --supervisor-regression`: **87 passed, 1 skipped**, kiểm tra mentor plan, legacy dossiers, consent workflow, memberships, scoped private endpoints và notification deduplication.
- Typecheck backend/web và scoped ESLint: đạt.
- Shared-types, backend và web build: đạt. Backend build có thêm **4 test PostgreSQL-only runtime audit đạt**. Log build lưu trong `.cache/mentor-viewer-build.log` của từng app.

Hai scenario skip là các browser/interactive scenario phụ có sẵn; browser invitation nhiều tài khoản đã được bật và thực thi. Không coi skip là PASS. Các suite DB/browser tạo PostgreSQL test database tên ngẫu nhiên, chạy migrations vào đúng DB thử và dọn đúng DB đó. Email tắt; không tạo invitation hoặc tài khoản thử trong DB ứng dụng thật.

Browser đã kiểm tra Owner không có thông báo/nút dành cho Recipient, popup mobile 390×844 không tràn ngang, recipient Accept, dự án xuất hiện ở Mentor Workspace/Project Members, phân vai bằng consent, và menu kết thúc chỉ mở xác nhận. Đã xem ảnh desktop/mobile và trang Support sau kiểm thử.

Ảnh tại `docs/audits/2026-11-18-support-viewer/`:

- `owner-sent-invitation.png`, `owner-sent-invitation-mobile.png`.
- `mentor-invitation-detail.png`, `mentor-accepted-next-step.png`.
- `roles-confirmed.png`: ba nhóm trong Support sau khi hai Mentor Accept.
- Các ảnh `failure-*` thuộc lượt kiểm tra selector tìm kiếm trước khi dùng locator phù hợp với UI hiện tại; không phải kết quả QA cuối.

## Giới hạn

Không có request log gốc để xác định ai hoặc thao tác nào đã nhập câu hướng dẫn vào invitation cũ. Lịch sử đó được giữ nguyên. Không test toàn bộ monorepo/Flutter hoặc gửi email thật. Các warning Browserslist/React Router/React act từ công cụ test vẫn còn; không nâng dependency ngoài phạm vi.

Không reset database, sửa lịch sử migration, thay secrets hoặc tự động commit/push/deploy.

## Sửa popup bị khuất nút trên nội dung dài

Sau phản hồi kèm ảnh, viewer được chuyển từ cuộn toàn dialog sang ba vùng: header cố định, nội dung cuộn riêng và footer cố định. Chiều cao bị giới hạn theo viewport, có khoảng cách với mép màn hình; vùng nội dung nhận focus để cuộn bằng bàn phím. CSS chỉ áp dụng cho viewer này, không đổi Dialog primitive hoặc các popup khác.

File: `components/mentorship-invitation-viewer.tsx`, `features/projects/mentorship-invitation-viewer.css`, `i18n/locales/supervisor-invitation.ts` và script `apps/web/scripts/check-invitation-viewer-layout.mjs`.

Đã chạy 46 test viewer/Academic Support, scoped lint và web typecheck. Script layout dùng component, renderer và CSS thật với dữ liệu legacy dài trong browser storage riêng; API được thay bằng fixture và chặn HTTP API ứng dụng. Đây là kiểm tra layout, không gửi/thu hồi lời mời thật hoặc kiểm thử API E2E mới.

Năm case đạt: 1440×900, 1280×600, 390×640, 390×640 dark và 844×390. Kiểm tra bounding rect không vượt viewport, không tràn ngang, nội dung có thể cuộn, header/footer không chồng lên nội dung và hit-test nút Đóng không bị che. Đã cuộn nội dung và bấm đóng thành công ở từng case. Ảnh `layout-*.png` nằm trong thư mục QA ở trên; dữ liệu đo nằm tại `apps/web/.cache/invitation-layout-results.json`.
