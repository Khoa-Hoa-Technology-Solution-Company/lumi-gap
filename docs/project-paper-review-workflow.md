# Project Papers: review và quyết định cuối

Ngày: 2026-10-29. Bổ sung trên screening V2, thay thế quy tắc tự động chốt trong `project-collaborative-screening-v2.md`.

## Vấn đề đã xác minh

- V2 cũ yêu cầu ít nhất hai reviewer và luôn bật blind.
- Khi đủ phiếu đạt đồng thuận, hệ thống tự ghi Final Decision, không có bước người chịu trách nhiệm xác nhận.
- Chỉ owner được xử lý bất đồng, chưa giao được người chốt.
- API legacy còn cho owner ghi trực tiếp trạng thái trước khi bắt đầu V2.
- Danh sách chưa có người đề xuất, lý do, bộ lọc theo người hoặc tiến độ bài đã review tách với bài đã chốt.

## Workflow và quyền

1. Thành viên đang hoạt động thêm/import bài bằng luồng hiện tại. Lưu người, thời gian, lý do đề xuất tùy chọn. Chuẩn hóa DOI khi đối chiếu trong dự án; cùng định danh không tạo thêm liên kết. Không suy diễn trùng chỉ từ tiêu đề.
2. Owner cấu hình quy tắc cho vòng mới và mở vòng, chọn giai đoạn tiêu đề/tóm tắt hoặc toàn văn. Mỗi vòng lưu snapshot quy tắc.
3. Owner phân công reviewer:
   - **SIMPLE:** đúng một người, phù hợp nhóm hai thành viên.
   - **INDEPENDENT:** ít nhất hai người; có thể cấu hình blind. Người chưa được phân công không gửi được phiếu.
4. Mỗi reviewer gửi và khóa phiếu INCLUDE/EXCLUDE/UNSURE. EXCLUDE cần lý do. Không sửa phiếu người khác.
5. Chờ **tất cả** reviewer được phân công, bao gồm người phân công thêm. Khi blind, API chi tiết/danh sách/lịch sử không trả nội dung phiếu người khác trước lúc hoàn tất. Owner cũng không được công bố sớm để bỏ qua protocol.
6. Các phiếu cùng INCLUDE hoặc cùng EXCLUDE → **AWAITING_FINALIZATION**. Có lựa chọn khác nhau hoặc UNSURE → **NEEDS_RESOLUTION**. Không tự ghi quyết định cuối.
7. Khi bất đồng, dùng thảo luận, tiêu chí và minh chứng:
   - **CONSENSUS:** owner mở lại phiếu cần xem xét; reviewer tự gửi revision mới đến khi nhất trí. Phiếu ban đầu vẫn còn. Không suy diễn đồng ý từ bình luận của người khác.
   - **ADJUDICATION:** người được giao chốt phân xử sau khi hoàn thành phiếu và ghi lý do.
   - Có UNSURE thì chưa được chốt ở cả hai chính sách; cần bổ sung thông tin và reviewer cập nhật phiếu.
8. Owner mặc định chịu trách nhiệm chốt; có thể giao một thành viên đang hoạt động bằng thao tác riêng có lý do, xác nhận, version và audit. Khi giao, quyền chốt thuộc người được giao, owner muốn chốt cần nhận lại phân công.
9. Người được giao chốt nhập kết luận, lý do và xác nhận. Quyết định trái phiếu nhất trí bị từ chối; cần mở lại để xem xét. Mỗi lần ghi lưu actor/time/roundVersion/review IDs.
10. Owner có thể mở lại phiếu đã gửi với lý do. Trạng thái hiện hành mất hiệu lực chốt, phiếu mới có revision mới; quyết định cũ và lịch sử còn nguyên. Vòng từng công bố không được làm mù lại hoặc dùng tính độ đồng ý độc lập sau sửa.

Mọi quyền được kiểm tra trong transaction sau khi khóa account/project. Version chống ghi từ màn hình cũ; project lock tuần tự hóa các yêu cầu finalize; clientKey hỗ trợ retry cùng nội dung. Chỉ kết quả mới nhất của vòng có trạng thái INCLUDED/EXCLUDED là có hiệu lực; vòng mới thay vòng hiện hành và giữ lịch sử vòng cũ.

Không dùng profile score để chọn người hay kết luận chất lượng khoa học. Included chỉ có nghĩa là phù hợp phạm vi nghiên cứu của dự án.

## API và dữ liệu

Base: `/api/v1/projects/:id/research/screening-v2`.

| API | Thay đổi |
| --- | --- |
| `PUT /config` | `reviewMode`, `blindReview`, `resolutionPolicy`; kiểm tra số reviewer theo mode; áp dụng vòng sau |
| `GET /papers` | Bộ lọc `status`, `proposerId`, `reviewerId` kết hợp search/filter cũ; trường `filters`, `progress` toàn dự án, proposer/reason/finalizer |
| `POST /rounds/:roundId/finalizer` | Owner giao thành viên chốt; required expectedVersion/reason/confirmed/clientKey |
| `POST /rounds/:roundId/finalize` | Người được giao ghi kết luận; không bỏ qua review/consensus/UNSURE |
| `POST /rounds/:roundId/resolve` | Alias tương thích của finalize, cùng kiểm tra quyền và quy tắc |
| `PUT /papers/:paperId/proposal` | Người đề xuất cập nhật lý do; expectedUpdatedAt và clientKey; lưu audit; trả `id`, `updatedAt` của bản đã lưu, kể cả khi retry cùng yêu cầu |
| `POST /rounds/:roundId/unblind` | Giữ route tương thích, không cho owner vượt protocol blind chưa hoàn tất |
| `GET /analytics` | `reviewedPapers`, `finalizedPapers`; không trộn Simple hoặc review không blind vào agreement/Kappa độc lập |
| `POST /projects/:id/papers` | Thêm optional `proposalReason`; chống trùng DOI đã chuẩn hóa |

Các API ghi Final Decision cũ qua `updateProjectPaper` hoặc legacy screening resolve trả lỗi, không tạo phiếu hoặc người review giả để tương thích. Ghi chú và reading status tiếp tục dùng API hiện tại.

Migration additive: `apps/backend/prisma/migrations/20261029090000_screening_explicit_finalization/migration.sql`.

- Settings: thêm mode/blind/resolution; cho phép một reviewer ở Simple, giữ dữ liệu cấu hình cũ.
- Rounds: thêm finalizer ID có FK và trạng thái AWAITING_FINALIZATION.
- ProjectPaper: thêm proposal reason, mặc định chuỗi rỗng, không gán lý do giả cho dữ liệu cũ.
- Không đổi/xóa phiếu, final, audit hay snapshot cũ. NULL finalizer ở vòng lịch sử được hiểu là owner. Snapshot cũ thiếu trường mới có default tương thích khi đọc, không viết lại JSON lịch sử.
- `consensusPolicy` giữ để đọc dữ liệu V2 cũ; không còn dùng đa số để tự chốt. Workflow mới nhận diện mọi bất đồng và áp dụng resolutionPolicy đã lưu.
- Project-level screeningBlinded giữ true để bảo vệ phiếu legacy chưa có snapshot. Blind của các vòng V2 lấy từ snapshot từng vòng; cấu hình tương lai không công bố phiếu cũ.

## UI

- Giữ tab, sidebar và token giao diện hiện có; tên workspace là “Đánh giá bài báo”.
- Thêm lý do tùy chọn trong picker, bổ sung lý do riêng trong detail; chỉ tác giả đề xuất chỉnh sửa được.
- Hai progress riêng: bài **đã có ít nhất một phiếu hiện hành**, bài **đã có kết quả cuối**. Bộ đếm toàn dự án không thay đổi theo trang/bộ lọc. Kết quả legacy chưa mở vòng có trạng thái hiện tại Chưa xem xét, hiển thị nhãn lịch sử riêng và không tính là đã review hoặc đã chốt. Thống kê cũng tách legacy khỏi quyết định hiện hành.
- Hiển thị người đề xuất, ngày, người chốt, tiến độ phiếu. Filter bao gồm người từng tham gia dù đã rời nhóm.
- Thu gọn quản lý vòng khi chưa chọn bài; tự mở khi chọn bài. Final Decision dùng lựa chọn có lý do/xác nhận, không dùng dropdown thay trạng thái trực tiếp.
- Thông tin bài, đề xuất, tiêu chí, phiếu được phép xem, thảo luận, kết quả, revision và audit trong detail hiện tại. Bản nháp vẫn được giữ khi request lỗi hoặc version/quyền thay đổi.

## Kiểm chứng đã thực thi

- Database riêng `lumigap_screening_workflow_v3_test`, localhost PostgreSQL. `prisma migrate deploy`: toàn bộ **101 migrations** đã áp dụng thành công, lần sau không còn migration chờ.
- `node apps/backend/scripts/test-screening-workflow.mjs --regression`: **76/76** test, gồm 22 persistence screening, 16 calculator/DTO, 26 workspace và 12 collaborative research.
- Bao phủ nhóm hai người, delegated finalizer/403, finalize đồng thời, retry, reopen/new version, conflict/consensus/UNSURE, blind trên list/detail/history/analytics, quyền gửi phiếu, cùng paper giữa hai project, DOI, migration legacy không tạo review giả, archive, membership removal, progress và filter.
- Web: screening workspace **19**, literature flow **29**, research workflow **21** test, tổng **69/69**.
- Build shared-types, backend và web; typecheck backend/web; ESLint các file liên quan đã chạy thành công. Backend build gồm PostgreSQL runtime audit **4/4**. Web build còn cảnh báo bundle lớn sẵn có, không gây thất bại build.
- `node apps/web/scripts/screening-workflow-browser.mjs`: component thật trên trình duyệt với API fixture; desktop/mobile, finalize rõ ràng, progress cập nhật, không tràn ngang và không page error. Ảnh tại `docs/audits/2026-10-29-paper-review/`.

### Kiểm tra bổ sung sau triển khai mã

- Tái hiện bốn lỗi bằng test thất bại trước khi sửa: mất bản nháp quyết định khi đổi người chốt; ẩn bản nháp lý do đề xuất khi mất quyền; báo xung đột nhầm sau lưu lý do thành công; mất bản nháp reviewer được cấp quyền sau khi mở màn hình rồi bị thu hồi quyền.
- Giữ form và nội dung để sao chép khi quyền thay đổi, chặn gửi khi không còn quyền. Ghi nhận cả quyền được cấp sau lần mở đầu tiên.
- Dùng `updatedAt` của response lưu đề xuất làm phiên bản cơ sở; cache còn cũ không tạo xung đột giả. Timestamp mới hơn từ thay đổi khác vẫn yêu cầu kiểm tra trước khi ghi.
- Integration test xác minh timestamp đã lưu, từ chối sửa từ phiên bản cũ và retry trả nguyên kết quả, không tạo audit trùng. Test đồng thời giao lại người chốt và chốt kết quả xác minh chỉ một thao tác thắng; cuối cùng chỉ có một quyết định được tạo.
- Chạy lại backend/web build, backend `tsc --noEmit`, ESLint các file vừa sửa và browser smoke sau các thay đổi trên: đều thành công. Browser smoke dùng API fixture; persistence dùng database test riêng.

## Triển khai và giới hạn

- Lượt xác minh tiếp theo đã sao lưu, deploy migration lên database ứng dụng (101 migrations), rebuild/cập nhật container và kiểm tra browser localhost:8080 bằng tài khoản chủ dự án. Ba bài/nhãn/metadata gốc được giữ nguyên, hiển thị 0/3 có phiếu và 0/3 có quyết định cuối; không suy diễn 3 nhãn INCLUDED cũ thành kết quả quy trình mới. Xem bằng chứng và nguyên nhân runtime cũ tại `docs/audits/2026-10-29-paper-review-live/verification.md`.
- Đã chạy full app trên PostgreSQL test thật qua browser với hai tài khoản: Simple, independent blind, bất đồng, thảo luận, delegated finalizer, adjudication và tải lại kết quả. Dữ liệu test gồm 3 phiếu, 2 quyết định và 1 thảo luận; không ghi các thao tác kiểm thử vào dự án thật.
- Giao finalizer cho owner hoặc thành viên dự án đang hoạt động. Mentor/Advisor ngoài nhóm không tự nhận quyền chốt từ quyền xem tài nguyên; chưa mở rộng mentor module để cấp quyền này.
- Không tự đánh giá năng lực chuyên môn người chốt hoặc độ đúng khoa học từ số phiếu. Quyền phân công thuộc owner; tiêu chí và lý do cần nhóm xem xét.
- Không commit/push trong tác vụ này.
