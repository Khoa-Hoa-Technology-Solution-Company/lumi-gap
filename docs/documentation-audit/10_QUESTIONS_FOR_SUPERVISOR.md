# Câu hỏi cần hỏi giảng viên (chuẩn bị cho Review 2)

> Dựa trên [09_REVIEW1_RESPONSE.md](09_REVIEW1_RESPONSE.md) và checklist Review 2. Ngày soạn: 05/11/2026.
> Mỗi câu hỏi đều nêu trước **hiện trạng** và các **phương án** nhóm đã cân nhắc, để thầy/cô chỉ cần chọn hoặc góp ý thêm. Không hỏi những điều nhóm tự kiểm được trong code.
> Cách dùng: hỏi theo thứ tự ưu tiên (P0 → P2). Ghi câu trả lời vào cột "Trả lời" và cập nhật BM04 trong vòng 3 ngày làm việc.

## P0. Phải chốt trước khi sửa tài liệu

| # | Liên quan | Câu hỏi | Hiện trạng và phương án | Trả lời |
|---|---|---|---|---|
| Q1 | R1-03 Editor | Thầy/cô muốn hệ thống mô phỏng **quy trình tạp chí** (có editor) hay chỉ hỗ trợ **review nội bộ trước khi nộp**? | Code hiện chưa có editor. **(a)** Thêm *handling editor*: nhận bài, desk check, mời reviewer, tổng hợp review, ra quyết định accept / minor / major / reject. **(b)** Không có editor, owner dự án hoặc lecturer mentor là người chốt kết quả review nội bộ. Nhóm nghiêng về (b) vì LumiGap không xuất bản bài | |
| Q2 | R1-03 Editor | Nếu chọn (a): editor là **capability** cấp cho lecturer đã xác minh, hay là một **vai trò theo từng submission** (mỗi bài một editor)? Editor có được tự review bài mình phụ trách không? | Mô hình quyền hiện tại là capability cộng điều kiện xác minh. Nhóm đề xuất cấp theo từng bài để tránh xung đột lợi ích | |
| Q3 | R1-02 Role | Cách gom role hiện tại đã đúng ý thầy/cô chưa: **USER/ADMIN** cộng **vai trò học thuật** (Student/Researcher/Lecturer) cộng **phạm vi** (Internal/External) cộng **trạng thái xác minh** → capability? Hay thầy/cô muốn các **level có tên riêng** (ví dụ Researcher L1/L2/L3)? | Đã bỏ vai trò "expert". Nếu cần level có tên, nhóm sẽ ánh xạ mỗi level sang một tập capability, không đổi code phân quyền | |
| Q4 | R1-01 Cộng đồng | Thành viên **bên ngoài FPTU** được giới hạn đến đâu là hợp lý? | Hiện tại thành viên ngoài được dùng công cụ nghiên cứu, vào dự án khi được mời, nhưng **không được duyệt đóng góp học thuật**. Có cần thêm giới hạn khác (không được tạo dự án, không được làm reviewer) không? | |
| Q5 | R1-00 TBD | Với các mục chưa làm kịp, ghi **"TBD + lý do + ngày dự kiến"** có được chấp nhận không, hay phải **đưa ra khỏi phạm vi** (out of scope)? | Ví dụ: môi trường staging, ảnh mock-up của 48 FR, hosting PostgreSQL | |

## P1. Ảnh hưởng tới phạm vi và thiết kế

| # | Liên quan | Câu hỏi | Hiện trạng và phương án | Trả lời |
|---|---|---|---|---|
| Q6 | R1-04 Quy trình | Thầy/cô muốn nhóm theo **chuẩn quy trình nào** để đặt thuật ngữ và các bước nộp bài? | Nhóm đề xuất: PRISMA 2020 cho screening, CRediT cho đóng góp thành viên, quy trình peer review của COPE. Có chuẩn nào khác thầy/cô hay dùng, hoặc mẫu của FPTU, không? | |
| Q7 | R1-04 Quy trình | Ở **từng bước**, nội dung cần nộp là gì? Nhóm đã hiểu đúng chưa? | Đề xuất: đề cương (câu hỏi nghiên cứu, tiêu chí inclusion/exclusion) → danh sách bài đã screening → bảng synthesis → research gap đã kiểm chứng → bản thảo (PDF) → phản hồi review. Có thiếu bước nào (ví dụ đạo đức nghiên cứu, kế hoạch dữ liệu) không? | |
| Q8 | R1-05 Export | Bỏ export .docx/markdown, thay bằng **LaTeX → PDF** (có đồng bộ GitHub) đã hợp lý chưa? | Có cần hỗ trợ **template của hội nghị hoặc tạp chí cụ thể** (IEEE, Springer LNCS, ACM) không? Có cần cho phép nộp .docx với người không dùng LaTeX không? | |
| Q9 | R1-08 Bản quyền | Mức xử lý bản quyền nào là đủ cho đồ án? | Đề xuất: bài không open access chỉ hiển thị metadata, abstract và link DOI. PDF người dùng tải lên chỉ dùng trong dự án, người tải phải tick xác nhận có quyền. Hiển thị license. Có cần thêm bước gỡ nội dung theo khiếu nại (DMCA-like) cho cả thư viện không, hay chỉ cần ở forum như hiện tại? | |
| Q10 | R1-09 Research gap | Phương pháp kiểm chứng gap (tìm bài phản chứng, cận trên Clopper-Pearson) có **đủ thuyết phục** về mặt học thuật không? Thầy/cô muốn nhóm **đánh giá** nó ra sao? | Các cách có thể làm: (a) so với gap mà chuyên gia tự xác định trên vài chủ đề mẫu; (b) đo precision@k của gap qua phiếu lecturer; (c) kiểm tra lại theo thời gian (gap năm X có bài lấp vào năm X+1 không). Thầy/cô chấp nhận cách nào, và cỡ mẫu tối thiểu bao nhiêu? | |
| Q11 | R1-09 Dữ liệu | Corpus **chỉ dùng OpenAlex** (metadata và abstract, không có full-text) có đủ không, hay cần thêm nguồn khác? | Hiện đã tích hợp một phần Crossref và Semantic Scholar. Nên giới hạn corpus theo **lĩnh vực** nào cho buổi demo? | |
| Q12 | R1-10 LeapSpace | Thầy/cô muốn nhóm học **những điểm cụ thể nào** của LeapSpace? | Ví dụ: luồng tìm cộng sự, không gian dự án, hồ sơ nhà nghiên cứu. Thầy/cô có link tài liệu hoặc bài viết LeapSpace cần đọc không? | |
| Q13 | R1-11 Mendeley | "Quản lý profile theo Mendeley" cụ thể là gì: **thư viện tài liệu cá nhân** (import/export BibTeX/RIS, thư mục, ghi chú) hay **hồ sơ nhà nghiên cứu** (công bố, chỉ số, ORCID)? | Hồ sơ hiện có ORCID, ROR, featured works. Chưa có thư viện cá nhân và chưa nhập công bố từ ORCID. Phần nào là bắt buộc, phần nào có thể ghi là ngoài phạm vi? | |

## P2. Tài liệu và tiêu chí chấm

| # | Liên quan | Câu hỏi | Hiện trạng và phương án | Trả lời |
|---|---|---|---|---|
| Q14 | R1-06 NFR | Các giá trị NFR nên được **chứng minh** bằng gì: đo thực tế (load test, có báo cáo), lấy từ cấu hình, hay viện dẫn giới hạn của dịch vụ? | Hiện các con số lấy từ cấu hình (rate limit, retry, thời hạn token). Thầy/cô cần đo những NFR nào (ví dụ thời gian phản hồi tìm kiếm p95)? | |
| Q15 | Checklist | Checklist yêu cầu "deployment view **và** process view". Process view có thể dùng **activity / sequence của WF-01..05** cộng sơ đồ worker BullMQ, hay cần một sơ đồ process view riêng theo mô hình 4+1? | R4 đã có C4 L2/L3, deployment (Compose và production), sơ đồ tích hợp worker | |
| Q16 | Checklist | ERD vật lý có 187–191 bảng. Thầy/cô muốn **trình bày toàn bộ**, hay chỉ các bảng của luồng chính rồi dẫn sang file schema cho phần còn lại? | R4 §2.2 hiện chỉ mô tả bảng của WF-01..05 và các bảng lõi | |
| Q17 | Checklist | Screen design: dùng **ảnh chụp màn hình thật** thay cho mock-up có được không? Cần ghi đặc tả trường (kiểu, bắt buộc, định dạng) cho **mọi** màn hình hay chỉ màn hình của luồng chính? | 48/53 FR đang ghi "mock-up TBD" | |
| Q18 | Checklist | Mobile (Flutter) kém xa web. Cho buổi review, mobile cần đạt **những luồng nào** để đạt mục "up-to-date Mobile technology"? | Đề xuất: đăng nhập, tìm bài, xem report/gap, nhận thông báo | |
| Q19 | Checklist | Mục "implement and enhance existing solutions": thầy/cô muốn so sánh với hệ thống nào (Elicit, Connected Papers, Scite, LeapSpace, Mendeley…) và theo **tiêu chí** gì? | Nhóm có thể làm bảng so sánh tính năng cộng một thí nghiệm nhỏ về độ liên quan của kết quả tìm kiếm | |
| Q20 | Môi trường | Demo trên **production (lumigap.uk)** có được thay cho staging không? | Hiện chưa có staging; HD 09.2 yêu cầu staging | |

## Ghi chú khi hỏi

- Mang theo bản in hoặc màn hình của [09_REVIEW1_RESPONSE.md](09_REVIEW1_RESPONSE.md) để thầy/cô thấy nhóm đã làm gì trước khi hỏi.
- Nếu thời gian ít, chỉ hỏi **Q1, Q3, Q5, Q9, Q10**: đây là các câu quyết định nhiều việc sửa nhất.
- Câu nào thầy/cô trả lời "nhóm tự quyết" thì ghi lại phương án nhóm chọn và lý do vào BM04.
