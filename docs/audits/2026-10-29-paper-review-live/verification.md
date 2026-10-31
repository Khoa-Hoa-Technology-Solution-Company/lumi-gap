# Project Papers: kiểm tra bản chạy local

Ngày: 2026-10-29. Target: `http://localhost:8080/projects/6ab33f1537802fe30d38753b?tab=papers`.

## Nguyên nhân đã xác minh

- URL render `ProjectDetailPage` → `ResearchLiterature` → `ScreeningWorkspace` trong source hiện tại. Không có feature flag; `view` mặc định là `screening`. Quyền owner chỉ điều khiển cấu hình/phân công, không ẩn cả workspace.
- Container web đang phục vụ trước khi cập nhật được tạo ngày 27/10, image `21b15c5a3f62…`; container backend được tạo ngày 24/10, image `1560fac65a6f…`. Không mount source/dist vào hai container này. Build trên host không thay bundle nginx hay backend trong container.
- Kiểm tra filesystem backend đang chạy: không có `dist/modules/projects/screening.service.js`, `screening.routes.js`, hoặc migration `20261029090000_screening_explicit_finalization`.
- Database ứng dụng local `lumigap_db` chỉ có 92 migrations đã hoàn tất, không có bảng `screening_*`. Bản code trước chỉ được kiểm tra trên database test riêng; chưa cập nhật instance ứng dụng.
- Browser sau khi chủ dự án đăng nhập hiển thị dropdown sửa trạng thái trên từng bài và “100% · Đã xem xét 3/3 bài”. Không có workspace mới trên bundle cũ.
- Ba link bài của dự án đều có `project_papers.screening_status=INCLUDED`. UI cũ đếm mọi trạng thái khác UNDECIDED là đã xem xét. Đây không phải bằng chứng có phiếu độc lập hoặc quyết định cuối theo protocol mới.
- Source mới trước lượt sửa này vẫn tính các nhãn legacy vào `progress.finalized` và `analytics.finalizedPapers`; phần thư viện cũng còn thanh tiến độ cũ. Đã sửa cả hai để việc cập nhật container không tiếp tục tạo hiểu nhầm.

## Luồng dữ liệu

`ScreeningWorkspace` → `screeningApi` → `/api/v1/projects/:id/research/screening-v2` → `screeningRouter`/controller → `screeningService` → `withWorkspace` transaction → Prisma/PostgreSQL.

- Board/detail lấy vòng, snapshot quy tắc, phân công, phiếu và kết quả cuối. Phiếu được lọc theo actor và protocol blind ngay trên backend.
- Ghi review/finalizer/finalize/reopen yêu cầu xác thực, kiểm tra quyền trong transaction, version và clientKey. API legacy không được ghi quyết định trực tiếp.
- UI mặc định hiển thị tiến độ bài có phiếu và bài có quyết định cuối riêng. Bài chỉ có nhãn cũ được hiển thị là chưa xem xét theo workflow, kèm phân loại lịch sử để đối chiếu.

## Bảo toàn dữ liệu và metadata

- Sao lưu `pg_dump -Fc` trước khi migrate, kiểm tra đọc được bằng `pg_restore -l`. File ngoài Git: `C:/Users/tdinh/AppData/Local/LumiGap/backups/lumigap-before-review-20261029.dump` (29,218,935 bytes khi tạo).
- Các migration screening bổ sung bảng/snapshot, không tạo phiếu hoặc final giả từ nhãn cũ. Không tự mở vòng hay đổi trạng thái của ba bài thật để kiểm thử.
- Nguồn `10.3892/ijmm`: Crossref API trả `type=journal`, OpenAlex `W4213385752` trả `type=paratext`, title bằng tên tạp chí. Abstract đang lưu nói về lành vết thương trên chuột. Không có căn cứ tự sửa thành một bài khác; thêm cảnh báo kiểm tra metadata và liên kết hồ sơ/DOI, giữ dữ liệu gốc.
- Nguồn đối chiếu: `https://api.crossref.org/works/10.3892%2Fijmm`, `https://api.openalex.org/works/W4213385752` (HTTP 200, đã đọc response thực tế).

## Các thay đổi trong lượt này

- `screening.service.ts`: không dùng trạng thái legacy để quyết định trạng thái/filter hoặc số đã chốt; thống kê riêng số bài legacy; trả journalName/paperKind.
- Shared `project-screening.ts`: bổ sung `progress.legacy`, `legacyPapers` và metadata của bài.
- `screening-workspace.tsx`, `screening-analytics.tsx`: tách phân loại lịch sử, tiến độ hiện tại và bộ lọc theo vòng thực tế.
- `project-literature-workspace.tsx`: bỏ thanh 100% tính từ phân loại thủ công; chỉ dẫn sang workspace đánh giá để xem tiến độ thật.
- `screening-common.tsx`, `screening-round.tsx`: cảnh báo metadata có dấu hiệu là tạp chí/tài liệu phụ trợ, mở hồ sơ bài và nguồn DOI.
- Tests persistence/frontend: kiểm tra nhãn legacy không được nâng thành quyết định cuối, bộ lọc hiện hành, giữ dữ liệu cũ, cảnh báo metadata và bỏ tiến độ cũ.
- `apps/backend/scripts/serve-screening-verification.mjs`: full application với PostgreSQL test riêng, hai tài khoản và hai vòng không có phiếu sẵn để kiểm tra Simple/Independent trên browser. Guard local DB, disabled email, không ghi database ứng dụng, không trả credential qua HTTP.

## Kiểm chứng

- Backend regression: **76/76** (22 screening persistence, 16 calculator/DTO, 26 workspace, 12 collaborative research). Frontend: **69/69** (19 screening workspace, 29 literature flow, 21 research workflow). Sau chỉnh UI cuối, chạy lại 19 screening tests: đạt, gồm kiểm tra không báo mất quyền sau khi delegated finalizer chốt thành công; bản nháp khi bị thu hồi quyền vẫn được giữ.
- Build shared-types/backend/web đạt; backend `tsc --noEmit` đạt; PostgreSQL runtime audit 4/4. ESLint các file liên quan và script verification đạt. Web build còn cảnh báo chunk lớn sẵn có.
- Backup đã tạo trước `db:migrate:deploy`. Database ứng dụng hiện có **101 migrations** hoàn tất. Ba ProjectPaper và metadata/ghi chú/trạng thái/người/thời gian đánh giá cũ đối chiếu manifest: **không đổi** (chuẩn hóa timestamp về UTC khi so sánh). Có 3 legacy snapshots, **0 review, 0 final** ở dự án thật.
- Đã build lại backend Docker và cập nhật backend/web/worker-ai-jobs/worker-manuscript-compile. Web runtime image đóng gói bundle production đã build trên host với cùng nginx config; tránh build Node đồng thời trong Docker VM giới hạn 3GB RAM. Web image cuối: `7187b6a8ba7f812bbb8ee7319d9084f5ff8ce7d565d3df37e04720c5da3db5c1`; backend image: `e86df5cff2fcc5478a3ed2eca314e4af706e0eac71850d85d9ae8a91805e2f5d`.
- Browser **localhost:8080 với tài khoản chủ dự án thật**: workspace Đánh giá bài báo xuất hiện, bộ lọc trạng thái và người, hai tiến độ riêng **0/3 và 0/3**, thông báo 3 phân loại lịch sử. Không còn dropdown ghi kết quả trực tiếp. Mở bài đáng ngờ hiển thị metadata, cảnh báo, hồ sơ và nguồn DOI; không mở vòng/ghi phiếu vào dự án thật.
- Browser full app tại `127.0.0.1:4180`, PostgreSQL test riêng, đăng nhập lần lượt hai tài khoản qua giao diện:
  1. Owner gửi INCLUDE; thành viên chưa gửi không thấy nội dung phiếu owner, kể cả trong audit.
  2. Thành viên gửi EXCLUDE có lý do → **Cần thống nhất**, cả hai phiếu gốc được công bố; thành viên chưa được giao không có form chốt. Gửi thảo luận và thấy lưu trong lịch sử.
  3. Vòng Simple: thành viên gửi INCLUDE → **Chờ chốt**, rồi thành viên được giao ghi quyết định có lý do/xác nhận → tiến độ cuối 1/2.
  4. Owner xử lý vòng bất đồng theo ADJUDICATION, nhập lý do, xác nhận → tiến độ cuối 2/2. Tải lại trang vẫn có kết quả, phiên bản, người/thời gian chốt và hai phiếu trái nhau nguyên vẹn.
  5. SQL đọc lại fixture: **3 reviews, 2 finals, 1 discussion**, mỗi final tham chiếu đúng 1 hoặc 2 review IDs, có resolver và roundVersion=5.
- Kiểm tra UI thật còn phát hiện form Simple dùng nhãn Independent, audit không hiện tên owner khi owner không phải reviewer, và cảnh báo mất quyền sau khi chốt thành công. Đã sửa tên chế độ, tra tên từ thành viên/người chốt và chỉ giữ form không còn quyền khi có bản nháp hoặc đang gửi.
- Console browser không có error ở target, không có error/warn ở dự án test trong lần kiểm tra. Server test đã dừng; các container tạm dừng để build đã được khởi động lại.
- Kiểm tra cuối sau khôi phục: backend/PostgreSQL/Redis/AI reviewer/compiler healthy, toàn bộ worker trong danh sách tạm dừng đều Up. SHA-256 `index.html` host và nginx container cùng `43ad54e3cc3a148ab3397941b288baaa4cd4ebdc72a395547bf147a814f428a6`; backend runtime có module screening mới. Scoped `git diff --check` đạt.

## Ảnh kiểm chứng

- `before.jpg`: giao diện cũ trước cập nhật.
- `after.jpg`: workspace mới và tiến độ 0/3 trên dự án thật.
- `test-blind.jpg`, `test-conflict.jpg`: ảnh trong quá trình kiểm thử; snapshot accessibility xác minh nội dung theo quyền.
- `test-finalized.jpg`: hai phiếu trái nhau được giữ cạnh quyết định cuối có lý do/người/phiên bản/thời gian trên database test thật.

## Giới hạn và thao tác tiếp theo của nhóm

- Ba nhãn Phù hợp lịch sử chưa có phiếu theo protocol mới. Chủ dự án chọn chế độ/tiêu chí, chọn bài, bắt đầu vòng và phân công trước khi thành viên gửi phiếu.
- Metadata `10.3892/ijmm` cần nhóm xác minh thủ công nguồn bài cụ thể; không tự đổi DOI, title hoặc abstract.
- Mentor ngoài nhóm chưa được giao chốt chỉ từ quyền xem tài nguyên. Không gọi AI trả phí trong kiểm thử này; tính năng AI không phải bước tự chốt.
- Chưa commit/push. Hướng dẫn workflow/API chi tiết: `docs/project-paper-review-workflow.md`.
