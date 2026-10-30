# Cập nhật workflow 2026-10-29

Quy tắc tự động chốt và tối thiểu hai reviewer mô tả bên dưới đã được thay bằng Simple/Independent Review và bước chốt rõ ràng. Xem [workflow hiện hành](project-paper-review-workflow.md) để triển khai và kiểm thử. Lịch sử V2 vẫn được bảo toàn.


---

# Sàng lọc bài báo cộng tác V2

Ngày kiểm tra: 28/10/2026.

## 1. Phạm vi đã triển khai

Tab **Tài liệu nghiên cứu** mở danh sách **Sàng lọc độc lập**. Thư viện, thêm bài, đọc nguồn, ghi chú và evidence vẫn truy cập được từ thanh điều hướng của tab.

- Phiếu riêng cho từng người: `INCLUDE`, `EXCLUDE`, `UNSURE`; loại bài bắt buộc có lý do.
- Phiếu gửi xong bị khóa. Sửa phiếu cần chủ dự án mở lại, ghi lý do, tạo revision mới và giữ phiếu cũ.
- Phân công thủ công hoặc tự động cho một hay nhiều bài; hạn gửi tùy chọn; lọc phiếu của tôi, đang chờ, đã gửi, quá hạn, cần thống nhất.
- Cấu hình số người bắt buộc từ 2 đến 10, quy tắc đồng thuận, câu hỏi và tiêu chí. Mỗi vòng giữ snapshot cấu hình đã dùng.
- Đồng thuận tự động; xử lý bất đồng thủ công; công bố sớm có lý do và xác nhận.
- Lịch sử có phân trang, vòng cũ, kết quả lịch sử có nguồn gốc rõ ràng, thảo luận sau công bố.
- Thống kê tiến độ, khối lượng thành viên, tỷ lệ đồng ý, xung đột, phân bố trạng thái, lý do loại và Cohen’s Kappa.
- Trợ lý AI tùy chọn, chạy qua worker; đề xuất được lưu riêng, không thay phiếu hay quyết định chính thức.
- Giao diện tiếng Việt, bố cục thích ứng màn hình, trạng thái tải/lỗi/rỗng, bảo vệ bản nháp và chống gửi trùng.
- Danh sách tự cập nhật mỗi 10 giây khi đang mở và dự án có thể chỉnh sửa; chi tiết vòng đang chờ cập nhật mỗi 2,5 giây. TanStack Query ngừng polling khi tab trình duyệt ở nền. Lỗi tải nền giữ nguyên dữ liệu đã tải và biểu mẫu đang soạn.

## 2. Cấu trúc mã

### Backend

Trong `apps/backend/src/modules/projects/`:

| Tệp | Vai trò |
| --- | --- |
| `screening.calculator.ts` | Đồng thuận, phân công cân bằng, Kappa thuần tính toán |
| `screening-context.ts` | DTO theo quyền, snapshot, idempotency, tính lại kết quả, thu hồi phân công |
| `screening.service.ts` | Cấu hình, vòng, phân công, phiếu, xử lý bất đồng, lịch sử và thống kê |
| `screening-ai.service.ts` | Yêu cầu bền vững, hàng đợi, xác thực đầu ra AI |
| `screening.controller.ts` | HTTP và response envelope |
| `screening.routes.ts` | Routes, Zod, rate limit và cache policy |
| `dto/screening.schema.ts` | Kiểm tra dữ liệu đầu vào nghiêm ngặt |
| `project-research.routes.ts` | Gắn router V2 |
| `project-screening.service.ts` | Tương thích lịch sử, chặn ghi qua API cũ sau chuyển đổi, thu hồi khi rời nhóm |
| `project.service.ts` | Chặn thành viên sửa kết quả chung; bảo vệ nguồn và dự án có lịch sử |

`apps/backend/src/workers/ai-jobs.worker.ts` nhận job AI sàng lọc, phục hồi yêu cầu chờ khi khởi động và đánh dấu thất bại sau lần thử cuối. Các thay đổi contribution/manuscript có sẵn trong tệp này được giữ lại.

### Frontend

Trong `apps/web/src/features/projects/`:

- `api/screening.api.ts`: REST client.
- `components/screening-workspace.tsx`: danh sách, bộ lọc, phân trang, mở chi tiết và thao tác hàng loạt.
- `components/screening-management.tsx`: cấu hình và phân công.
- `components/screening-round.tsx`: đọc metadata, phiếu cá nhân/nhóm, quản lý bất đồng, AI, vòng và lịch sử.
- `components/screening-analytics.tsx`: thống kê và giải thích mẫu số.
- `components/screening-common.tsx`: nhãn, lỗi, phân trang và khóa yêu cầu gửi trùng.
- `screening.css`: sử dụng token hiện có, hỗ trợ theme và màn hình nhỏ.
- `components/research-literature.tsx`: tích hợp tab sàng lọc/thư viện/evidence.
- `components/project-literature-workspace.tsx`: reader dẫn đến quy trình độc lập, bỏ điều khiển sửa trạng thái chung.
- `hooks/use-project-research.ts`: dùng query theo tài khoản và dự án; cho phép tùy chỉnh chu kỳ polling.

Hợp đồng dùng chung: `packages/shared-types/src/project-screening.ts`, export từ `index.ts`. Không đưa Prisma/React/Express vào shared types.

## 3. Dữ liệu và migration

Schema: `apps/backend/prisma/project-screening.prisma`.

Migration viết tay: `apps/backend/prisma/migrations/20261028120000_collaborative_screening_v2/migration.sql`.

| Bảng | Nội dung |
| --- | --- |
| `screening_settings` | Cấu hình hiện tại và version |
| `screening_rounds` | Giai đoạn, snapshot quy tắc, trạng thái, version, thời điểm công bố |
| `screening_assignments` | Người được giao, revision hiện tại, hạn, trạng thái gửi và hiệu lực |
| `screening_reviews` | Phiếu bất biến theo assignment + revision |
| `screening_final_decisions` | Kết quả, nguồn tự động/thủ công, lý do, resolver và danh sách review ID |
| `screening_audit` | Sự kiện bất biến, lý do, idempotency key, request hash và kết quả lệnh |
| `screening_legacy_records` | Snapshot kết quả cũ có provenance |
| `screening_ai_suggestions` | Input snapshot, input hash, người yêu cầu, trạng thái và kết quả AI |

Foreign key ghép kiểm tra cùng dự án; unique ngăn trùng người/vòng, phiếu/revision và yêu cầu; partial unique index đảm bảo một vòng hiện tại cho mỗi bài. CHECK constraints giới hạn trạng thái và bắt buộc lý do loại. Có index cho danh sách, công việc, lịch sử và hàng đợi.

Trigger cấm UPDATE/DELETE phiếu, quyết định cuối, audit và legacy snapshot. Kết quả AI hoàn tất cũng bất biến. Tài khoản quản trị PostgreSQL vẫn có thể thay đổi schema/trigger; đây không phải cơ chế chống người quản trị cơ sở dữ liệu.

Migration không thay trạng thái/vote/revision cũ, không tạo người đánh giá hoặc phiếu giả. Các nguồn đã được sàng lọc được snapshot với provenance `LEGACY_SHARED_STATUS`. Khi bắt đầu vòng mới, nguồn chưa được snapshot được ghi `PRE_PROTOCOL_STATUS`.

## 4. Quyền và tương thích

| Thao tác | Quyền |
| --- | --- |
| Xem danh sách, metadata, tiến độ, lịch sử được phép, thống kê | Chủ dự án và thành viên đang hoạt động |
| Gửi phiếu | Người đang được phân công, tài khoản hợp lệ, đúng dự án/vòng/revision, chưa gửi |
| Cấu hình, bắt đầu vòng, phân công, công bố sớm, mở lại, xử lý bất đồng | Chủ dự án (`OWNER`) |
| Thảo luận | Thành viên sau công bố, trong vòng hiện tại |
| Yêu cầu AI | Thành viên, vòng hiện tại được phép xem AI, dự án chưa lưu trữ |

Repo hiện không có vai trò Leader riêng cho quản lý screening; quyền này ánh xạ vào chủ dự án. Mentor ngoài nhóm không được cấp quyền sàng lọc qua các endpoint này.

Mọi dịch vụ kiểm tra lại quyền bên trong transaction. Khóa tài khoản theo thứ tự ổn định trước khóa dự án, đồng bộ với luồng thành viên. Dự án `ARCHIVED` chỉ đọc. Thành viên thường không được sửa trực tiếp các trường quyết định chung, kể cả khi dự án còn dùng chế độ cũ.

API legacy vẫn đọc được lịch sử. API ghi screening cũ chỉ hoạt động trước khi dự án có cấu hình/vòng V2; sau đó trả `409` kèm hướng dẫn mở quy trình mới. API cũ không được dùng để tắt blinding. Đây là giới hạn tương thích có chủ đích để ngăn ghi vòng mới qua quy trình cũ.

Người rời nhóm: giữ phiếu đã gửi, thu hồi phần chưa gửi, không phục hồi âm thầm khi tham gia lại. Việc thu hồi tính lại vòng hiện tại nếu còn đủ người hoàn thành. Tài khoản bị vô hiệu hóa toàn hệ thống bị chặn và không còn đủ điều kiện nhận việc; chủ dự án cần phân công lại phần chưa gửi để cập nhật vòng. Không tự khôi phục kết quả từ vote legacy.

Nguồn đã có vòng/snapshot không được xóa khỏi dự án; dùng kết quả loại bài để giữ dấu vết nghiên cứu. Dự án có lịch sử cần lưu trữ thay vì xóa.

## 5. Đồng thuận và trạng thái

Một vòng chỉ được tính kết quả khi:

1. Số người được phân công hợp lệ đạt số bắt buộc trong snapshot.
2. **Tất cả** người đang được phân công đã gửi, kể cả khi được phân công nhiều hơn mức tối thiểu.

Với mặc định 2 người và `UNANIMOUS`:

| Phiếu A | Phiếu B | Kết quả |
| --- | --- | --- |
| Chưa gửi | Chưa gửi | `NOT_REVIEWED` |
| Một người đã gửi | Người còn lại chờ | `IN_REVIEW` |
| INCLUDE | INCLUDE | `INCLUDED` |
| EXCLUDE | EXCLUDE | `EXCLUDED` |
| Khác nhau hoặc có UNSURE | Bất kỳ lựa chọn còn lại | `NEEDS_RESOLUTION` |

`UNANIMOUS` yêu cầu mọi phiếu cùng INCLUDE hoặc cùng EXCLUDE. `STRICT_MAJORITY` phải được chọn rõ ràng: số phiếu INCLUDE hoặc EXCLUDE đạt `floor(số người được giao / 2) + 1`. Ví dụ 3 phiếu INCLUDE/INCLUDE/UNSURE chỉ được đưa vào theo đa số tuyệt đối. UNSURE không tự chốt kết quả, kể cả khi toàn bộ phiếu là UNSURE.

Chủ dự án giải quyết bất đồng sau khi đủ phiếu bằng INCLUDE/EXCLUDE cuối cùng, lý do ít nhất 10 ký tự, xác nhận và version hiện tại. Hai yêu cầu xử lý đồng thời chỉ một yêu cầu hợp lệ được ghi; phiếu gốc giữ nguyên.

Sửa phiếu đã gửi tăng revision, giữ bản cũ và đưa kết quả hiện tại về đang xem xét. Vòng đã công bố không được làm mù lại. Muốn đánh giá giai đoạn tiếp theo: hoàn thành vòng hiện tại rồi bắt đầu vòng mới; vòng trước và kết quả của nó vẫn truy cập được.

Các consumer cũ vẫn đọc được `project_papers.screening_status`: `NOT_REVIEWED → UNDECIDED`; `IN_REVIEW/NEEDS_RESOLUTION → MAYBE`; INCLUDED/EXCLUDED giữ nguyên. UI V2 dùng trạng thái vòng để phân biệt cần thống nhất với đang chờ.

## 6. Bảo mật phiếu ẩn

- Backend lọc nội dung phiếu, nhận xét và bản lịch sử; trước công bố chỉ người viết xem được phiếu của mình.
- Chủ dự án chỉ theo dõi người đã hoàn thành, không có quyền đọc trước lựa chọn qua endpoint thông thường.
- Danh sách, chi tiết, vòng trước, audit và analytics đều tuân theo chính sách. Không trả tổng phiếu theo lựa chọn hay lý do loại từ vòng đang ẩn/chưa đủ phiếu.
- Kết quả tự động và phiếu được công bố cùng transaction sau khi đủ điều kiện.
- Công bố sớm yêu cầu quyền chủ dự án, version, lý do, xác nhận; ghi audit và đánh dấu `independenceCompromised`.
- Mở lại sau công bố cũng đánh dấu bị ảnh hưởng tính độc lập. Những vòng này không dùng tính agreement/Kappa.
- AI mặc định bị ẩn trước công bố. Cho xem sớm phải nằm trong snapshot cấu hình của vòng; đổi cấu hình mới không mở AI cho vòng cũ.
- Response screening đặt `Cache-Control: private, no-store`; query cache frontend bao gồm tài khoản và dự án.

Blind review bảo vệ nội dung trong LumiGap; không ngăn các thành viên trao đổi qua kênh ngoài hệ thống hoặc đọc kết quả của các vòng đã công bố trước đó.

## 7. Thống kê và Cohen’s Kappa

Thống kê dùng vòng hiện tại của mỗi bài. Số bài đã bắt đầu vòng và số bài đủ mọi phiếu được hiển thị riêng. Hoàn thành phiếu = số phiếu đã gửi / số phân công hợp lệ.

Chỉ các vòng đã công bố, đủ mọi phiếu và không `independenceCompromised` được đưa vào mẫu số đồng ý:

```text
Agreement Rate = số bài có mọi lựa chọn giống nhau / số bài đủ phiếu độc lập × 100
Conflict Rate = số bài cần xử lý theo quy tắc của vòng / số bài đủ phiếu độc lập × 100
```

Toàn bộ phiếu UNSURE vẫn là đồng ý về lựa chọn nhưng cần xử lý bất đồng để có kết quả cuối. Theo đa số tuyệt đối, một bài có thể không nhất trí toàn bộ nhưng vẫn chốt tự động. Vì vậy disagreement, conflict và tỷ lệ INCLUDED là ba khái niệm khác nhau.

Cohen’s Kappa dùng ba nhóm INCLUDE/EXCLUDE/UNSURE và yêu cầu mỗi bài có đúng hai người, **cùng một cặp danh tính** trên toàn bộ mẫu:

```text
Po = số cặp có cùng lựa chọn / N
Pe = Σc (số phiếu A thuộc c / N) × (số phiếu B thuộc c / N)
κ = (Po − Pe) / (1 − Pe)
```

Chuẩn hóa thứ tự người đánh giá theo ID trước khi tính. Không gộp cặp A/B với A/C. Không có dữ liệu, hơn hai người, cặp không nhất quán hoặc Pe = 1 trả `null` cùng mã lý do; UI giải thích tại sao không có giá trị. Không thay null bằng 0. Chưa hỗ trợ chỉ số nhiều người như Fleiss’ Kappa, khoảng tin cậy hoặc phân tích theo từng giai đoạn.

Đây là thống kê mô tả, không kết luận nhóm nghiên cứu tốt/xấu. Mẫu nhỏ thiếu độ ổn định. Vòng có cấu hình cho phép AI trước khi gửi vẫn có thể nằm trong mẫu nếu không công bố sớm/mở lại sau công bố; agreement không chứng minh người đánh giá không bị ảnh hưởng bởi cùng đề xuất AI. Cần xem cấu hình vòng khi diễn giải.

## 8. API

Base: `/api/v1/projects/:id/research/screening-v2`.

Tất cả endpoint kế thừa JWT authentication và research-workflow gate; kiểm tra thành viên ở service. Thành công dùng `{ success: true, data }`, lỗi dùng envelope chung của hệ thống. GET không thay dữ liệu.

| Method | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | `/config` | Cấu hình, người hợp lệ, quyền quản lý |
| PUT | `/config` | Lưu cấu hình version mới cho vòng tương lai |
| GET | `/papers` | Danh sách, phân công/progress, phiếu tôi được xem |
| POST | `/rounds` | Bắt đầu vòng cho các paper ID |
| POST | `/assignments` | Phân công một/nhiều round ID |
| GET | `/analytics` | Thống kê tổng hợp được phép |
| GET | `/papers/:paperId/rounds` | Các vòng và provenance legacy |
| GET | `/rounds/:roundId` | Chi tiết, phiếu cá nhân/nhóm được phép, consensus và quyền |
| POST | `/rounds/:roundId/reviews` | Gửi và khóa phiếu |
| POST | `/rounds/:roundId/resolve` | Xử lý bất đồng |
| POST | `/rounds/:roundId/reopen` | Mở lại phiếu để tạo revision mới |
| POST | `/rounds/:roundId/unblind` | Công bố sớm có kiểm soát |
| POST | `/rounds/:roundId/comments` | Thảo luận sau công bố |
| GET | `/rounds/:roundId/history` | Audit và revision được xem |
| GET | `/rounds/:roundId/ai` | Đề xuất AI gần nhất |
| POST | `/rounds/:roundId/ai` | Xếp hàng tạo đề xuất, HTTP 202 |

Danh sách: `page` từ 1, `pageSize` mặc định 20/tối đa 50, `q` tìm tiêu đề/DOI, `filter=ALL|MINE|PENDING|COMPLETED|OVERDUE|CONFLICT`. `source` nhận UUID hoặc ID legacy để mở bài liên kết ngoài trang hiện tại, vẫn giới hạn trong dự án. Lịch sử cố định 20 mục/trang; vòng cố định 10 mục/trang.

Các lệnh ghi dùng `clientKey` UUID. Lặp cùng actor/project/key và cùng nội dung trả kết quả cũ; đổi nội dung với key cũ trả 409. Phiếu có `assignmentId`, `expectedRevision`, `decision`, `exclusionReason`, `comment`, `confirmed: true`. Thao tác nhạy cảm có `expectedVersion`, `reason`, `confirmed: true`; resolve thêm `decision`, reopen thêm `assignmentId`.

Lệnh thường giới hạn 300 yêu cầu/giờ/người; AI 10 yêu cầu/giờ/người, qua `createRateLimiter` hiện có. Không gửi reviewer ID từ client để xác định người ghi phiếu; lấy actor đã xác thực.

## 9. AI và cấu hình chạy

- Tái sử dụng `modules/llm/cachedGenerateJSON`, model/provider hiện có, cache Redis và `withUserAi`. Không thêm API key hoặc model cố định.
- Chạy `pnpm --filter backend worker:ai-jobs` cùng Redis như các job hiện tại. Job `project-screening-assistance-v1` có ba lần thử với exponential backoff. Worker phục hồi yêu cầu QUEUED còn thiếu job khi khởi động.
- Yêu cầu cần câu hỏi nghiên cứu và ít nhất một tiêu chí. Việc sàng lọc thủ công không phụ thuộc nhà cung cấp AI.
- Chỉ truyền tiêu đề tối đa 2.000 ký tự, abstract tối đa 20.000 ký tự và snapshot quy tắc; không tải toàn văn hay truy vấn nguồn ngoài.
- Nội dung bài và tiêu chí được xử lý như dữ liệu không đáng tin; system prompt cấm làm theo chỉ dẫn trong dữ liệu. JSON được kiểm tra bằng Zod strict.
- Tiêu chí trả về phải tồn tại nguyên văn trong snapshot. Mỗi trích dẫn phải khớp chuỗi con của tiêu đề/abstract sau chuẩn hóa khoảng trắng; INCLUDE/EXCLUDE cần minh chứng. Không có abstract được ghi rõ trong missing information.
- Không xuất confidence chưa hiệu chuẩn. Kiểm tra trích dẫn không chứng minh suy luận AI đúng; người dùng phải tự kiểm tra đề xuất.
- Kiểm tra lại quyền trước và sau provider call. Kết quả chỉ ghi bảng AI; không ghi human review, final decision hoặc shared screening status.
- Lỗi queue/provider/đầu ra có trạng thái riêng và có thể yêu cầu lại. Input snapshot có thể chứa nội dung nghiên cứu riêng, cần giữ quyền truy cập và backup tương ứng với dữ liệu dự án.

## 10. Triển khai và khôi phục

1. Backup PostgreSQL theo quy trình môi trường và xem migration trong PR.
2. Build shared types; chạy `pnpm --filter backend db:migrate:deploy` trên **đúng môi trường đích**, sau đó `db:migrate:status`. Không dùng `migrate dev`.
3. Triển khai backend và khởi động lại worker AI với cùng schema mới.
4. Triển khai web sau backend. Kiểm tra hai tài khoản trước khi mở cho nhóm.

Migration có bảng mới, không có down migration xóa lịch sử. Nếu cần rollback, dừng ghi V2 và giữ nguyên bảng/snapshot, phục hồi binary tương thích qua quy trình vận hành. Không rollback mù về binary cũ cho phép sửa trạng thái chung: nó không hiểu các ràng buộc/quyền V2. Chỉ xóa schema mới trong cơ sở dữ liệu thử nghiệm có thể bỏ hoàn toàn hoặc sau khi xác nhận không có dữ liệu cần giữ.

Trong lần triển khai mã này, migration chỉ được áp dụng vào database riêng `lumigap_screening_20261028_test` trên PostgreSQL local cổng 5433. Toàn bộ 99 migration đã chạy thành công. Chưa migrate database ứng dụng, chưa rebuild/restart các container phục vụ localhost:8080.

## 11. Kiểm thử và giới hạn xác minh

| Kiểm tra | Kết quả |
| --- | --- |
| Backend calculator/DTO | 16 đạt |
| Backend persistence + HTTP trên PostgreSQL riêng | 15 đạt |
| Web screening workspace | 10 đạt |
| Web literature regression | 28 đạt |
| Web research workflow regression | 21 đạt |
| PostgreSQL-only runtime audit | 4 đạt |
| Shared-types build | Đạt |
| Backend và web TypeScript | Đạt |
| ESLint các tệp liên quan | Đạt |
| Production build backend và web | Đạt; web có cảnh báo chunk lớn ở các module khác |

Persistence test dùng PostgreSQL thật; mock queue/provider/personal runtime để không gọi dịch vụ ngoài hay dùng credit. Bao gồm gửi đồng thời/idempotency, phiếu khóa, blind DTO/list/history/analytics, phân quyền HTTP, hai resolver đồng thời, revision bất biến, công bố sớm, rời nhóm, phân công lại, snapshot quy tắc, bảo vệ đường ghi cũ, lưu trữ, legacy, AI thất bại và đầu ra sai. Migration nguyên văn còn được chạy trên schema tạm có dữ liệu legacy, kiểm tra giữ trạng thái và không tạo phiếu giả rồi rollback transaction.

Web test kiểm tra xác nhận, giữ draft/lặp key khi gửi lỗi, khóa phiếu, quyền, bulk actions, giữ draft khi mất phân công, lỗi tải nền và xung đột cấu hình.

Chạy unit backend:

```powershell
pnpm --filter backend exec vitest run src/modules/projects/__tests__/screening.calculator.test.ts
```

Chạy persistence chỉ với DATABASE_URL trỏ đến database thử nghiệm có tên kết thúc `_test`, đã áp dụng migration. Không trỏ vào database ứng dụng. Thiết lập env trong terminal chạy test, không lưu credentials vào repo:

```powershell
$env:SCREENING_INTEGRATION = '1'
$env:NODE_ENV = 'test'
$env:EMAIL_DELIVERY_MODE = 'disabled'
pnpm --filter backend exec vitest run src/modules/projects/__tests__/screening.persistence.test.ts --maxWorkers=1 --minWorkers=1
```

Test giữ fixtures vì lịch sử append-only; chỉ dùng database có thể bỏ. Suite integration cũ `collaborative-research.persistence.test.ts` vẫn khóa vào hạ tầng disposable riêng cổng 15439/16389; chưa chạy lại suite này. Các kỳ vọng sửa trạng thái chung đã đổi sang chủ dự án theo quyền mới.

Chạy web:

```powershell
pnpm --filter web exec vitest run src/features/projects/__tests__/screening-workspace.test.tsx src/features/projects/__tests__/project-literature-flow.test.tsx src/features/projects/__tests__/research-workflow.test.tsx
```

Chưa xác minh trực quan trên trình duyệt: công cụ Computer Use đã dừng do không xác định được URL hiện tại an toàn. Chưa có ảnh desktop/mobile của tính năng này; chưa gọi provider AI thật hay chạy hàng đợi Redis đầu cuối. Cần thực hiện các bước thủ công bên dưới sau deploy.

Analytics hiện tính đồng bộ trong transaction và tải vòng hiện tại của toàn dự án; chưa benchmark dự án hàng chục nghìn bài. Danh sách/phân trang có giới hạn payload, nhưng analytics và truy vấn eligibility cần đo tải trước khi dùng cho systematic review quy mô lớn. Polling không phải realtime qua WebSocket.

## 12. Kịch bản nghiệm thu thủ công

Dùng một chủ dự án và hai thành viên đang hoạt động, đăng nhập bằng các browser profile riêng. Thêm ít nhất ba bài có metadata hợp lệ. Mở Network để kiểm tra response API, không chỉ nhìn UI.

### A. Đồng thuận

1. Chủ dự án cấu hình 2 người, nhất trí toàn bộ, AI trước gửi tắt; chọn bài A, bắt đầu vòng và giao cho hai thành viên.
2. A gửi INCLUDE, xác nhận. B và chủ dự án thấy 1/2 đã gửi nhưng không đọc được lựa chọn/nhận xét của A trong detail/list/history/analytics.
3. B gửi INCLUDE. Hai phiếu được công bố; kết quả INCLUDED, nguồn đồng thuận tự động, có lịch sử hai phiếu.
4. Thử gửi lại bằng API với cùng key: không có bản sao. Đổi key gửi phiếu đã khóa: 409.

### B. Bất đồng và chỉnh sửa

1. Ở bài B, A gửi INCLUDE, B gửi EXCLUDE kèm lý do. Trạng thái NEEDS_RESOLUTION; phiếu nhóm và thảo luận mở.
2. Chủ dự án chọn EXCLUDED, ghi lý do, xác nhận. Kết quả thủ công và phiếu gốc vẫn có trong lịch sử.
3. Mở cùng phiên bản ở hai cửa sổ rồi chốt đồng thời: chỉ một yêu cầu thành công.
4. Mở lại một phiếu với lý do: không làm mù lại; người được giao gửi revision mới; lịch sử cũ còn nguyên; vòng không dùng cho Kappa độc lập.

### C. AI

1. Sau công bố ở bài C, yêu cầu AI khi đã có câu hỏi và tiêu chí; worker đang chạy.
2. Kiểm tra trạng thái chờ, rồi đề xuất/lý do/tiêu chí/trích dẫn/thông tin thiếu/thời điểm.
3. Kiểm tra phiếu và kết quả chính thức không thay đổi. Không có confidence giả; không có abstract phải nêu rõ.
4. Dừng worker/provider thử nghiệm để kiểm tra lỗi/thử lại; người dùng vẫn đánh giá thủ công được.
5. Với vòng mới có AI-assisted bật, được xem trước gửi. Đổi cấu hình không mở AI cho vòng cũ vốn đang ẩn.

### D. Quyền và vòng đời

1. Thành viên gọi resolve/unblind/config/assign trực tiếp: bị từ chối, dữ liệu không đổi.
2. Người ngoài gọi detail hoặc dùng round ID dự án khác: không đọc được dữ liệu.
3. Thành viên chưa gửi rời nhóm: phân công thu hồi. Phiếu đã gửi của người rời nhóm vẫn được giữ.
4. Đổi số người bắt buộc khi vòng đang chạy: vòng cũ giữ snapshot; vòng mới dùng cấu hình mới.
5. Lưu trữ dự án: toàn bộ nút ghi bị chặn và API từ chối. Xóa nguồn có lịch sử bị chặn rõ ràng.
6. Soạn phiếu, ngắt mạng hoặc đổi phân công bằng tài khoản chủ dự án: bản nháp còn để sao chép; gửi lại không tạo bản trùng.

### E. Dữ liệu cũ và thống kê

1. Kiểm tra bài đã INCLUDED/EXCLUDED trước migration còn kết quả và provenance, không có danh tính reviewer được tự tạo.
2. Mở vòng mới sau xác nhận: kết quả cũ trong lịch sử, kết quả hiện tại chờ đánh giá mới.
3. Với cùng cặp A/B, tạo các tổ hợp INCLUDE/EXCLUDE/UNSURE; kiểm tra mẫu số loại phiếu thiếu và vòng công bố sớm.
4. Giao một bài cho A/C hoặc hơn hai người: Kappa trả thông báo phù hợp, không gộp cặp tùy ý.
5. Thử bộ lọc, tìm DOI, trang sau, liên kết bài ngoài trang hiện tại; kiểm tra desktop, mobile, theme sáng/tối và bàn phím.
