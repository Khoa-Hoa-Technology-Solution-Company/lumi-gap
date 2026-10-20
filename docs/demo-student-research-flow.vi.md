# Kịch bản demo: luồng nghiên cứu chính của sinh viên

> Dựa trên `main` tại commit `1a41567` (14/10/2026). Thời lượng đề xuất: **12–15 phút**.
> Câu chuyện xuyên suốt: *một sinh viên có một câu hỏi nghiên cứu → tìm tài liệu → gom vào project → sàng lọc → tìm research gap có bằng chứng → sinh báo cáo/đề cương → xin giảng viên review → nộp bản thảo.*

---

## 0. Chuẩn bị trước buổi demo

### Hạ tầng

```bash
pnpm docker:infra
```

```bash
pnpm dev:backend
```

```bash
pnpm dev:web
```

Các worker cần chạy (mỗi lệnh một terminal):

| Worker | Dùng cho bước |
|---|---|
| `pnpm --filter backend worker:report` | Sinh artifact/báo cáo (bước 7) |
| `pnpm --filter backend worker:gaps` | Phân tích research gap (bước 6) |
| `pnpm --filter backend worker:ai-jobs` | AI pre-review bản thảo (bước 9) |
| `pnpm --filter backend worker:embedding` | Chỉ cần nếu có paper mới chưa có embedding |

Bước 9 còn cần service `ai-reviewer` (port 8001) đang chạy.

Kiểm tra: `http://localhost:4000/ready` phải trả về OK, web chạy ở `http://localhost:3000`.

### Dữ liệu

- Corpus phải có sẵn paper (đã ingest OpenAlex và có embedding). Nếu không có, semantic search sẽ trả về rỗng.
- Seed demo là tùy chọn: `docker compose --profile seed up seed`. Seed tạo các tài khoản:
  - Sinh viên: `student@fpt.edu.vn` (Tran Thi B)
  - Giảng viên: `lecturer@fpt.edu.vn` (Dr. Nguyen Van A)
  - Mật khẩu xem trong `apps/backend/prisma/seed.ts`.
- Mỗi user mới có `INITIAL_USER_CREDITS` (mặc định 1000 credit), đủ cho cả buổi demo.

### Nên làm sẵn để demo không phải chờ

1. Một project **“LLM trong giáo dục đại học”** với **ít nhất 5 paper**, trong đó **≥ 3 paper đã đánh dấu INCLUDED**. Phân tích gap cần tối thiểu 3 paper được duyệt.
2. Một **báo cáo đã ở trạng thái `ready`** trong project, để dự phòng khi worker chạy chậm.
3. Một **gap analysis đã chạy xong**, để có sẵn thẻ gap kèm điểm corpus evidence.
4. Đăng nhập sẵn tài khoản giảng viên ở một cửa sổ ẩn danh khác (bước 8).
5. Một file PDF bản thảo mẫu (≤ 10 MB) cho bước 9.

> Mẹo: chạy thử toàn bộ một lần với cùng câu hỏi trước buổi demo. Kết quả LLM được cache 7 ngày, nên lần chạy thật sẽ nhanh hơn. Credit bị trừ cho lần cache hit sẽ được hoàn lại.

---

## Bảng credit (để giải thích khi được hỏi)

Nguồn: `apps/backend/src/modules/credits/credit-policy.ts`

| Hành động | Credit |
|---|---|
| Semantic search, xem trend | 0 |
| AI Rerank kết quả tìm kiếm | 5 |
| Báo cáo Fast / Standard / Deep (MCP) | 20 / 50 / 100 |
| Phân tích research gap | 30 |
| Sinh hướng nghiên cứu (directions) | 15 |
| 1 tin nhắn chat AI trong project | 1 |
| AI review bài báo (key hệ thống / key cá nhân) | 10 / 3 |
| Kiểm tra format | 2 |

---

## Kịch bản từng bước

### Bước 1 — Đăng ký, xác minh email, onboarding (≈1 phút)

**Màn hình:** `/register` → `/verify-email` → `/onboarding/academic-profile` → `/home`

- Có thể đăng ký bằng email cá nhân, email FPT hoặc email của trường khác.
- Onboarding gồm 3 bước:
  1. Chọn trường (FPT University) và vai trò **Student**.
  2. Chọn ngành/chương trình học.
  3. Chọn Research Areas (bắt buộc) và Research Interests (tùy chọn).
- **Điểm cần nói:** xác minh email là điều kiện duy nhất để dùng các công cụ nghiên cứu. Route `ResearchWorkflowRoute` chặn user chưa xác minh email và chuyển về `/verify-email`. Xác minh FPT là tùy chọn và không chặn tính năng nào.

> Để tiết kiệm thời gian: chỉ lướt qua màn onboarding, sau đó đăng nhập bằng tài khoản `student@fpt.edu.vn` đã seed.

### Bước 2 — Tìm tài liệu bằng semantic search (≈2 phút)

**Màn hình:** `/home` → `/literature?q=...`

1. Gõ vào ô tìm kiếm ở trang Home: *“large language models for personalized feedback in higher education”*.
2. Chọn chế độ **Semantic**, sau đó so sánh với **Keyword** cho cùng câu hỏi.
3. Mở **Filters**: năm 2020–2026, Open Access.
4. Bật **AI Rerank** (5 credit) để xếp lại top kết quả theo mức liên quan.
- **Điểm cần nói:**
  - Semantic search dùng embedding Gemini 768 chiều trên pgvector, kết hợp hybrid retrieval.
  - Bản thân việc tìm kiếm **không gọi LLM**. LLM chỉ chạy khi người dùng chủ động bật Rerank.
  - Điều này đúng nguyên tắc thiết kế: không gọi LLM bên trong search request.

### Bước 3 — Xem chi tiết paper (≈1,5 phút)

**Màn hình:** `/papers/:id`

- Xem metadata, tác giả, venue, số citation, References và Related works (lấy từ OpenAlex và từ độ tương đồng embedding).
- Bấm **Translate** để dịch abstract sang tiếng Việt.
- Bấm **Compare** để so sánh paper này với một paper khác.
- Bấm **Bookmark**, sau đó **Add to project** và chọn project “LLM trong giáo dục đại học”.

### Bước 4 — Xem xu hướng chủ đề (≈1 phút, có thể bỏ nếu thiếu thời gian)

**Màn hình:** `/trends` → `/trends/:topic`

- Biểu đồ số công bố và citation theo năm, top tác giả, venue và subfield.
- **Điểm cần nói:** phần trend được tính xác định từ dữ liệu corpus (0 credit), không do AI “bịa” ra.

### Bước 5 — Project workspace: gom và sàng lọc tài liệu (≈2 phút)

**Màn hình:** `/projects` → `/projects/:id?tab=papers`

Project có 8 tab, chia làm 2 nhóm:

- **Research workspace:** Literature, Research Gaps, Artifacts, Submissions
- **Collaboration:** Members, Academic Support, Contributions, Chat

Các thao tác trong tab **Literature**:

1. **Add papers** từ ba nguồn: tìm trong corpus, chọn từ bookmark, hoặc nhập DOI.
2. Mở **Screening criteria** và nhập tiêu chí, mỗi dòng một tiêu chí:
   - Inclusion: *“Nghiên cứu thực nghiệm ở bậc đại học”*
   - Exclusion: *“Chỉ là bài ý kiến (opinion), không có dữ liệu”*
3. Chọn một paper:
   - đánh dấu **INCLUDED**;
   - đổi reading status sang *Reading* hoặc *Reviewed*;
   - viết **Project notes** (các thành viên trong project đều đọc được).
4. Với một paper khác, chọn **Exclude** và ghi lý do loại.
5. Chọn 2–3 paper rồi bấm **Compare selected** để AI so sánh findings, methods và outcomes.
- **Điểm cần nói:** đây là quy trình sàng lọc tài liệu kiểu systematic review, gần với cách nghiên cứu sinh viên làm thật.

### Bước 6 — Tìm research gap có bằng chứng (≈2,5 phút) ⭐ điểm nhấn

**Màn hình:** `/projects/:id?tab=gaps` → **New Gap Analysis**

1. Nhập **Research topic** và khoảng năm.
2. Bấm **Review Evidence**. Bước xem trước này **miễn phí**.
3. **Bước 2: Review evidence.** Hệ thống liệt kê các paper sẽ được dùng làm bằng chứng.
   - Xóa những paper khớp yếu.
   - Thêm paper còn thiếu (từ project hoặc bằng hybrid search trên corpus).
4. Bấm **Analyze N Reviewed Papers** (30 credit; nếu lỗi hoặc cache hit thì được hoàn credit). Job được đưa vào hàng đợi BullMQ, giao diện hiện trạng thái *Queued*, rồi *Analyzing*.
5. Mở một thẻ gap trong kết quả (nên dùng gap đã chạy sẵn):
   - **Corpus evidence score**: đo mức độ hiếm của phần giao giữa hai chủ đề trên **toàn bộ corpus LumiGap** và cho biết chủ đề cha có đang tăng hay không. Điểm này **không phải** độ tự tin do AI tự báo.
   - Nhãn **Confirmed by corpus**, **Weak corpus evidence** hoặc **AI-only from report**. Mẫu nhỏ thì hiện *Low sample*; không đủ dữ liệu thì *Insufficient data*.
   - Các mục *Why this gap exists*, *Rationale* và danh sách supporting papers.
   - Trạng thái **CANDIDATE**. Muốn thành **VALIDATED** cần **2 chuyên gia** (giảng viên) xác nhận tại `/research-gaps/validation`.
- **Điểm cần nói:** đây là phần trả lời trực tiếp câu hỏi nghiên cứu của đề tài. Gap được neo vào bằng chứng truy xuất và chấm điểm trên corpus, chứ không phải LLM tự nghĩ ra.

### Bước 7 — Từ gap sinh đề cương / báo cáo RAG (≈2 phút)

**Màn hình:** drawer của gap → **Draft research proposal** → tab **Artifacts**

1. Bấm **Draft research proposal**. Form *Create AI Report* mở ra, đã điền sẵn topic, câu hỏi và loại artifact. Bằng chứng mặc định giới hạn trong các paper của gap.
2. Chọn **Artifact type**. Có 6 loại: Literature review, Evidence synthesis, Gap analysis, Research proposal, Research plan, General report.
3. Chọn **Report language**: Vietnamese.
4. Chọn **Fast Mode** (20 credit) cho demo. Nhắc thêm rằng **Deep Analysis** (100 credit) dùng MCP tools.
5. Bấm **Create**. Báo cáo chuyển từ `pending` sang `ready`. Trong lúc chờ, mở báo cáo đã chuẩn bị sẵn.
6. Trong `/reports/:id`, trình bày:
   - **Executive Summary**;
   - **Identified Research Gaps**;
   - **Source evidence used for this report**: các đoạn trích được lưu tại thời điểm sinh báo cáo, nên có thể truy ngược từng nhận định về paper gốc;
   - nhãn **AI-generated draft**, đánh giá sao, và in/xuất bằng nút Print.
- **Điểm cần nói:** đây là pipeline RAG: retrieve → rerank → generate có trích dẫn. Kết quả LLM được cache theo khóa `llm:<task>:<promptVersion>:<hash>`.

### Bước 8 — Giảng viên hướng dẫn và review (≈1,5 phút)

**Phía sinh viên:**

1. Ở tab **Artifacts**, bấm **Submit for Review**, chọn review template, chọn giảng viên và hạn review. Artifact chuyển sang trạng thái *Reviewing* và bị khóa chỉnh sửa trạng thái.
2. *(Tùy chọn)* Ở tab **Academic Support**, hoặc trên trang hồ sơ giảng viên tại `/lecturers`, bấm **Invite as Mentor**.

**Phía giảng viên** (chuyển sang cửa sổ đã đăng nhập sẵn):

3. Vào `/reviews` (Review Center), mở request, chấm theo template và gửi feedback.

**Quay lại phía sinh viên:**

4. Bấm **View feedback**. Khi review đã hoàn tất, có thể đổi trạng thái artifact sang **Final**.
- **Điểm cần nói:**
  - Review chính thức yêu cầu người review là Lecturer đã xác minh vị trí **và** có ReviewerAssignment hợp lệ.
  - Sinh viên và researcher chỉ góp ý thông thường, không thực hiện review chính thức được.

### Bước 9 — Nộp bản thảo và AI pre-review (≈1 phút)

**Màn hình:** `/projects/:id?tab=submissions` → **New submission**

1. Upload file PDF bản thảo.
2. Bấm **AI pre-review**. Job chạy qua worker `ai-jobs` và service `ai-reviewer`. Kết quả gồm *Goal alignment*, các claim chưa có bằng chứng, *Human review focus* và *Analysis limitations*.
3. Trình bày việc **Upload a new PDF version** kèm *Revision summary* để theo dõi lịch sử chỉnh sửa.
- *(Tùy chọn)* Chỉ ra hai công cụ độc lập trên menu Paper Tools: `/papers/format-check` (2 credit) và `/papers/review` (AI Review).

### Bước 10 — Kết (≈30 giây)

- Chat AI trong project (tab **Chat**, 1 credit/tin): hỏi một câu dựa trên các paper đã gom.
- Forum và Communities: chia sẻ một gap ra cộng đồng (chỉ nhắc qua).
- Chốt lại vòng nghiên cứu: **Search → Collect & Screen → Gap (có bằng chứng) → Artifact RAG → Review → Submission.**

---

## Phương án dự phòng

| Sự cố | Cách xử lý |
|---|---|
| Worker chậm hoặc Gemini hết quota | Mở báo cáo hoặc gap đã chạy sẵn. Credit được hoàn khi job lỗi |
| Search trả về rỗng | Corpus chưa có embedding: chạy `worker:embedding`, hoặc chuyển sang chế độ Keyword |
| Bị chuyển về `/verify-email` | Tài khoản chưa xác minh email: dùng tài khoản seed |
| Nút **Analyze** bị khóa | Chưa đủ 3 paper trong evidence pack, hoặc đang có một analysis khác chạy |
| Không có nút **Submit for Review** | Báo cáo chưa ở trạng thái `ready`, hoặc artifact đã Archived |
| Không hiện **Final** | Chưa có review nào hoàn tất |
| Project ở trạng thái Archived | Chỉ đọc, không tạo submission hay báo cáo mới được |

## Checklist 5 phút trước demo

- [ ] `/ready` OK; worker report, gaps, ai-jobs đang chạy; `ai-reviewer` đang chạy
- [ ] Tài khoản sinh viên còn ≥ 300 credit
- [ ] Project demo có ≥ 3 paper INCLUDED, 1 báo cáo `ready`, 1 gap analysis đã xong
- [ ] Cửa sổ giảng viên đã đăng nhập sẵn
- [ ] File PDF mẫu đã để sẵn trên desktop
- [ ] Giao diện đặt sang tiếng Việt (nếu trình bày bằng tiếng Việt)
