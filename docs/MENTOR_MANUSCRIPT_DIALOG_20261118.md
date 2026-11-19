# Gửi bản thảo để Mentor góp ý

Ngày xác nhận: 18/11/2026. Thư mục triển khai: `D:\lumi-gap`.

## Kết quả

Thay form chuẩn bị bản thảo dài bằng dialog gửi góp ý nội bộ. Tiêu đề và loại tài liệu lấy từ bản thảo có sẵn; không yêu cầu nhập lại metadata nghiên cứu. Dialog có hai nguồn, Mentor đang có quyền và lời nhắn tùy chọn. Trường trả lời yêu cầu sửa chỉ xuất hiện khi Mentor đã yêu cầu chỉnh sửa.

Điểm mở:

- Trong trình soạn thảo: **Gửi giảng viên góp ý**.
- Trong danh sách bản thảo gửi góp ý: **Gửi bản thảo để góp ý**.
- Trong hồ sơ đang chờ sửa: mở lại dialog để gửi phiên bản tiếp theo trong cùng hồ sơ.
- Đường dẫn tạo hồ sơ cũ được giữ và mở dialog; từ trang toàn cục chỉ cần chọn dự án trước.

Đây là đánh giá nội bộ với Mentor đã chấp nhận hướng dẫn. Luồng phản biện chính thức hiện có được giữ riêng.

## Nguồn LaTeX

1. Khi mở từ editor, chờ tất cả provider xác nhận lưu; snapshot sử dụng minimum sequence của các file. Thay đổi ở chế độ visual/tracked chưa áp dụng hoặc hủy phải được xử lý trước.
2. Tạo snapshot bất biến bằng dịch vụ manuscript hiện có.
3. Biên dịch snapshot với engine/TeX Live của bản thảo.
4. Poll đúng compilation ID, tải PDF của compilation đó và hiển thị trong trình xem PDF riêng tư. Không lấy bản PDF thành công cũ khi lần biên dịch vừa yêu cầu thất bại.
5. Backend đối chiếu snapshot, workspace, dự án, compilation SUCCESS và checksum PDF. Metadata lấy từ manifest snapshot.
6. Sao chép PDF sang storage riêng của revision; source snapshot và PDF đã gửi không đổi khi nhóm tiếp tục viết.

## Nguồn PDF ngoài

- Chọn PDF tối đa 10 MiB, xem trước rồi gửi.
- Backend kiểm tra byte thực, header/EOF và parse bằng `pdf-lib@1.17.1`; từ chối file lỗi, mã hóa, không có trang hoặc hơn 1.000 trang.
- Parser chạy trong worker với giới hạn thời gian/heap; nội dung PDF không được dùng làm mã thực thi.
- Tên upload được bỏ thành phần đường dẫn, lưu bằng storage hiện có. Không tạo hoặc ghi đè workspace LaTeX.
- Trình xem hiện có chỉ render trang PDF, không mở script, form hoặc liên kết annotation trong tài liệu.

Kiểm tra cấu trúc không phải quét antivirus hay chứng nhận PDF không chứa nội dung độc hại. Tham khảo [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) và [PDFDocument API](https://pdf-lib.js.org/docs/api/classes/pdfdocument).

## Version, quyền và chống trùng

- Reuse `Submission`, `SubmissionRevision`, `ReviewRequest`, `ReviewerAssignment`, task, notification và feedback hiện có; không tạo hệ thống review song song.
- `Submission.sourceManuscriptId` xác định hồ sơ nội bộ của manuscript. Có fallback nhận diện hồ sơ legacy bằng snapshot liên quan.
- Chỉ Mentor đã accepted, còn quyền hợp lệ và đáp ứng policy xác minh hiện có được nhận bản gửi. Không tự cấp vai trò hay quyền lecturer.
- Trong transaction, khóa account/dự án, kiểm tra lại account, quyền, project và trạng thái archive/delete của nguồn.
- Mentor nhận grant đúng revision đã gửi, không có quyền đọc nội dung editor đang viết hoặc chỉnh sửa/xóa bản thảo qua luồng này.
- Cùng version/nội dung và Mentor trả lại request hiện có. Khi Mentor còn review v1, gửi v2 bị chặn và có lối mở hồ sơ đang chờ.
- Receipt lưu trong `ProjectActivity.idempotencyKey`, ràng buộc actor, project và fingerprint payload. Gửi đồng thời/retry không sinh thêm revision, request hoặc task tương ứng.
- Khi có yêu cầu sửa, phải trả lời đúng các revision item đang mở và nội dung mới phải khác. Dùng lại `reviewRequestService.resubmit`, giữ cùng request, lịch sử vòng và feedback.
- v2 được stage trước khi resubmit; Mentor vẫn chỉ thấy v1 đến khi resubmit thành công. Retry sau lỗi tạm thời tiếp tục đúng v2 đã stage.
- Cleanup chỉ xóa PDF không được revision nào tham chiếu. Nếu không xác định được kết quả commit vì DB mất kết nối, giữ file riêng tư để tránh xóa mất tài liệu đã lưu.

## API và file chính

API trong router submissions hiện có:

- `GET /api/v1/submissions/mentor-feedback/context?projectId=...&manuscriptId=...` hoặc `submissionId=...`.
- `POST /api/v1/submissions/mentor-feedback` dạng multipart, có auth, permission, rate limit và schema strict.
- Compilation API hiện có hỗ trợ thêm filter compilation ID, tương thích caller cũ.

| Nhóm | File |
| --- | --- |
| Shared contract | `packages/shared-types/src/mentor-manuscript.ts`, `index.ts`, `research-review.ts` |
| Service, validation | `apps/backend/src/modules/submissions/mentor-manuscript.service.ts`, `mentor-pdf-validation.ts`, `dto/mentor-manuscript.schema.ts` |
| Tích hợp backend | `submission.routes.ts`, `submission.service.ts`, `modules/workspaces/manuscript.service.ts`, `manuscript.routes.ts`, `dto/manuscript.schema.ts` |
| Schema | `apps/backend/prisma/review.prisma`, migration `20261118130000_mentor_manuscript_thread` |
| Dialog | `apps/web/src/features/submissions/components/mentor-manuscript-dialog.tsx`, `mentor-manuscript.css` |
| Điểm mở | `features/manuscripts/manuscript-editor.tsx`, `pages/submissions/submission-new.tsx`, `submission-detail.tsx`, `submission-list.tsx`, `features/projects/components/project-submissions-panel.tsx` |
| API, preview, i18n | `features/submissions/api/submissions.api.ts`, `features/manuscripts/manuscripts.api.ts`, `features/academic-profile/components/private-evidence-pdf-preview.tsx`, `i18n/locales/manuscripts.ts` |
| Test | `apps/backend/src/modules/submissions/__tests__/mentor-manuscript.test.ts`, `mentor-manuscript.persistence.test.ts`, `apps/backend/scripts/test-mentor-workspace.mjs`, `apps/web/src/features/submissions/__tests__/mentor-manuscript-dialog.test.tsx`, `features/projects/__tests__/project-submissions.test.tsx` |
| Dependency | Backend `package.json`, `pnpm-lock.yaml`: thêm `pdf-lib@1.17.1` |

## Kiểm thử thực tế

| Lượt chạy | Kết quả |
| --- | --- |
| Backend unit `mentor-manuscript.test.ts` | 2 passed |
| `node scripts/test-mentor-workspace.mjs --manuscript-send` | 21 passed, 1 optional browser scenario skipped |
| Web submissions + manuscripts + project-submissions + private PDF preview | 264 passed, 34 files |
| PostgreSQL runtime audit trong backend build | 4 passed |
| Build shared-types, backend, web; backend typecheck | Đạt |
| ESLint trên các file liên quan | Không có error; API submissions có 1 warning unused type import |

Test DB chạy trong database mới có tên ngẫu nhiên, áp dụng migrations vào DB test và dọn đúng DB test đó. Suite gọi compilation thật trên compiler local; queue test không đẩy job ID giả vào worker của ứng dụng. Có kiểm thử authenticated HTTP multipart/context và quyền bằng token thật trong app test.

Các case gồm snapshot/compilation sai, Mentor pending/revoked, outsider/cross-project, account bị vô hiệu hóa giữa chừng, nguồn bị archive, gửi đồng thời, v1 bất biến, feedback, v2 cùng hồ sơ, lỗi resubmit rồi retry, PDF giả và upload lặp. Suite workflow hiện có kiểm tra queue nhiều dự án, task/notification và scoped access.

Browser QA desktop và mobile 390×844 sử dụng component dialog và trình render PDF thật, với metadata/API fixture local. Đã thấy PDF biên dịch, form gọn, không tràn ngang và footer hiển thị. Đây không phải phiên đăng nhập hai người dùng thật trên browser; scenario đó vẫn là tùy chọn bị skip. Harness không gửi bản thảo vào dữ liệu dự án thật.

## Migration và local

Migration mới chỉ thêm nullable unique `submissions.source_manuscript_id`, FK `ON DELETE RESTRICT` và index snapshot trên revisions. Đã áp dụng riêng migration này lên local, giữ nguyên 15 submission có sẵn và các bản ghi migration trước đó.

Lịch sử migration local lệch từ trước vẫn chưa được sửa; không reset database hoặc chạy blanket deploy migrations vào DB ứng dụng. Không sửa secrets, không commit/push hoặc deploy production.

Local dùng web/backend native và Docker cho PostgreSQL, Redis, compiler. Cần compiler và worker `manuscript-compile` hoạt động để gửi từ LaTeX; nếu compiler không sẵn sàng, form báo lỗi và giữ nguyên bản thảo. Có thể chọn nguồn PDF ngoài.
