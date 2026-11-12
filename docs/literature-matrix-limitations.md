# Ma trận tài liệu, xác định hạn chế và đánh giá khả thi

Ngày: 2026-11-07. Bổ sung bước 3 và 4 của quy trình tìm khoảng trống nghiên cứu (7 bước), cùng phiếu đánh giá khả thi.

| Bước | Trước | Sau |
|---|---|---|
| 3. Literature matrix | Bảng trích xuất chỉ xem trước 3 cột của bản đầu tiên mỗi bài | Ma trận đầy đủ: mỗi dòng một trích xuất, 5 cột cố định cộng tối đa 12 cột riêng của dự án, xuất CSV |
| 4. Limitation identification | Hạn chế chỉ là một trường văn bản trong từng trích xuất | Gom hạn chế của nhiều bài thành một hạn chế chung, đếm số bài cùng nêu, chuyển thành gap ứng viên |
| Feasibility | Không có | Mỗi thành viên chấm 5 tiêu chí; gap phải có đánh giá khả thi mới được ghi nhận "nhóm ủng hộ" |

## 1. Ma trận tài liệu

**Vào từ:** dự án → Literature → tab **Ma trận**. Cũng có ở `?tab=gaps&research=matrix`.

- Mỗi dòng là một trích xuất (`project_evidence_items`) của bài đã qua sàng lọc (`evidenceEligibility`). Bài chưa đạt sàng lọc không xuất hiện.
- **Cột cố định:** phương pháp, dữ liệu/đối tượng, phát hiện chính, kết quả, hạn chế. Đây là các trường sẵn có của trích xuất.
- **Cột riêng của dự án** (`project_matrix_criteria`), ví dụ "Bộ dữ liệu", "Chỉ số đánh giá". Giá trị được lưu trong `project_evidence_items.criteria_values` (jsonb, khóa là id của cột).
  - Giá trị nằm trên chính trích xuất, nên sửa một ô là sửa trích xuất: tạo phiên bản mới, trạng thái quay về "chờ kiểm chứng". Mọi ô trong ma trận vì vậy đều đi qua cùng một bước kiểm chứng của con người.
  - Ẩn (archive) một cột không xóa giá trị đã ghi. Khi sửa trích xuất, giá trị của các cột đã ẩn được giữ nguyên (`matrixCriteriaValues`).
  - Tối đa 12 cột đang dùng. Hai cột đang dùng không được trùng tên (không phân biệt hoa thường; có partial unique index).
  - Gửi giá trị cho một cột không còn tồn tại sẽ trả về 409 ("Reload the matrix"), thay vì âm thầm bỏ đi.
- **Mặc định chỉ hiện trích xuất đã kiểm chứng.** Chọn "Gồm cả bản chưa kiểm chứng" thì hiện thêm bản nháp, kèm cảnh báo. Trích xuất bị từ chối không bao giờ hiện.
- Lọc theo Research Question, chủ đề và từ khóa. Mỗi lần trả về tối đa 500 dòng (`MATRIX_ROW_CAP`); vượt quá thì giao diện báo bị cắt.
- **Xuất CSV** (`literature-matrix-csv.ts`) chạy hoàn toàn ở trình duyệt:
  - có BOM UTF-8 để Excel hiển thị đúng tiếng Việt;
  - mọi ô đều được đặt trong dấu nháy kép;
  - ô bắt đầu bằng `= + - @` được thêm dấu `'` ở đầu, để tiêu đề bài báo không thể chạy công thức (CSV injection).

## 2. Xác định hạn chế

**Vào từ:** Literature → tab **Hạn chế**.

1. **Cột trái** liệt kê các trích xuất **đã kiểm chứng**, **có ghi hạn chế**, thuộc bài còn được đưa vào, và **chưa** được nhóm.
2. Chọn các trích xuất nói về cùng một hạn chế, viết phát biểu chung và chọn loại: DATA, METHOD, CONTEXT, OUTCOME, TEMPORAL, OTHER. Hệ thống tạo `project_limitations` cùng các dòng `project_limitation_sources`.
3. Mỗi hạn chế hiện **số bài báo khác nhau** cùng nêu nó (`distinctPaperCount`). Danh sách xếp các hạn chế đang mở lên trước, hạn chế được nhiều bài nêu nhất lên đầu.
4. Trạng thái của hạn chế:
   - `OPEN`: sửa được nội dung và danh sách nguồn.
   - `DISMISSED`: bắt buộc ghi lý do (có cả CHECK trong DB). Có thể mở lại.
   - `PROMOTED`: đã chuyển thành gap, không sửa được nữa; muốn sửa thì sửa gap.
5. **Chuyển thành gap ứng viên** (`promote`):
   - Tạo `research_gaps` với `origin = HUMAN`. `gapType` suy từ loại hạn chế (`gapTypeForLimitation`).
   - Các trích xuất nguồn được gắn làm **bằng chứng ủng hộ**, ghim đúng phiên bản đã kiểm chứng (dùng chung `linkEvidenceInContext` với luồng gắn bằng chứng có sẵn).
   - Đánh giá khả thi của từng thành viên cho hạn chế được **mang sang** gap, có ghi chú "(Carried over…)".
   - Gap vẫn phải qua đánh giá của nhóm, kiểm tra đóng gap và chuyên gia xác nhận như mọi gap khác.
   - Màn hình đánh giá gap (`ResearchGapEvaluation`) được nhúng ngay trong thẻ hạn chế, vì danh sách gap trong tab Research Gaps chỉ hiện kết quả của lần phân tích AI gần nhất.

**Quy tắc chống suy diễn:** chỉ trích xuất do người kiểm chứng (`ACCEPTED`) mới được làm nguồn. Hạn chế dựng trên văn bản AI chưa ai kiểm sẽ biến một phỏng đoán thành research gap.

## 3. Đánh giá khả thi

Dùng cho hạn chế (`LIMITATION`) và gap ứng viên (`GAP`). Bảng `project_feasibility_assessments` dùng `target_kind + target_id` theo quy ước polymorphic của dự án.

| Tiêu chí | Câu hỏi |
|---|---|
| Dữ liệu (`data_availability`) | Có dữ liệu, hoặc thu thập được không? |
| Chuyên môn (`expertise`) | Nhóm có đủ kiến thức và kỹ năng không? |
| Tài nguyên (`resources`) | Có đủ máy tính, thiết bị, kinh phí, công cụ không? |
| Thời gian (`timeline`) | Có làm kịp trong thời gian của dự án không? |
| Rủi ro thấp (`risk`) | 5 = rủi ro thấp; 1 = rủi ro chặn hẳn công việc |

- Thang điểm 1–5. **Có điểm 1 hoặc 2 thì bắt buộc ghi chú** (kiểm ở cả service và CHECK trong DB).
- Mỗi thành viên có đúng một phiếu cho mỗi đối tượng; sửa phiếu phải gửi `expectedVersion`. Phiếu của người khác không bao giờ bị ghi đè.
- **Kết luận một phiếu** (`feasibilityVerdict`):
  - có tiêu chí bằng 1 → `NOT_FEASIBLE` (bị chặn);
  - trung bình ≥ 3,5 → `FEASIBLE`;
  - trung bình ≥ 2,5 → `CONDITIONAL`;
  - còn lại → `NOT_FEASIBLE`.
- **Kết luận của nhóm** (`summarizeFeasibility`): lấy trung bình từng tiêu chí qua các phiếu. **Chỉ cần một người chấm 1 ở tiêu chí nào thì tiêu chí đó bị chặn.**
- **Điều kiện mới khi ghi nhận `TEAM_SUPPORTED`:** gap phải có ít nhất một phiếu, và kết luận của nhóm không phải `NOT_FEASIBLE` (`assertFeasibleForSupport` trong `project-gap-research.service.ts`). Các trạng thái đánh giá khác không bị ảnh hưởng.

## 4. API (dưới `/api/v1/projects/:id/research`)

| Method | Path | Mục đích |
|---|---|---|
| GET | `/matrix?status=VERIFIED\|ALL&questionId&theme&q` | Ma trận |
| GET / POST | `/matrix/criteria` | Danh sách / thêm cột |
| PATCH | `/matrix/criteria/:itemId` | Đổi tên, mô tả |
| POST | `/matrix/criteria/:itemId/archive` | Ẩn cột |
| PUT | `/matrix/criteria/order` | Sắp xếp lại cột |
| GET / POST | `/limitations` | Danh sách (kèm trích xuất chưa nhóm) / tạo |
| PATCH | `/limitations/:itemId` | Sửa phát biểu, loại, nguồn |
| POST | `/limitations/:itemId/status` | Loại / mở lại |
| POST | `/limitations/:itemId/promote` | Chuyển thành gap ứng viên |
| GET / PUT | `/feasibility/:targetKind/:targetId` | Xem / lưu phiếu của mình |

Mọi thao tác ghi đều đi qua `withWorkspace` (kiểm quyền thành viên, khóa dự án khi archived), tạo revision (`MATRIX_CRITERION`, `LIMITATION`, `FEASIBILITY`) và activity.

## 5. Dữ liệu và migration

- Migration viết tay: `apps/backend/prisma/migrations/20261107090000_literature_matrix_limitations_feasibility`.
- Bảng mới: `project_matrix_criteria`, `project_limitations`, `project_limitation_sources`, `project_feasibility_assessments`.
- Cột mới: `project_evidence_items.criteria_values`.
- Ràng buộc `project_workspace_revisions_entity_kind_check` được tạo lại với thêm 3 loại.
- ERD: `docs/diagrams/report4/R4_ERD_projects_j.puml` (chưa render `.svg`).

## 6. Kiểm thử

- Unit: `apps/backend/src/modules/projects/__tests__/literature.rules.test.ts` (13 case), `apps/web/src/features/projects/__tests__/literature-matrix-csv.test.ts` (3 case).
- Persistence: `literature-workflow.persistence.test.ts` (6 case), chạy với `LITERATURE_INTEGRATION=1` và một `DATABASE_URL` có tên database kết thúc bằng `_test`.
- Các test persistence có ghi nhận `TEAM_SUPPORTED` đã thêm bước đánh giá khả thi.

## 7. Hiển thị gap do nhóm tạo và deep link

- Tab Research Gaps của dự án có thêm mục **"Gap ứng viên do nhóm đề xuất"**: các gap `origin = HUMAN` (viết tay hoặc chuyển từ hạn chế), lấy qua `GET /api/v1/gaps?projectId=…&origin=HUMAN`. Trước đây tab này chỉ hiện gap của lần phân tích AI gần nhất.
- `?tab=gaps&gap=<id>` mở thẳng ngăn kéo của gap đó (`GET /api/v1/gaps?projectId=…&gapId=…`; vẫn chỉ trong phạm vi dự án mà người dùng là thành viên). Đóng ngăn kéo thì tham số bị xóa khỏi URL.
- Các link cũ tới `/gaps/:id` (route không tồn tại, trước đây trả 404) trong Câu hỏi nghiên cứu và màn hình trích xuất đã chuyển sang dạng link này.

## 8. Hạn chế đã biết

- Việc gom hạn chế do người làm. Chưa có AI gợi ý gom nhóm.
- Sơ đồ ERD `R4_ERD_projects_j.puml` chưa được render ra `.svg`.
