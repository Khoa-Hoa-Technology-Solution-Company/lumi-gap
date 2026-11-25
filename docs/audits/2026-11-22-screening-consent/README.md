# Audit sàng lọc hai reviewer, bất đồng và đánh giá lại

Ngày kiểm tra: 22–23/11/2026 (Asia/Bangkok). Mã nguồn: `D:\lumi-gap`.

## Kết luận và phạm vi

Đã triển khai trên hệ thống Screening hiện có. Không thêm người phân xử thứ ba, tầng duyệt của Owner, chat riêng mới hoặc model invitation/approval song song. Hai reviewer vẫn chọn Phù hợp/Không phù hợp. Kết quả do con người quyết định; AI không được chốt thay.

Đã giữ và đối chiếu các thay đổi cùng phạm vi từ tác vụ chạy song song; người dùng đã xác nhận tạm dừng tác vụ kia. Không commit, push hoặc deploy. Có nhiều thay đổi khác trong working tree từ trước, không đưa chúng vào phạm vi kết luận của báo cáo này.

## 1. Lỗi cũ và đường kích hoạt

`screening-consensus.ts::settleConsensus` trước đây nhận vòng đang bất đồng, đọc hai phiếu hiện hành và kiểm tra thời hạn. Nếu vẫn khác nhau nhưng deadline đã qua, code chọn `EXCLUDED`, ghi `CONSENSUS_NOT_REACHED` và audit `CONSENSUS_EXPIRED`. Vì thế đồng hồ đã trở thành quyết định khoa học.

Hàm này được gọi cả khi đọc chi tiết/board/summary lẫn worker notification thông qua `maintainScreeningCases` và `maintainProjectConsensus`. `consensusView`, `canReassess` và frontend còn khóa sửa phiếu/chat sau hạn. Các lượt nhận đánh giá quá hạn bị ẩn hoặc mất suất. Một nhánh legacy cũng tự đóng thảo luận khi quá hạn tối đa.

Hậu quả: bài bị rời tập Included, có thể làm minh chứng đã duyệt phải rà soát, và kết quả hết hạn dễ bị đọc nhầm là loại theo tiêu chí. Lịch sử đã xuất không được phép sửa ngược để che vấn đề.

## 2. Quy trình sau sửa

1. Hai reviewer hợp lệ gửi phiếu độc lập. Trước khi đủ hai phiếu, không công bố phiếu/lý do của người kia, kể cả qua history/API.
2. Hai Include → Included. Hai Exclude → Excluded. Hai kết quả khác nhau → Cần thống nhất. Thiếu một phiếu → vẫn chờ.
3. Dùng lại thảo luận gắn đúng project, paper, round và stage. Mỗi người chỉ sửa phiếu của mình; mọi lần sửa là revision mới, phiếu ban đầu được giữ.
4. Khi hai phiếu hiện hành trùng nhau, chốt theo kết quả đó. Quy trình TWO_STAGE vẫn phải qua Full-text trước khi đủ điều kiện tổng hợp bằng chứng.
5. Một reviewer có thể đề nghị kết thúc bằng lý do thực chất. Backend lưu người đề nghị, người nhận, paper/stage/round và đúng ID của hai revision nền trong audit hiện có; chưa ghi final decision.
6. Chỉ reviewer còn lại được đồng ý hoặc tiếp tục thảo luận. Từ chối đóng đề nghị; thảo luận vẫn tiếp tục. Đồng ý ghi final `CLOSED_UNRESOLVED`, khác với loại theo tiêu chí.
7. Owner không được xác nhận thay reviewer. Mentor không có nhiệm vụ screening và người ngoài không được thao tác. Tất cả kiểm tra quyền nằm ở backend.

Đề nghị được kiểm tra theo chính xác hai revision, không theo một số phiên bản tổng quát có thể tăng chỉ do chat. Phiếu đổi, phân công thay đổi, vòng chốt hoặc có đề nghị mới thì đề nghị cũ không thể được chấp thuận. Khóa project, transaction và clientKey hiện có bảo vệ thao tác đồng thời/retry; notification dùng eventKey để tránh trùng.

## 3. Deadline

Deadline là metadata tiến độ. Quá hạn không tạo Excluded/Closed Unresolved, không khóa chat, không ngăn gửi/cập nhật phiếu hợp lệ và không tự cấp suất cho reviewer thứ ba. Giữ nguyên ngày hạn để hiển thị Quá hạn, hỗ trợ gia hạn/trả lượt hoặc quản lý phân công hiện có. Worker chỉ duy trì nhắc việc và đồng bộ nghĩa vụ.

Nhánh tự đóng legacy cũng đã được bỏ. Các kết quả lịch sử do logic cũ tạo ra được giữ nguyên và hiển thị với ngữ cảnh lịch sử, không mô tả sai thành xác nhận của cả hai reviewer.

## 4. Đánh giá lại và lịch sử

Reviewer đang được phân công hoặc Owner có thể mở đánh giá lại kết quả đã chốt theo quyền backend. Dialog lấy thông tin bài/vòng sẵn có, bắt buộc lý do ngắn; tùy chọn phân loại lý do và giai đoạn nằm trong phần mở rộng.

Tạo round mới trên cùng Paper, giữ round cũ, ghi người mở/lý do/phiên bản tiêu chí và ưu tiên giữ cặp reviewer còn hợp lệ. Người đã rời nhóm không được tự cấp quyền trở lại; suất thiếu được xử lý bằng queue và chức năng phân công hiện có. Không ai được sửa hoặc gửi thay phiếu của người khác.

Có thể đánh giá lại đúng Full-text, hoặc mở lại từ Title/Abstract khi có lịch sử giai đoạn đó. Quan hệ phụ thuộc cũ được ghi audit, không xóa phiếu. Không cho hai vòng active cạnh tranh.

`publishedScreeningRounds` phân biệt vòng đang làm với kết quả đã công bố. Trong lúc đánh giá lại, giữ quyết định trước cho Library Included, eligibility và báo cáo. Với TWO_STAGE, giữ mốc kết quả cũ qua cả hai giai đoạn cho tới kết luận cuối của lần đánh giá lại. Khi hoàn tất, chuyển tập hiện hành sang kết quả mới.

History hiển thị số vòng, giai đoạn, người đánh giá, lý do mở lại, kết quả và các revision; không trộn phiếu đang blind với phiếu đã công bố.

## 5. Evidence, citation và báo cáo

- Không xóa extraction, quotation, lịch sử minh chứng hoặc LaTeX/BibTeX khi bài không còn Included.
- Khi kết quả cuối đổi từ Included sang Excluded/Closed Unresolved, minh chứng đã Accepted được chuyển về Pending với lý do rà soát và revision mới.
- Bộ lọc Included và Evidence Matrix dùng kết quả công bố có hiệu lực; dữ liệu cũ vẫn truy xuất qua ALL/history.
- Analysis Set được lưu bằng snapshot bất biến của nguồn, quyết định và revision minh chứng. Việc kiểm tra version dùng mốc của final decision, để thay đổi metadata tiến độ của round cũ không vô hiệu hóa kết quả đã công bố. Truy xuất snapshot cũ không viết lại nội dung theo vòng mới.
- Thống kê tách loại theo tiêu chí và không đạt đồng thuận; số liệu quyết định hiện hành được nhóm theo stage và đếm mỗi Paper một lần, không cộng các vòng lặp thành nhiều bài.
- Có tổng hợp phục vụ PRISMA với lý do loại theo Title/Abstract và Full-text, cảnh báo số bài đang đánh giá lại. Đây không phải một trình tạo đầy đủ sơ đồ PRISMA hoặc cơ chế gộp nhiều report thành một study.
- Agreement/Kappa dùng hai phiếu độc lập ban đầu, không dùng phiếu đã sửa sau công bố để làm đẹp mức đồng thuận.

## 6. Database và dữ liệu local

Migration mới duy nhất: `20261122120000_screening_mutual_closure`. Mở rộng `screening_final_decisions.decision` từ varchar(16) thành varchar(24) và thêm `CLOSED_UNRESOLVED` vào constraint hiện có. Không đổi/xóa dòng cũ; không tạo bảng proposal mới. Proposal và từng xác nhận dùng audit append-only hiện có.

Đã chạy toàn bộ 168 migration trên các database PostgreSQL sạch do test runner tạo với tên ngẫu nhiên `lumigap_screening_<12hex>_test`. Runner chỉ dọn database do chính lượt chạy tạo, có guard tên và host local.

Trên database local hiện có, chỉ áp dụng riêng migration bổ sung trên bằng Prisma deploy có danh sách một migration. Không chạy toàn bộ các migration đang pending, không sửa checksum/resolve/reset lịch sử.

Audit chỉ đọc nằm tại `local-read-only-audit-before.json` và `local-read-only-audit.json`:

- Có 7 final `EXCLUDED` với `CONSENSUS_NOT_REACHED`, đồng thời có 7 audit `CONSENSUS_EXPIRED`. Chưa tự sửa các kết quả này. Chủ dự án cần rà từng hồ sơ và dùng Đánh giá lại nếu phù hợp.
- Sau migration riêng: 162 migration đã ghi nhận; 6 migration khác còn pending.
- 8 checksum lịch sử khác nội dung hiện có; thêm 50 checksum khác chỉ vì LF/CRLF. Hai nhóm được tách rõ trong JSON. Chưa tự sửa nhóm nào.
- Không phát hiện nhiều round active cho cùng project/paper ở thời điểm audit.
- Số Paper quan sát ở hai thời điểm là 1.357 và 1.370. Có các tác vụ khác và hoạt động local giữa hai lượt; không dùng số đếm này để khẳng định toàn database bất biến. Migration của nhiệm vụ này chỉ có ALTER TABLE, không INSERT/DELETE Paper.

## 7. API và tệp thuộc phạm vi

Tái sử dụng các endpoint dưới `/api/v1/projects/:id/research/screening-v2`:

| Endpoint | Chức năng |
| --- | --- |
| `POST /rounds/:roundId/agreement` | Đề nghị `CLOSED_UNRESOLVED`, kèm lý do và reviewIds của hai revision đã xem |
| `POST /rounds/:roundId/agreement/confirm` | Reviewer còn lại chấp thuận đúng proposalId |
| `POST /rounds/:roundId/agreement/decline` | Reviewer còn lại yêu cầu tiếp tục thảo luận |
| `POST /rounds/:roundId/reopen-unresolved` | Mở round đánh giá lại cho kết quả đã chốt, có lý do và kiểm tra quyền |
| `POST /rounds/:roundId/reassess` | Tạo revision phiếu sau thảo luận |
| GET detail, rounds, history, board, workspace-summary, analytics | Cùng phản ánh trạng thái, lịch sử và kết quả công bố |

Các nhóm tệp chính:

- Schema/migration: `apps/backend/prisma/project-screening.prisma`, migration mới nêu trên; `packages/shared-types/src/project-screening.ts`.
- Core: `screening-consensus.ts`, `screening-agreement-context.ts`, `screening-context.ts`, `screening.service.ts`, `screening-effective.ts`, `screening-reopen.ts`, `screening.calculator.ts`, `dto/screening.schema.ts`.
- Queue/quyền/tiến độ: `screening-assignments.ts`, `screening-slots.ts`, `screening-obligations.ts`, `screening-case-maintenance.ts`, `screening-work-papers.ts`, `screening-accepted.ts`.
- Nghiên cứu: `evidence-eligibility.ts`, `project-analysis-set.service.ts`.
- UI: `screening-consensus-discussion.tsx`, `screening-round.tsx`, `screening-round-history.tsx`, `screening-common.tsx`, `screening-paper-card.tsx`, `screening-analytics.tsx`, `my-work-model.ts`, `my-work-view.tsx`, `screening-queue-view.tsx`, API client và locale screening queue; CSS screening cho phần đã ghép.
- Tests: consensus/queue/rescreening persistence, `screening-consent.browser.ts`, các test frontend conflict/workspace/rescreening/my-work/status.
- Công cụ: `test-screening-consensus.mjs`, `audit-screening-consent.mjs`.

Các file backend không ghi đầy đủ đường dẫn ở trên đều nằm trong `apps/backend/src/modules/projects/`; file UI nằm trong `apps/web/src/features/projects/`.

## 8. Kiểm thử thực sự đã chạy

| Lệnh/nhóm | Kết quả |
| --- | --- |
| `node apps/backend/scripts/test-screening-consensus.mjs` | 106 PASS; 1 browser test được skip có chủ đích khi không dùng `--browser` |
| Vitest web: conflict-resolution, workspace, rescreening, my-work-model, task-first, status | 135 PASS |
| TypeScript shared-types | PASS |
| Typecheck backend/web toàn app, chạy lại sau thay đổi cuối | FAIL do các lỗi ngoài screening liệt kê dưới đây; không có diagnostic ở file screening/my-work/analysis-set của nhiệm vụ |
| ESLint các tệp screening/backend thuộc phạm vi | PASS, 0 error sau dọn import thừa |
| ESLint các component/model screening frontend thuộc phạm vi | PASS, 0 error/warning |
| Backend build | Runtime PostgreSQL audit và Prisma generate PASS; TypeScript build bị chặn bởi lỗi manuscript đã có |
| Web build | Bị chặn bởi lỗi TypeScript ngoài screening ở manuscript/mentor discovery/trends/docs |
| Browser toàn ứng dụng | PASS: signed-session/API/PostgreSQL; 6 kiểm tra quyền qua HTTP, desktop/tablet/mobile, light/dark, xử lý lỗi 503 giữ bản nháp; 0 lỗi JavaScript và 0 lỗi server bất ngờ |

Regression có kiểm tra: blind screening, đủ/thiếu hai phiếu, thảo luận, cập nhật sau hạn, proposal/accept/reject, stale proposal sau đổi revision, tự xác nhận, người ngoài/cross-project, double submit, concurrent actions, re-screen A–E, hai giai đoạn, reviewer rời nhóm, protocol đóng băng, queue/notification, giữ evidence/citation và report snapshot.

Các lượt đầu đã phát hiện lỗi ghép trùng biến/import, fixture minh chứng chưa hợp lệ, kỳ vọng test hết hạn cũ và timeout khi chạy cùng các build nặng. Các lỗi này được sửa/đối chiếu trước lượt 106 PASS. Browser còn phát hiện việc chat tăng version làm đề nghị bị từ chối; đã sửa bằng ràng buộc exact reviewIds. Không lấy các lượt thất bại ban đầu để báo PASS.

## 9. Căn cứ phương pháp và chính sách LumiGap

[Cochrane Handbook, mục 4.6.4](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04) mô tả đánh giá độc lập, thảo luận khi khác ý kiến, khả năng cần người khác phân xử hoặc chờ thêm thông tin. LumiGap không triển khai bắt buộc người thứ ba trong luồng này.

[PRISMA 2020 expanded checklist, mục 8](https://www.prisma-statement.org/s/PRISMA_2020_expanded_checklist-w7ra.pdf) yêu cầu báo cáo số reviewer, tính độc lập và cách giải quyết bất đồng. Không có cơ sở từ mục này để coi hết hạn là lý do tự động loại hoặc coi Closed Without Consensus là loại theo tiêu chí bắt buộc.

[Rayyan, resolving screening conflicts](https://help.rayyan.ai/hc/en-us/articles/25316026225041-How-to-Resolve-Screening-Conflicts-in-Rayyan) mô tả cơ chế Consensus bằng thảo luận và cập nhật quyết định. [Covidence, resolving screening conflicts](https://support.covidence.org/help/resolving-conflicts-at-screening-stage) có luồng giải quyết khác nhau theo screening và full-text, kể cả bất đồng lý do loại.

Chính sách **hai reviewer cùng xác nhận kết thúc và bài không vào tập Included** là lựa chọn của nhóm LumiGap. Không quảng bá đây là chuẩn bắt buộc của PRISMA/Cochrane. Với tiêu đề/tóm tắt, nhóm cần cân nhắc nguy cơ bỏ sót nguồn có khả năng phù hợp và ghi chính sách này trong protocol/báo cáo.

## 10. Vấn đề còn lại và điều kiện chuyển bước

- P0 core cũ: hết hạn tự tạo kết quả, xác nhận sai người/stale và mất selection trong lúc re-screen đã được xử lý bằng logic và regression nói trên.
- P1 dữ liệu lịch sử: 7 quyết định tự loại cần rà soát có chủ đích. Chưa sửa dữ liệu khoa học thay người dùng.
- P1 build toàn repo: lỗi `ManuscriptReference.evidenceStatus` làm intersection thành `never`; `AvailableMentor.institution`; một số kiểu/nguồn ở trends/docs. Không tự sửa các thay đổi ngoài scope để che lỗi build.
- P1 migration history local: 8 nội dung lệch và các migration pending cần audit riêng trước khi đưa môi trường này lên nhánh/release mới. Database sạch đã được kiểm thử; không suy ra database local có lịch sử hoàn toàn đồng nhất.
- P2 giới hạn: chưa chứng minh mọi biến thể trình duyệt/WebKit hoặc mọi kích thước thiết bị; sơ đồ PRISMA hoàn chỉnh/report-to-study deduplication không nằm trong chức năng vừa thêm.

Chưa đủ điều kiện tuyên bố toàn repo sẵn sàng release vì build còn lỗi. Có thể review phần screening độc lập sau khi đọc bằng chứng và các giới hạn; không tự commit/push.

## Bằng chứng và trạng thái local cuối

- Full backend: [log 106 PASS](../../../.cache/screening-20261123-backend-green.log).
- Frontend: [log 135 PASS](../../../.cache/screening-20261123-web-verified.log).
- Regression bổ sung sau khi cố định version của final decision: [log snapshot PASS](../../../.cache/screening-20261123-snapshot-final.log).
- API 4000 `/ready`, Web 8080 và notification worker đã được khởi động lại từ mã hiện tại bằng local-light. Một Vite chạy riêng trên IPv6 chiếm cổng 8080 trước đó đã được xác định đúng đường dẫn dự án và thay bằng tiến trình do launcher quản lý. Không xóa volume/data.
- [Luồng browser và kiểm tra quyền](browser-results.json), [migration local bổ sung](../../../.cache/screening-20261123-local-migration.log).

### Ảnh UI thực tế

- [Thảo luận desktop](conflict-desktop.png), [tablet](conflict-tablet.png), [mobile](conflict-mobile.png), [mobile dark](conflict-mobile-dark.png).
- [Dialog đề nghị kết thúc trên mobile](closure-dialog-mobile.png), [người nhận chờ xác nhận](recipient-pending-confirmation.png).
- [Kết quả đóng không đồng thuận](closed-without-consensus-desktop.png), [mobile](closed-without-consensus-mobile.png), [chờ xác nhận mobile dark](pending-confirmation-mobile-dark.png).
- [Vòng đánh giá lại và kết quả trước vẫn có hiệu lực](rescreening-desktop.png), [mobile](rescreening-mobile.png), [dialog đánh giá lại mobile](rescreen-dialog-mobile.png).

Các screenshot dùng tài khoản và Paper của database kiểm thử cách ly. Các file `failure-*` là bằng chứng các lượt QA thất bại trước khi sửa hoặc điều chỉnh selector; không phải trạng thái nghiệm thu cuối. Mỗi lượt browser có cleanup, không tạo dữ liệu giả trong dự án thật.
