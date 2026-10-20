# QA: Đánh giá chất lượng AI — chế độ đọc tham khảo, theo dự án và bối cảnh đọc

Ngày kiểm tra: 2026-10-19. Spec: [2026-10-19-quality-reading-modes.md](../../superpowers/specs/2026-10-19-quality-reading-modes.md).

## Môi trường

- PostgreSQL và Redis chạy bằng Docker (`lumi-gap-postgres-1`, `lumi-gap-redis-1`). Backend (`tsx watch src/server.ts`), `worker:ai-jobs` và web (Vite, cổng 3000) chạy native với code chưa commit trên nhánh `tori-28-refactor-ai-quality-evaluation-function`. Các container backend/worker cũ đều đã dừng sẵn.
- Tài khoản test lấy từ seed: `student@fpt.edu.vn` (chủ dự án "Demo — Large Language Models in Education").
- Trình duyệt trong app, giao diện tiếng Việt.
- **Mô hình LLM:** `gemini-3.1-flash-lite` (mặc định trong `.env`) trả **503 "high demand"** liên tục trong khoảng 22:38–22:47 (4 lần thử, mỗi lần đã có 3 lần retry nội bộ). Vì vậy phần kiểm tra với LLM thật chạy bằng **`gemini-3.5-flash-lite`**, ghi đè qua biến môi trường của tiến trình (`GEMINI_MODEL_FAST/DEEP`), **không sửa `.env`**. Đã thử thêm `gemini-2.5-flash`, model này trả JSON sai schema ở cả lần gọi chính lẫn lần repair (xem lỗi B1). Sau khi kiểm tra xong, backend và worker đã được khởi động lại với cấu hình `.env` gốc.
- Số lần gọi LLM thành công là **8**, vượt mức ~6 dự kiến vì phải chẩn đoán lỗi 503 và lỗi schema: 2 lần `gemini-2.5-flash` qua worker (gọi chính + repair, cả hai sai schema), 1 lần chẩn đoán `gemini-2.5-flash`, 1 lần chẩn đoán `gemini-3.5-flash-lite`, 1 lần tham khảo bài USMLE, 1 lần theo dự án, 2 lần tham khảo bài survey (gọi chính + repair).

## Kết quả theo hạng mục

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Thẻ bối cảnh đọc (trend, số liệu, "Đọc tiếp"), có và không có `?topic=` / `?q=` | **Đạt** |
| 2 | Chế độ tham khảo với LLM thật (bảng facts, mục đích/đối tượng/lưu ý, tiêu chí + hộp thoại chi tiết, trích dẫn) | **Đạt, kèm lưu ý** (B1, B2) |
| 3 | Chế độ dự án (verdict, liên kết kế hoạch, sàng lọc, "Thêm vào dự án" kể cả trường hợp đã thêm) | **Đạt** |
| 4 | Panel đánh giá chất lượng ở báo cáo và khoảng trống | **Đạt** (chỉ kiểm tra hiển thị, không gọi LLM để tiết kiệm quota) |
| 5 | Độ rộng 320 / 390 / desktop và chế độ tối | **Đạt, kèm lưu ý giao diện** (U1) |

### 1. Thẻ bối cảnh đọc — Đạt

- Bài USMLE (`c9cfac77…`) không có tham số: chủ đề lấy từ `paper_topics` ("Artificial Intelligence in Healthcare and Education", 1.729 bài), có đánh dấu năm 2023 trên đường trend, Tăng trưởng +33,0%, CAGR 3 năm +736,3%, Đà tăng 56,65. Mục "Đọc tiếp" có 5 bài với nhãn lý do ("Mới hơn, cùng chủ đề", "Được trích dẫn nhiều, cùng chủ đề").
- `?topic=Artificial Intelligence in Education` chuyển sang đúng chủ đề này ("Chủ đề bạn đang xem khi mở bài này", 1.431 bài). Khớp không phân biệt hoa thường: `?topic=artificial INTELLIGENCE in education` hoạt động.
- `?q=` (hoặc `query=`) không trùng tên chủ đề thì quay về chủ đề của bài (`source: paper_topic`), đúng spec.
- Trang tìm kiếm truyền `?q=` vào link chi tiết bài (`/papers/<id>?q=ChatGPT%20USMLE`). Tab AI của trang trends truyền `?topic=` (đã kiểm tra trong code).
- Thẻ tải ngay khi mở trang, không cần bấm nút và không gọi LLM.
- Ảnh: `01-reading-context-topic-desktop-en.jpg`, `02-reading-context-390-trend.jpg`, `03-reading-context-390-doc-tiep.jpg`, `04-reading-context-320-dark-no-topic.jpg`.

Ghi chú dữ liệu (không phải lỗi code):
- CAGR 3 năm rất lớn (+736%) vì năm gốc chỉ có 1 bài. Năm 2026 chưa hết nên đường trend đi xuống ở điểm cuối. Có thể cân nhắc ghi chú "năm hiện tại chưa đầy đủ" và ẩn CAGR khi năm gốc có quá ít bài.
- Khi có `?topic=`, danh sách "Đọc tiếp" vẫn lấy theo chủ đề của bài (các bài gắn nhãn "Healthcare and Education"), không theo chủ đề được yêu cầu. Spec không bắt buộc điều này, nhưng người dùng có thể thấy không nhất quán với dòng trend phía trên.

### 2. Chế độ tham khảo — Đạt, kèm lưu ý

Đã đánh giá 2 bài: một bài thực nghiệm (USMLE, `c9cfac77…`) và một bài survey (Hallucination survey, `47bff74f…`).

Phần hiển thị hoạt động đầy đủ: tóm tắt → "Thẻ đọc nhanh" (bảng facts, "Xem trích dẫn" mở ra câu trích nguyên văn) → "Đọc bài này để…" (mục đích, đối tượng, lưu ý khi trích dẫn) → các dòng tiêu chí (bấm vào mở hộp thoại "Chi tiết đánh giá của AI" và cuộn tới đúng tiêu chí) → "Bước nên làm trước" → "Xem chi tiết đánh giá". Với bài survey, lần gọi đầu sai cấu trúc nhưng lần repair thành công, nên đường repair hoạt động đúng.

Ảnh: `08-reference-summary-desktop.jpg`, `09-reference-reading-card-quote.jpg`, `10-criterion-detail-dialog.jpg`, `13-reference-survey-390-dark.jpg`, `14-reading-card-survey-390-dark.jpg`.

**Nhận xét chất lượng nội dung LLM (`gemini-3.5-flash-lite`):**

- *Cụ thể, hữu ích:*
  - Kết quả chính của bài USMLE nêu đủ 44% / 42% / 64,4% / 57,8% trên 4 tập dữ liệu, kèm trích dẫn nguyên văn.
  - Thước đo nêu đúng 3 chỉ số định tính.
  - Lưu ý khi trích dẫn ("tóm tắt không nêu giới hạn nào, cần đọc toàn văn") đúng và có ích.
  - Câu hỏi nghiên cứu gợi ý (LLM với tình huống lâm sàng phức tạp ngoài trắc nghiệm) hợp lý.
  - Với bài survey, mô hình nhận ra đây là bài tổng quan, không bịa mẫu hay kết quả, và gợi ý "lập bảng thuật ngữ và phân loại ảo giác", là bước cụ thể.
- *Còn chung chung hoặc mỏng:*
  - Mỗi bài chỉ có 1 hành động và 1 câu hỏi nghiên cứu, dù schema cho phép tới 4 và 3.
  - Bài USMLE chỉ có 1 kết quả chính, bỏ qua các kết quả quan trọng khác cũng có trong tóm tắt (hiệu suất giảm khi câu hỏi khó hơn, P=.01; 100% câu trả lời có lập luận logic).
  - Lý do chọn đối tượng đọc khá chung ("người đã có nền tảng về NLP và LLM").
  - Bài survey bị chấm "Căn cứ cho kết luận" 3/5 vì "không có kết quả thực nghiệm". Với survey, tiêu chí này hơi áp sai.
  - Giá trị "Survey" để nguyên tiếng Anh trong giao diện tiếng Việt.

### 3. Chế độ dự án — Đạt

Chuẩn bị: dự án "Demo — Large Language Models in Education" ban đầu có kế hoạch trống. Kế hoạch được điền qua `PUT /api/v1/projects/:id/plan`, cùng API mà trình soạn kế hoạch gọi (biểu mẫu nhiều bước nên dùng API cho nhanh). Nội dung gồm vấn đề, 2 mục tiêu, 3 câu hỏi nghiên cứu, phạm vi, phương pháp, 2 tiêu chí đưa vào và 2 tiêu chí loại trừ (tiếng Anh). Kế hoạch lên phiên bản 2; 2 tiêu chí tiếng Việt cũ bị thay thế, nhưng vẫn còn trong lịch sử phiên bản.

- Chuyển chế độ "Theo dự án" → bộ chọn dự án hiển thị đúng dự án của người dùng (`05-project-picker-320-dark.jpg`).
- Kết quả (1 lần gọi LLM, vì bản tham khảo đã có sẵn):
  - Verdict **"Bài cốt lõi"** kèm lý do cụ thể.
  - **4 mục kế hoạch** được liên kết: 2 mục tiêu và 2 câu hỏi, mỗi mục có câu trích nguyên văn đúng chỗ. Ví dụ câu hỏi "Does LLM performance drop as question difficulty increases?" được trích tới đúng câu "(P=.01) … AMBOSS-Step1".
  - 1 thước đo tái sử dụng được (3 chỉ số định tính).
  - 1 điểm chưa khớp (dùng bộ câu hỏi chuẩn hóa thay vì bối cảnh lâm sàng).
  - Sàng lọc **"Nên đưa vào"**, trích đúng nguyên văn 2 tiêu chí đưa vào của dự án.
  - Bước đầu tiên: trích xuất dữ liệu độ chính xác.
  - Nội dung bám sát kế hoạch, không chung chung: đây là phần có giá trị nhất.
- "Thêm vào dự án" chuyển thành "Đã thêm vào dự án" và tạo đúng 1 dòng trong `project_papers`.
- Trường hợp đã thêm: tải lại trang thì nút "Thêm vào dự án" vẫn hiện, vì API danh sách dự án không trả về liên kết bài báo (đúng như chú thích trong code). Bấm lại thì backend trả 409, giao diện hiện "Đã thêm vào dự án" cùng toast "Bài báo này đã có trong dự án." và không tạo bản ghi trùng.
- Kết quả đã lưu được tải lại đúng khi chọn lại dự án sau khi tải lại trang.
- Ảnh: `11-project-verdict-desktop.jpg`, `12-project-screening-add.jpg`. Ảnh 12 bị thu nhỏ do lỗi hiển thị của khung trình duyệt; nội dung vẫn đọc được.

### 4. Panel báo cáo và khoảng trống — Đạt

- Báo cáo `5167c4f9…` ("LLM in Education"): panel "Đánh giá chất lượng AI" hiển thị đúng 3 tiêu chí của báo cáo và **không có** công tắc chế độ (đúng spec: chỉ bài báo mới có chế độ đọc). Ảnh `06-report-quality-panel.jpg`.
- Khoảng trống "Lack of Standardized Benchmarking Datasets…" (ngăn kéo chi tiết): panel hiển thị 3 tiêu chí của khoảng trống, không có công tắc chế độ. Ảnh `07-gap-drawer.jpg`.
- Không bấm "Đánh giá chất lượng" ở hai panel này để tiết kiệm quota LLM.

### 5. Độ rộng và chế độ tối — Đạt, kèm lưu ý giao diện

- Ở 320px và 390px không có cuộn ngang (`scrollWidth` bằng `innerWidth`). Chế độ tối hiển thị tốt cho thẻ bối cảnh, thẻ đọc và panel đánh giá.
- **U1 (giao diện, nhẹ):** ở 320px panel AI nằm lồng trong một thẻ khác nên khá chật. Nhãn "Tư vấn AI" bị ngắt thành 3 dòng, "Đọc tham khảo" ngắt thành 3 dòng trong công tắc chế độ, tiêu đề panel ngắt 2 dòng (`05-project-picker-320-dark.jpg`). Ở 390px "Đọc tham khảo" vẫn ngắt 2 dòng (`13-…`). Gợi ý: bỏ bớt viền hoặc padding của thẻ ngoài trên màn hình hẹp, hoặc cho nhãn badge `whitespace-nowrap`.

## Lỗi và rủi ro phát hiện

Trong phiên này **không có sửa đổi code nào**: không thấy lỗi nào vừa rõ ràng vừa chỉ nằm trong một tệp mà nên sửa ngay.

- **B1 (độ tin cậy, quan trọng):** schema đầu ra rất chặt nên toàn bộ lần đánh giá có thể thất bại vì một lỗi nhỏ của mô hình.
  - `gemini-2.5-flash` bỏ trường `criteria[].improvement` ở cả 3 tiêu chí và trả 5 trích dẫn cho một tiêu chí (giới hạn là 4).
  - `gemini-3.5-flash-lite` trả `facts.authorStatedLimitations` dạng object thay vì mảng.
  - Repair chỉ được thử 1 lần. Với `gemini-2.5-flash` cả 2 lần đều hỏng, và người dùng chỉ thấy "AI evaluation is temporarily unavailable".
  - Spec §4 hiện quy định lỗi schema thì repair 1 lần, nên đây là quyết định thiết kế, không phải lỗi code.
  - Đề xuất: chuẩn hóa nhẹ trước khi validate, ví dụ cắt mảng trích dẫn về tối đa 4, bọc object đơn thành mảng, và mặc định `improvement` rỗng thì bỏ qua. Điều này khớp tinh thần "không làm hỏng cả đánh giá vì một mục".
- **B2 (UX/spec):** fact mà mô hình **có** báo cáo nhưng trích dẫn bị loại vì không nguyên văn (mô hình dùng "...") sẽ hiển thị "Không nêu trong tóm tắt". Ví dụ bài USMLE: "Mẫu hoặc dữ liệu" thực tế có ghi trong tóm tắt (AMBOSS, NBME free 120). Cách xử lý đúng theo spec (hạ xuống `not_reported`) nhưng câu chữ gây hiểu sai cho người đọc. Đề xuất: thêm trạng thái hoặc nhãn riêng kiểu "Không xác minh được trích dẫn", cần sửa contract nên thuộc phần điều phối.
- **B3 (chẩn đoán):** khi lỗi không phải `AppError` (lỗi schema, lỗi JSON), `generateValidated` và `qualityJobs.process` đổi thành 503 chung mà **không ghi log nguyên nhân**. Worker log chỉ có "AI job failed … 503", nên phải viết script riêng mới tìm ra lỗi schema ở B1. Đề xuất: `logger.warn` lỗi gốc (issues của Zod) trước khi đổi sang 503.
- **B4 (i18n, nhẹ):** thông báo lỗi "AI evaluation is temporarily unavailable. Please try again." từ backend hiện nguyên tiếng Anh trong giao diện tiếng Việt.
- **B5 (vận hành):** job đánh giá chất lượng dùng `attempts: 1`, có từ commit trước. Khi Gemini quá tải (503), job thất bại ngay sau khoảng 5 giây retry nội bộ, người dùng phải tự bấm lại.
- **Môi trường:** backend chạy native ban đầu trả 500 khi đăng nhập vì thiếu khóa RS256 trong `apps/backend/.keys/`, thư mục mà bản chạy Docker không cần. Khắc phục bằng cách chép `jwt-private.pem` / `jwt-public.pem` từ volume `jwt-keys` của Docker vào `apps/backend/.keys/` (thư mục đã nằm trong `.gitignore`). Cách khác là chạy `pnpm setup`.
- Ngoài phạm vi: ở giao diện tiếng Việt, ô "Ngôn ngữ" của bài báo hiện "VN", trong khi giao diện tiếng Anh hiện "EN" cho cùng bài tiếng Anh. Có vẻ bộ dịch tự động đổi "EN" thành "VN".

## Thay đổi dữ liệu trong `lumi_gap` (DB dev) do phiên kiểm tra

- `research_plans` của dự án `4b4f54fb…`: lên phiên bản 2 với kế hoạch test và tiêu chí tiếng Anh.
- `project_papers`: thêm bài `c9cfac77…` vào dự án `4b4f54fb…`.
- `quality_evaluations`: thêm hoặc cập nhật 2 dòng (bài `c9cfac77…` và `47bff74f…`, `quality-v3.1`, model `gemini-3.5-flash-lite`, tiếng Việt).
- `quality_project_assessments`: 1 dòng (dự án `4b4f54fb…`, bài `c9cfac77…`).
- Không chạy test nào ghi vào `lumi_gap`.

## Tệp ảnh

| Tệp | Nội dung |
|---|---|
| `01-reading-context-topic-desktop-en.jpg` | Thẻ bối cảnh, `?topic=`, desktop (giao diện EN) |
| `02-reading-context-390-trend.jpg` | Thẻ bối cảnh 390px, trend + số liệu |
| `03-reading-context-390-doc-tiep.jpg` | "Đọc tiếp" 390px |
| `04-reading-context-320-dark-no-topic.jpg` | 320px, tối, không tham số |
| `05-project-picker-320-dark.jpg` | Bộ chọn dự án 320px, tối |
| `06-report-quality-panel.jpg` | Panel báo cáo |
| `07-gap-drawer.jpg` | Ngăn kéo khoảng trống |
| `08-reference-summary-desktop.jpg` | Tham khảo: tóm tắt + thẻ đọc |
| `09-reference-reading-card-quote.jpg` | Trích dẫn kết quả chính |
| `10-criterion-detail-dialog.jpg` | Hộp thoại chi tiết tiêu chí |
| `11-project-verdict-desktop.jpg` | Dự án: verdict + mục kế hoạch |
| `12-project-screening-add.jpg` | Dự án: sàng lọc + "Thêm vào dự án" |
| `13-reference-survey-390-dark.jpg` | Bài survey 390px, tối |
| `14-reading-card-survey-390-dark.jpg` | Thẻ đọc bài survey 390px, tối |
