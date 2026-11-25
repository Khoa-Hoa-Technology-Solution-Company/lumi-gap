# Member → Owner → Mentor: đề xuất, mời và nhận hướng dẫn

Triển khai và kiểm thử tại `D:\lumi-gap`, ngày 18/11/2026. Báo cáo này cập nhật phần form và snapshot trong `MENTOR_INVITATION_SIMPLIFICATION_20261117.md`; các quy tắc nhiều Mentor, phân vai sau Accept và scoped review hiện có được giữ nguyên.

## 1. Audit và các lỗi đã xác minh

Trước khi sửa, LumiGap đã có một hệ thống chính thức gồm `MentorSuggestion`, `MentorshipRequest`, `MentorRelationship`, `MentorAccess`, notification outbox và scoped manuscript review. Member proposal chỉ thông báo Owner; gửi invitation mới liên kết proposal với request. Backend đã khóa dự án/account và kiểm tra người được thao tác, trạng thái, capacity, quyền và verification. Không xây hệ thống lời mời hoặc review mới.

Các điểm chưa nhất quán được xác minh trực tiếp:

- Form mời có hai textarea nhưng vẫn yêu cầu thêm checkbox chia sẻ. Form đề xuất dài, có nhiều phần thông tin và dùng thẻ giảng viên riêng.
- Preview form mời không hiện lời nhắn. Payload lại kèm mục tiêu/keywords từ defaults; snapshot project còn mang nhu cầu/chuyên môn discovery chưa được preview đầy đủ.
- Một phần hồ sơ dựng lại representative/competencies từ profile hiện tại. Điều này không phù hợp với lời mời ngắn cần giữ nguyên thông tin đã duyệt tại thời điểm gửi.
- Proposal có trạng thái Pending/Active nhưng chưa luôn có lối mở invitation đang tồn tại.
- Khi Mentor Accept, refetch danh sách incoming loại request đã xử lý khỏi danh sách và unmount dialog. Browser test thật phát hiện Mentor mất màn hình thành công và nút vào dự án dù database đã ghi nhận Accept.
- Notification mới báo nhận lời mời còn dùng nội dung chung; nhóm chưa nhận thông báo Accept đầy đủ.

Không phát hiện nhu cầu thay schema quan hệ hay tạo endpoint khác.

## 2. Form và workflow hiện tại

### Member

Tìm giảng viên → xem Academic Profile → **Đề xuất giảng viên** → nhập một lý do → gửi Owner.

Form dùng chung `LecturerInvitationCard` với form mời: tên, avatar, đơn vị, tối đa ba chuyên môn nổi bật, link profile ở tab mới. Nhãn xác minh dựa vào dữ liệu backend, không suy ra từ từ khóa hay tự khai báo. Form đề xuất chỉ thêm tên dự án, một textarea và disclosure rằng giảng viên chưa được mời. Lỗi giữ nguyên lý do; có khóa double-submit và kiểm tra phiên đăng nhập.

Proposal không tạo invitation, relationship, quyền truy cập hay thông báo cho giảng viên. Backend vẫn chặn Member gọi API mời chính thức.

### Owner

Owner xem lý do/người gửi/ngày/trạng thái trong inbox đề xuất. **Mời hướng dẫn** mở cùng `SupervisorInvitationForm` đã chọn đúng giảng viên; mở form không gửi invitation. Chỉ khi bấm **Gửi lời mời** mới tạo request. Owner vẫn có thể bỏ qua, giữ lịch sử và thông báo người đề xuất. Proposal có invitation được liên kết có lối mở lời mời hiện có; Pending/Active chặn mời thêm.

Form mời có hai trường chính:

1. **Tóm tắt nghiên cứu**, lấy sẵn từ thông tin dự án nhưng được sửa riêng cho lời mời.
2. **Lời mời giảng viên**, gộp lý do chọn, mong muốn được hướng dẫn và lời nhắn.

Nhu cầu hỗ trợ là phần tùy chọn thu gọn. Không hỏi vai trò chính/phụ, ngày bắt đầu, file upload hoặc metadata dự án đã tồn tại. Không thêm một bước xác nhận. Hành động gửi cùng disclosure rõ ràng ghi nhận chia sẻ; trường `sharingConfirmed=true` là dữ liệu giao thức của hành động đó, không có checkbox thứ hai.

Validation cơ bản hiện có được giữ: trống, nội dung mẫu rõ ràng và giới hạn trên. Không áp minimum 80–300 ký tự và không tuyên bố đánh giá chất lượng nghiên cứu.

**Dự án vẫn riêng tư** có **Xem thông tin sẽ gửi**. Preview dùng chung component với phía Mentor, cập nhật ngay theo hai textarea và nhu cầu hỗ trợ. Không truyền mục tiêu, từ khóa kế hoạch nghiên cứu, profile đại diện mở rộng hay nhu cầu discovery ngầm.

Draft được tách theo account/project/lecturer. Gửi thất bại giữ form và idempotency key; retry cùng nội dung không tạo request mới. Những draft cũ chứa reason/additional vẫn được phục hồi thành một lời nhắn. Không sửa các invitation đã gửi.

### Mentor

Notification nhận lời mời nêu dự án và người gửi, giữ route tới đúng request. Mentor Workspace tổng hợp invitation từ các dự án. Card của invitation ngắn chỉ hiện tên/người gửi/lĩnh vực/ngày/trạng thái và **Xem lời mời**, không trải toàn bộ abstract trên card.

Detail tải request mới nhất từ endpoint được phân quyền và hiện đúng snapshot. Có disclosure quyền sau Accept, hai hành động **Từ chối | Chấp nhận hướng dẫn**; không yêu cầu lý do từ chối hoặc một form đăng ký khác.

Sau Accept, dialog giữ trạng thái **Đã nhận hướng dẫn dự án** và **Vào dự án**, kể cả khi danh sách Pending đã refetch thành rỗng. Request đã hủy/xử lý được đọc lại với trạng thái hiện tại, không mở lại hành động Accept.

## 3. Snapshot và chống lộ dữ liệu

Tái sử dụng `MentorshipRequest.invitationSnapshot`, `InvitationDossier` và API settings hiện có. Không thêm bảng, migration hoặc endpoint.

Settings Owner có `invitationContext`: tên dự án, lĩnh vực, chủ đề, tên đại diện, số thành viên và token kiểm tra phiên bản thông tin. Backend tạo context từ database, không nhận các tên/ID người gửi do client tự khai báo. Token là hash để phát hiện dữ liệu hiển thị đã cũ, không phải access credential. Thay đổi tên dự án, lĩnh vực, chủ đề, tên người gửi hoặc số thành viên yêu cầu tải lại context trước khi gửi; thay đổi ghi chú private không liên quan không làm hỏng token.

Invitation ngắn dùng `dossier.presentation=BRIEF`. Backend lưu:

- project/request/recipient/sender ID và timestamp trong các cột hiện có;
- tên dự án, lĩnh vực và chủ đề đã hiển thị;
- tóm tắt được sửa riêng và lời mời;
- tên đại diện và tổng số thành viên;
- nhu cầu hỗ trợ nếu người gửi chủ động chọn;
- policy và version quyền hiện có phục vụ Accept.

Schema BRIEF không cho thêm objective, keywords, extended profile, team profiles hoặc kỳ vọng ẩn. Snapshot project không mang `mentoringNeeds`/expertise từ discovery. `projectRequestDossiers` trả BRIEF đã lưu, không enrich bằng profile hoặc danh sách thành viên hiện tại. Snapshot vẫn nguyên sau khi sửa dự án, đổi tên đại diện hoặc thêm thành viên.

Các dossier đầy đủ và invitation legacy vẫn đọc được theo cơ chế tương thích cũ; không chuyển đổi/xóa lịch sử. Chỉ invitation mới có BRIEF dùng cách trình bày ngắn.

Không đưa private library, evidence matrix, research plan, draft, chat hoặc file nội bộ vào brief. Pending Mentor đọc invitation được gửi cho mình; không được gọi Project API private để dựng màn hình. Người ngoài, Mentor khác và URL ghép sai project/request bị chặn.

## 4. Accept, quyền và đồng bộ

Backend tiếp tục dùng transaction và khóa hiện có: đúng recipient, request còn Pending, dự án hoạt động, tài khoản/lecturer đủ điều kiện, policy còn hiệu lực và capacity còn chỗ. Accept/Cancel đồng thời chỉ ghi một kết quả cuối. Retry Accept không tạo relationship/notification trùng.

Supervisor membership trong LumiGap là `MentorRelationship ACTIVE` cùng `MentorAccess`, tách khỏi `ProjectMember` của nhóm nghiên cứu. Không thêm Mentor vào authorship, không tạo review request/task chỉ vì nhận hướng dẫn. Project Members và Mentor Workspace đọc relationship đã Accept; Pending không trở thành thành viên hướng dẫn.

Accept hiện gửi notification cho Owner và active project team, chống trùng theo người nhận. Từ chối dùng trạng thái `DECLINED` hiện có, không thêm enum REJECTED. Hủy Pending tiếp tục dùng trạng thái hiện có. Không đổi giới hạn hai Mentor ACTIVE, thời hạn hoặc chính sách historical requests. Mentor mới vẫn `UNASSIGNED`; phân vai sau Accept cần đồng thuận qua luồng đang có.

Chat chỉ mở theo accepted access hiện có. Review tiếp tục qua grant đúng manuscript revision, không mở editor live hay quyền EDIT/DELETE. Regression bao gồm v1 → feedback → v2, nhiều Mentor/dự án, thu hồi grant và endpoint file.

## 5. File thay đổi trong lượt này

| Nhóm | File |
| --- | --- |
| Shared contract | `packages/shared-types/src/project.ts`: context, BRIEF presentation và tên đại diện snapshot |
| Backend snapshot | `apps/backend/src/modules/projects/mentorship-dossier.ts` |
| Proposal/invitation/Accept | `apps/backend/src/modules/projects/project-mentorship.service.ts` |
| Notification copy | `apps/backend/src/modules/projects/mentorship-notifications.ts` |
| Form mời | `apps/web/src/features/projects/components/supervisor-invitation-form.tsx` |
| Form đề xuất | `apps/web/src/features/projects/components/suggest-mentor-dialog.tsx` |
| Component chung mới | `lecturer-invitation-card.tsx`, `mentor-invitation-brief.tsx` trong cùng thư mục components |
| Inbox/detail | `mentor-suggestions-panel.tsx`, `invitation-dossier-view.tsx`, `apps/web/src/pages/academics/academic-support.tsx` |
| Style/i18n | `apps/web/src/features/projects/supervisor-invitation.css`, `apps/web/src/i18n/locales/supervisor-invitation.ts` |
| Backend tests | `supervisor-discovery.persistence.test.ts`, `supervisor-discovery.browser.ts`, `mentorship-workflow.persistence.test.ts` |
| Web tests | `supervisor-invitation-form.test.tsx`, `components/__tests__/mentor-suggestions-workflow.test.tsx`, `pages/academics/__tests__/academic-support.test.tsx` |

Các file đã có nhiều thay đổi từ các task trước. Danh sách trên mô tả phạm vi lượt này; không reset những thay đổi khác.

## 6. Kiểm thử thực tế

- `node scripts/test-mentor-workspace.mjs --supervisor-only --supervisor-browser`: **50 passed, 1 skipped**. Bao gồm integration/security và Playwright thật với Member, Owner, hai Mentor trong các browser context riêng. Scenario browser còn skip là scenario tương tác manuscript riêng, không phải invitation E2E vừa chạy.
- Regression web 11 file: **138 passed**, gồm form mời/đề xuất, invitation refresh, notification navigation, Mentor Workspace, role allocation, Mentor project và dialog gửi bản thảo.
- Sau lỗi browser đầu tiên, bổ sung regression dialog không unmount khi incoming chuyển rỗng. Case này và màn hình thành công đã chạy lại đạt.
- Build shared-types, backend, web và typecheck backend/web: đạt. Backend build có PostgreSQL-only runtime audit: **4 passed**.
- Scoped ESLint trên các source thay đổi: đạt.
- Legacy backend regression cho mentor plan, invitation dossier, workflow và authenticated HTTP: **87 passed, 1 skipped**. Đã cập nhật assertion số thông báo theo yêu cầu gửi Owner và team, đồng thời kiểm tra từng người chỉ nhận một lần. Scenario skip là browser tương tác riêng của suite HTTP cũ; invitation browser mới đã chạy đạt ở trên.

Tất cả suite persistence/browser dùng PostgreSQL thử nghiệm mới tên ngẫu nhiên; áp migration trên DB test và dọn đúng DB test sau lượt chạy. Browser gọi backend HTTP thật, không mock lời mời/Accept. Case mất phản hồi gửi invitation commit thật trước khi abort response, sau đó retry cùng key và kiểm tra DB/notification không nhân đôi. Email bị disable; fixture không dùng tài khoản/dự án thật.

Ảnh QA tại `docs/audits/2026-11-18-mentor-proposal/`: form desktop/tablet/mobile/dark, profile entry, Member proposal, Mentor invitation detail, kết quả Accept, project membership và role consent. Đã kiểm tra ảnh form mobile và màn hình Accept. Có vài ảnh `failure-*` từ lượt bắt được lỗi dialog trước khi sửa; không dùng làm kết quả cuối.

## 7. Giới hạn và dữ liệu

- Không có migration mới và không sửa lịch sử migration hiện có. Các trường mới là JSON/type optional, tương thích hồ sơ cũ.
- Không reset database, xóa invitation/proposal cũ, sửa secrets hoặc tạo dữ liệu thử vào DB ứng dụng local.
- Các lời mời cũ chưa có snapshot nguyên gốc vẫn có thông báo legacy hiện có; không tự tạo lại một snapshot lịch sử giả.
- Chưa chạy toàn bộ test của mọi module trong monorepo hoặc test mobile Flutter. QA tập trung vào workflow và các integration liên quan.
- Còn warning công cụ về Browserslist database cũ và React Router/React `act` trong một số test; không có lỗi assertion trong lượt web cuối. Không nâng dependency ngoài phạm vi để xử lý warning.
- Không commit, push hoặc deploy production.
