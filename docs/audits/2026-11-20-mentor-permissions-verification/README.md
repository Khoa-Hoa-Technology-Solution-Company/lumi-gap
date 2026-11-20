# Audit xác minh quyền Mentor và chia sẻ nghiên cứu

Ngày thực hiện: 20/11/2026. Codebase: `D:\lumi-gap`.

Đã audit source, thực thi API của `createApp`, PostgreSQL thử nghiệm riêng và UI đầy đủ trong trình duyệt. Phát hiện và sửa hai vấn đề có bằng chứng: PDF review có thể trả link storage ký sẵn; Support vẫn mô tả màn hình quyền nâng cao đã bỏ. Không thêm hệ thống quyền hoặc review mới.

Kết luận: các luồng Mentor trong bảng dưới đã được kiểm thử thực tế. Toàn repository chưa đủ điều kiện coi là build sạch hoặc deploy vì lỗi TypeScript và migration/data blockers còn tồn tại. Không commit, push, deploy hoặc sửa dữ liệu người dùng thật trong lượt audit này.

## A. Kiến trúc, quyền và kết quả thực tế

### Ba nguồn truy cập được giữ riêng

- **Quan hệ cố vấn:** invitation phải được chấp nhận, quan hệ ACTIVE, tài khoản/lecturer hợp lệ, policy chưa thu hồi/hết hạn. Mặc định mới chỉ `OVERVIEW_VIEW`, `MENTOR_CHAT`.
- **Chia sẻ trực tiếp:** đúng share/project/mentor/tài nguyên; Paper mới có `VIEW` hoặc `COMMENT`. Mode không thay đổi Library membership, screening hay bản gốc.
- **Review assignment:** đúng Review Request, submission, revision và Mentor; không mở working draft hoặc revision chưa gửi. Direct share không thay thế assignment.

Các tầng chính: `academic-relationship-access.ts`, `workspace-access.ts`, `mentor-access.service.ts`, `mentor-review-access.ts`, `project-membership.ts`. UI không phải hàng rào bảo mật.

### Trả lời 7 câu hỏi audit

1. **Default an toàn:** Có. Test tạo invitation không kèm policy, Accept và kiểm tra database thực tế chỉ có hai quyền mặc định. Không tự tạo ProjectMember hoặc tự chọn PRIMARY; trách nhiệm là UNASSIGNED.
2. **16 checkbox đã bỏ:** Không xuất hiện trong dialog chia sẻ và luồng Support đã kiểm tra. Phát hiện còn nhãn/mô tả nâng cao sai ngữ cảnh, đã sửa. Không xóa API legacy.
3. **Legacy mở rộng âm thầm:** Không có migration tự nâng quyền. Resource reader vẫn cần share cụ thể. Policy legacy và preset giữ nguyên; Paper mode mới được kiểm tra riêng. Không coi preset là quyền quản trị.
4. **Xung đột nguồn quyền:** Các test xác minh cả hai chiều: revoke direct share không phá review; cancel review không phá direct Paper/PDF còn hiệu lực. End relationship vô hiệu quyền phụ thuộc quan hệ, giữ feedback/history.
5. **Backend bypass khi UI ẩn:** Bộ 100 HTTP checks qua router thật xác minh cả GET, POST, PUT, DELETE trái quyền. Chặn sửa Paper/screening/member, truy cập Library/Evidence/draft/file và reviewer khác.
6. **Cache/reuse sau revoke:** API tài nguyên/file từ chối request mới; inbox cập nhật; UI không còn composer khi downgrade. Đã sửa đường PDF review có thể phát link ký sẵn. Client polling vẫn có độ trễ vài giây; không thể thu hồi byte đã tải xuống trước đó.
7. **Nguồn dữ liệu:** Support và inbox dùng MentorAccess/ResourceShare; Work Queue là projection từ request/assignment/revision/task hiện có. Không tạo queue, permission model hoặc notification store thứ hai.

### Legacy đã rà soát

Giữ OBSERVER/ADVISOR/REVIEWER và 16 flags: OVERVIEW_VIEW; PAPERS_VIEW/COMMENT/SUGGEST; GAPS_VIEW/COMMENT/RECOMMEND; TASKS_VIEW/SUGGEST; MANUSCRIPTS_VIEW/COMMENT/SUGGEST/REVIEW; MENTOR_CHAT; SUBMISSIONS_VIEW; CONTRIBUTIONS_VIEW. Chi tiết từng flag và vị trí sử dụng nằm trong [audit triển khai trước](../2026-11-20-mentor-sharing/README.md#16-permission-cũ).

Test legacy xác minh snapshot chia sẻ không tự mở source, thu hồi không xóa lịch sử, quyền bị gỡ không giữ quyền post, dữ liệu migration cũ không tự share thêm. Named mentor roles có luồng phân vai đồng thuận riêng, không được suy ra từ thứ tự Accept.

## B. Bảng kiểm thử

| Hạng mục | Kỳ vọng | Thực tế | Trạng thái | Bằng chứng |
| --- | --- | --- | --- | --- |
| Mentor Pending | Chỉ xem invitation, không xem private project/Library/Evidence/draft/chat/file | Router thật từ chối các tuyến riêng tư, invitation trả đúng brief | PASS | [100 HTTP checks](api-security-matrix.json), [browser](full-browser-results.json) |
| Mentor Accepted | Có overview/chat, không member/admin; không tự PRIMARY | DB có đúng default, UNASSIGNED, 0 ProjectMember của Mentor | PASS | [API log](full-browser.log), test `accepts once with safe defaults...` |
| Paper View | Đọc đúng Paper/PDF; không comment/sửa/bài khác | File endpoint 200 no-store; comment 403, private Library vẫn bị chặn | PASS | [matrix](api-security-matrix.json), [mobile](full-mentor-paper-view-mobile.png) |
| Paper Comment | Nhận xét đúng share, không sửa screening/member | Comment persisted một lần khi retry; write trái quyền bị từ chối | PASS | [matrix](api-security-matrix.json), [UI](full-mentor-paper-comment.png) |
| Paper downgrade | Vẫn đọc, không tạo comment mới; giữ comment cũ | Backend chặn và UI bỏ composer sau reload | PASS | [browser](full-browser-results.json), [matrix](api-security-matrix.json) |
| Paper Revoke | Chặn tài nguyên/PDF, inbox bỏ Paper; giữ history | 404 ở resource/PDF/feedback share, inbox rỗng, feedback row còn | PASS | [matrix](api-security-matrix.json), [empty state](full-mentor-revoked.png) |
| Retry/concurrency | Không trùng grant/notification | Lost HTTP response rồi retry qua UI chỉ có 1 share và 1 notification; service concurrent tests đạt | PASS | [browser log](full-browser.log), [regression](backend-regression.log) |
| Manuscript Review v1 | Request/assignment đúng revision, Mentor mở và góp ý được | API/PDF/snapshot test đạt; UI mở từ queue, gửi Comment và student nhận | PASS | [review tests](review-regression.log), [review UI](full-mentor-review-submitted.png) |
| Manuscript Review v2 | Draft v2 chưa gửi bị ẩn, resubmit mới mở; v1 bất biến | Kiểm thử DB/API v1→revision request→draft v2→resubmit→review, giữ v1 feedback | PASS | [review tests](review-regression.log), [guidance tests](backend-regression.log) |
| Feedback | Đúng version, không mất rubric/draft khi retry | Review và Paper feedback persisted; 2 Mentor drafts độc lập; comment history còn | PASS | [review tests](review-regression.log), [web tests](web-regression.log) |
| Direct share vs review | Thu hồi đúng nguồn | Cả revoke share→review còn và cancel review→share/PDF còn đều đạt | PASS | [matrix](api-security-matrix.json), [review tests](review-regression.log) |
| Mentor Chat | Hai chiều, riêng khỏi Team Chat/AI, không cần ACL setup | Gửi/nhận qua full UI và DB; Team Chat/AI REST/SSE riêng bị chặn với Mentor | PASS | [chat UI](full-mentor-chat.png), [matrix](api-security-matrix.json) |
| Membership Ended | Không nhận/read/write thêm, aggregate bỏ project; không mất history | 404 ở Mentor workspace tài nguyên/post, inbox/project queue rỗng; lịch sử còn | PASS | [matrix](api-security-matrix.json), [regression](backend-regression.log) |
| Legacy permissions | Không nâng quyền hay mở source | Test cũ và migration probe đạt; local policy giữ nguyên | PASS | [regression](backend-regression.log), [local audit](local-database-audit.json) |
| Cross-project security | ID project/paper/manuscript/version/request/mentor khác bị chặn | Service + HTTP + reviewer khác trong browser không có form hoặc feedback | PASS | [matrix](api-security-matrix.json), [review tests](review-regression.log), [browser](full-browser-results.json) |
| File signed URL | Reviewer không nhận storage capability có thể reuse | Trước sửa 302; sau sửa 200 bytes/no Location/no-store/nosniff; revoke trong lúc đọc từ chối file | PASS sau sửa | [before](signed-url-before.log), [after](review-regression.log) |
| Realtime | Không phát private events sau mất quyền | Team/AI SSE kiểm tra session và quyền mỗi event/heartbeat; live SSE revoke regression đạt | PASS trong phạm vi | [regression](backend-regression.log), [event tests](storage-events.log) |
| Mentor instant realtime | Cập nhật hai chiều không reload | Mentor thread dùng polling 5 giây, không có socket stream riêng | PASS eventual; giới hạn P2 | [browser](full-browser-results.json), `mentor-message-thread.tsx` |
| Desktop/tablet/mobile/light/dark | Dialog không tràn ngang, keyboard focus nằm trong dialog | 1440×960, 1024×768, 390×844; screenshots đã xem | PASS | [desktop](full-share-desktop.png), [tablet](full-share-tablet.png), [mobile](full-share-mobile.png), [dark](full-share-mobile-dark.png) |
| Full build/typecheck | Toàn repository compile | Lỗi Manuscript AI evidenceStatus và AvailableMentor.institution còn | FAIL ngoài phần sửa | [backend types](backend-typecheck.log), [backend build](backend-build.log), [web build](web-build.log) |
| Remote storage thật | R2/Cloudinary credentials và HTTP thật | Local dùng storage local; signed branch tái hiện bằng adapter mock | BLOCKED xác minh provider thật | [summary](verification-summary.json) |

Không gộp số test giao nhau. PASS chỉ áp dụng phạm vi và dữ liệu đã chạy. Kiểm tra Paper private ở đây là project library/file/evidence/note và direct-share endpoint; metadata bài báo học thuật công khai trong corpus không mặc nhiên là dữ liệu project riêng tư.

### Lượt chạy đã thực thi

- Backend regression 6 file: **95 passed, 4 skipped**. Skip gồm browser tùy chọn, interactive fixture và chat-browser tùy chọn; không gọi skipped là PASS.
- Audit mới với full browser: **8 passed**, gồm **100 HTTP checks**, hai account chính và account ngoài ở browser, 6 bước UI.
- Review regression sau sửa: **15 passed, 1 skipped**, gồm signed-link và revoke giữa chừng khi storage đang đọc.
- Frontend 8 file: **109 passed**.
- Quick Chat regression riêng: **9 passed**, gồm trigger/context references, chuyển Full Chat và ẩn với non-member. Quick Chat hiện dùng Team Chat, không phải transport Mentor mới; quyền Mentor với Team Chat đã có HTTP negative test. Không có browser Quick Chat riêng trong lượt này.
- PDF storage/source và chat event unit 4 file: **14 passed**.
- PostgreSQL-only runtime audit trong backend build: **4 passed**; Prisma generate đạt.
- Scoped lint backend: đạt. Frontend: 0 errors, 1 warning `Clock` import chưa dùng có sẵn trong academic-support; không sửa ngoài phạm vi. Diff whitespace: đạt.
- [Vite bundle + bundle budget](web-bundle.log) chạy riêng: đạt. **Không thay thế** full typecheck/build.
- Backend `typecheck`, backend `build`, web `build` thực thi nhưng thất bại ở lỗi TypeScript đã liệt kê. Web build đã chạy `tsc -b`, chưa chạy bước bundling của full build vì compile fail.

Lệnh từ repo root:

```powershell
# Chạy trên PostgreSQL local; runner tự tạo và dọn đúng database test riêng.
node apps/backend/scripts/test-mentor-workspace.mjs --permissions-audit --regression
$env:MENTOR_PERMISSIONS_BROWSER = '1'
node apps/backend/scripts/test-mentor-workspace.mjs --permissions-audit
Remove-Item Env:MENTOR_PERMISSIONS_BROWSER
node apps/backend/scripts/test-mentor-workspace.mjs --review-only
pnpm --filter backend typecheck
pnpm --filter backend build
pnpm --filter web build
```

Browser test tự bật Vite test cổng 13106, proxy đến app API ngẫu nhiên, rồi đóng cả Vite/browser. Không dùng localhost app database, không seed tài khoản thật, không reset. Luồng tạo review trong test dùng service sản phẩm để dựng fixture hợp lệ; thao tác Mentor nhận review, đọc snapshot/gửi feedback và student xem phản hồi đều qua UI. **Chưa kiểm thử upload/gửi v2 bằng UI trong lượt browser này**; v2 được kiểm tra bằng API/database suites thực tế.

## C. Các thay đổi trong lượt audit này

Danh sách chính xác: [changed-files.json](changed-files.json). Giữ các thay đổi có sẵn của người dùng trong cùng file.

| Tệp | Thay đổi và nguyên nhân | Tác động/test |
| --- | --- | --- |
| `apps/backend/src/modules/submissions/submission.service.ts` | Scoped reviewer đọc bytes bằng `readStoredPdf`, kiểm tra lại quyền và revision sau storage read, không trả signed URL | Dùng reader giới hạn 25 MiB, HTTPS/DNS public validation/redirect limit hiện có. Team/owner download giữ cách cũ. Signed URL và slow revoke tests |
| `apps/backend/src/modules/submissions/submission.routes.ts` | no-store/nosniff; nhận buffer và gửi bytes; local sendFile không override cache | Endpoint cũ, không API mới. 200 cho reviewer, không Location. Regression PDF v1/v2 |
| `apps/backend/src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts` | Tái hiện 302 storage capability và revoke trong lúc đọc file | Before FAIL có bằng chứng; after PASS, history còn |
| `apps/backend/src/modules/projects/__tests__/mentor-permissions-audit.persistence.test.ts` (mới) | Matrix theo vai trò qua `createApp` thật, private sentinel fields, nguồn quyền độc lập | 7 API scenarios + full-browser scenario; file test chỉ cho DB test riêng |
| `apps/backend/src/modules/projects/__tests__/mentor-permissions.browser.ts` (mới) | Full product routes, loss/retry, preview/PDF, mode, chat, review/feedback, outsider, revoke, responsive | Không dùng component harness; không mock API response; no page errors ở lượt cuối |
| `apps/backend/scripts/test-mentor-workspace.mjs` | Chọn `--permissions-audit`, kết hợp `--regression` | Tái sử dụng runner/database isolation hiện có |
| `apps/web/src/pages/academics/academic-support.tsx` | Đổi caption nâng cao sai thành Tài liệu đã chia sẻ + mô tả đúng nguồn chia sẻ | Browser xác minh nhãn cũ không còn; không đổi sidebar/layout |
| `apps/web/src/i18n/locales/mentor-sharing.ts` | Dịch Anh/Việt mô tả Support mới | UI tiếng Anh kiểm tra thực tế; frontend regression |

Không đổi schema, không thêm migration trong lượt audit này. Migration chia sẻ trước vẫn nguyên trạng.

### Lỗi bảo mật đã sửa: High/P1

**Trước sửa:** `resolveDownload` luôn xin signed URL trước, router 302 ra ngoài. Đường cloud storage tạo một bearer capability không kiểm tra database ở lần sử dụng sau. Test adapter tái hiện `expected 302 to be 200`.

**Sau sửa:** reviewer bị giới hạn truy cập nhận PDF qua app endpoint; URL storage không gửi xuống client. API dùng reader có sẵn, kiểm tra quyền hai lần để storage chậm không giữ authorization cũ. Đồng thời no-store/nosniff cho mọi response download. Test revoke trong reader trả 403/404 và không gửi nội dung vừa tải.

**Giới hạn:** link đã phát trước khi cập nhật có thể sống đến TTL vốn có (default R2 300 giây). Không thay secret, bucket policy hay dữ liệu để vô hiệu link cũ. Nội dung đã tải về trước đó không thể bị thu hồi từ thiết bị người nhận.

### Lỗi UX đã sửa: P1

Support từng hiện “Advanced permissions & sharing” và “Chọn quyền, nội dung và hạn truy cập...”, khiến người dùng nghĩ phải cấu hình ACL trước. Đổi thành “Tài liệu đã chia sẻ”, mô tả theo dõi Paper và version bản thảo. [Ảnh sau sửa](full-owner-shared-resources.png). Giữ action theo tài nguyên và workflow cancel review riêng.

## D. UX review

- Sinh viên chia sẻ ngay từ Paper detail, chỉ chọn Mentor/mode. Retry giữ lựa chọn; không thêm field lý do/expiry.
- Mentor có Shared resources và Work Queue toàn cục. Browser đã mở review trực tiếp từ Work Queue, giữ sidebar Mentor, không đi vào từng dự án.
- Paper VIEW ẩn composer, API vẫn từ chối post. Feedback cũ hiển thị sau downgrade; revoke không xóa evidence.
- Support thể hiện active/pending/history, direct share khác manuscript review và version. Không có checkbox quyền trong dialog đã kiểm tra.
- Keyboard Tab từ chọn Mentor vẫn nằm trong modal; mobile không overflow document. Dark screenshot đã tắt animation trước chụp.
- **P2 còn ghi nhận:** một số copy trong Support/Review vẫn xen Việt/Anh; không redesign/i18n hàng loạt ngoài nhiệm vụ. Card Mentor xuất hiện lại trong vùng tài liệu; có hai điểm kết thúc quan hệ đều phải confirm. Có thể thu gọn sau nhưng không phải authorization bug.
- **P2:** Mentor Chat dùng polling 5 giây. UI hai chiều đã đạt, chưa phải socket tức thì. Không tạo chat service mới chỉ để đổi transport.

## E. Dữ liệu, migration và các rủi ro còn lại

[Local database audit chỉ đọc](local-database-audit.json): 0 resource shares, 0 mentor feedback, 1 review request, 166 migration ledger rows. Các policy vẫn 1 ADVISOR chỉ MENTOR_CHAT, 1 ADVISOR 15 quyền, 8 ADVISOR rỗng. Không sửa grants/reviews/invitation người dùng thật.

Migration ledger vẫn có **7 pending** (6 cũ + migration Paper share mode trước). Trong 58 raw checksum lệch, 50 giải thích bởi CRLF/LF/BOM; **8 mục còn cần đối chiếu**. **7 nhóm OpenAlex ID trùng** chưa thay đổi. Không chạy full migrate deploy vào ứng dụng, không reset, không mark applied, không xóa/merge record.

| Mức độ | Vấn đề còn lại | Lý do chưa sửa / bước tối thiểu |
| --- | --- | --- |
| Critical | Không phát hiện rò rỉ còn tồn tại trong các tình huống đã chạy | Không khẳng định mọi endpoint ngoài phạm vi đều an toàn |
| High / P1 | Full compile fail: `evidenceStatus` intersection thành never ở Manuscript AI/editor/integrity; `AvailableMentor.institution` không có | Ngoài targeted permission fix, working tree có thay đổi song song. Cần thống nhất type nguồn và mapping institution rồi chạy lại full checks |
| High / P1 trước deploy | Migration/local ledger lệch và OpenAlex duplicates | Audit file đã deployed và FK; backup rồi chuẩn bị migration/data reconciliation riêng, không tự sửa lịch sử |
| Medium / P2 | Provider PDF R2/Cloudinary chưa chạy với credentials thật sau proxy | Test adapter và public-source unit đạt; cần smoke test provider thật trong môi trường staging có quyền phù hợp |
| Medium / P2 | Polling/revoke UI trễ tối đa chu kỳ khi tab hoạt động, browser có thể throttle background | API request mới chặn ngay; không thể xóa bytes đã cache/render trước đó. Không tuyên bố “thu hồi mọi bản đã tải” |
| Medium / P2 | Global shared resource filter chỉ trang hiện tại, legacy workspace có query từng policy | Nhãn đã nói rõ; phân trang có giới hạn. Chưa benchmark quy mô lớn; không thay kiến trúc chỉ vì giả định |
| Low / P2 | Copy Việt/Anh và card/action lặp trong Support | Có thể làm gọn sau khi thống nhất thiết kế, không mở rộng audit thành redesign |

## Điều kiện bàn giao

Mô hình Accept → safe defaults → Paper share → scoped review → revoke đúng nguồn đã có bằng chứng code/API/database/full UI. Hai lỗi xác minh được đã sửa và regression đạt. Không còn lỗi quyền P0/P1 mới được phát hiện mà chưa xử lý trong phạm vi các test.

**Chưa đủ điều kiện coi toàn branch là CI-green hoặc deploy.** Cần xử lý các blocker compile/migration đã nêu. Các thay đổi vẫn chưa staged/committed/pushed; audit không thay dữ liệu application thật. Các file `failure-*` nếu còn là ảnh chẩn đoán các lượt thử selector/animation trước khi lượt browser cuối đạt, không phải trạng thái bàn giao hiện tại; dùng `full-*` và `full-browser-results.json` làm bằng chứng cuối.
