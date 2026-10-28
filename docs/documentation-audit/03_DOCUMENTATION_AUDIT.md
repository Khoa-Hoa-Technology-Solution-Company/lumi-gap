# 03 — Audit toàn bộ hệ thống tài liệu

> [01 Tổng quan](01_PROJECT_COMPLETE_OVERVIEW.md) · [02 Toàn bộ luồng](02_PROJECT_ALL_FLOWS.md) · **03 Audit** · [04 Việc của tôi](04_MY_DOCUMENTATION_TASKS.md) · [05 Hỏi đáp](05_PROJECT_KNOWLEDGE_QA.md)
>
> Ngày audit: 28/10/2026. Chuẩn đối chiếu: hướng dẫn Review 2 [HD], các template báo cáo của môn (`Downloads/Report{2..5}_*.docx`, `SWP490_R2_BM0{1..4}_*.docx`) và đối chiếu chéo giữa các tài liệu với nhau.
> Không đọc source code. Mã phát hiện **AU-xx** được [04](04_MY_DOCUMENTATION_TASKS.md) dẫn lại.

---

## 1. Kiểm kê toàn bộ tài liệu

### 1.1 Bộ hồ sơ chính thức (bản hiện hành)

| STT | Tên tài liệu (file) | Mục đích | Nội dung | Trạng thái | Độ đầy đủ | Cần chỉnh sửa |
|---|---|---|---|---|---|---|
| 1 | Report 1 – Project Introduction (`Reports_Output/LumiGap_Report1_v2.docx`, 12 tr.) | Giới thiệu đề tài, phạm vi | Thông tin dự án, nhóm, bối cảnh, 4 hệ thống tương tự, cơ hội, tầm nhìn, 8 nhóm tính năng (3 hình), LI-01…LI-09 | Bản v2, 21/10 | Đủ mục theo template | Có. Record of Changes ghi "two Mermaid diagrams" sai thực tế (AU-10); trang bìa ghi "September 2026" |
| 2 | Report 2 – Project Management Plan (`…Report2_Project_ManagementPlan_v2.docx`, 22 tr.) | Kế hoạch quản lý | WBS 284 MD, mục tiêu, chất lượng, 12 rủi ro, quy trình lặp (2 hình), đào tạo, deliverables, RACI, truyền thông, quản lý cấu hình, công cụ | Bản v2, 21/10 | Đủ mục; **29 dòng WBS chưa có owner (TBD)**, ngày dd/MM TBD | Có (AU-11) |
| 3 | Report 3 – SRS (`LumiGap_Report3_v2.docx`, 82 tr., 32 hình) | Đặc tả yêu cầu | 9 actor, 45 UC, 8 screen flow, ma trận phân quyền, 15 non-screen function, 14 ERD logic (57 entity), FR-01…FR-53 có AC, 19 NFR, BR-01…BR-17, danh sách thông điệp, defect | Bản v2, baseline ca8fe4d | Rất đầy đủ; **48 FR thiếu ảnh màn hình** ("mock-up TBD") | Có (AU-08, 09, 16, 18) |
| 4 | Report 4 – SDD (`LumiGap_Report4_SDD.docx`, 163 tr., 121 hình) | Thiết kế | C4 L2/L3, deployment, package, khai báo công nghệ (5 bảng), ERD vật lý 187 bảng, 13 state machine, class/sequence/activity cho WF-01…05 và xác thực | Bản đầu, 21–26/10 | Đủ theo [HD mục 03]; một số TBD (staging, hosting, giai đoạn dùng AI) | Có (AU-02, 15, 17, 19) |
| 5 | Report 5 – Test Documentation (`…Report5_Test_Documentation.docx`, 11 tr.) | Kế hoạch kiểm thử | Phạm vi 79 TC, chiến lược, nhân sự, môi trường, mốc, tiêu chí vào/ra, defect, CI, traceability | **Kế hoạch**, 26/10 | Đúng phạm vi giai đoạn; chưa có kết quả (đúng như dự kiến) | Cập nhật sau khi chạy test |
| 6 | Report 5 – Test Report (`…_Test_Report.xlsx`) | Danh sách TC | 79 TC, sheet WF01…WF05, trạng thái "Planned" | Kế hoạch | Đủ trường theo [HD 09.3] | Điền kết quả sau Review 2 |
| 7 | Report 5 – Unit Test (`…_Unit_Test.xls`) | Unit test | 22 hàm, 127 case | Kế hoạch | Đủ | Điền kết quả |
| 8 | BM01 Design Brief (`Review2_Output/…_DesignBrief.docx`) | Tài liệu chính giảng viên đọc trước | Mục 0–8 và Phụ lục A (WF, DS, số TC) | Nháp 1.0, ghi ngày 21/10 | Đủ mục 0–8, 4 trang | Có (AU-01, 12, 13) |
| 9 | BM02 Self-Review (`…_SelfReview.docx`) | Kết quả AI tự rà soát | 51 finding và Team response | Nháp, AI chạy ngày 21/10 trên ab1a6c5 | Đủ cột | Có (AU-04, AU-05) |
| 10 | BM03 Record of Changes (`…_RecordOfChanges.docx`) | Thay đổi phiếu đăng ký | 2 thay đổi | Nháp, ngày 21/10 | Thiếu số phiên bản phiếu hiện hành/đề xuất (TBD) | Có (AU-06) |
| 11 | BM04 Commitment (`…_Commitment.docx`) | Cam kết sau review | 15 F, 5 NFR, 5 WF, 5 thành viên, RF-07…RF-30 | Phần của nhóm đã điền; phần giảng viên/chữ ký trống | Đúng giai đoạn | Điền sau buổi review (≤3 ngày làm việc) |
| 12 | **Phiếu đăng ký đề tài** (`…_R2_Registration.pdf`) | Căn cứ phạm vi cho mọi hồ sơ | — | ⛔ **Không tìm thấy file** | 0% | Phải bổ sung (AU-06) |
| 13 | **Project Tracking** | Hồ sơ #2 bắt buộc cùng Report 1–5 [HD mục 03] | Chỉ có bản nháp `outputs/paperlens-document-drafts/Report3_Project_Tracking_v0.1.xlsx` ngày 21/09, tên PaperLens | ⛔ Chưa có bản hiện hành | ~0% | Phải lập (AU-06) |
| 14 | Report 6 – User Guides | Hướng dẫn sử dụng; cần cho Defense 1.1 [HD mục 08] | — | Chưa bắt đầu | 0% | Lập kế hoạch |
| 15 | Report 7 – Implementation | Cần cho Viva | — | Chưa bắt đầu | 0% | Sau Defense 1.1 |

### 1.2 Tài liệu hỗ trợ và nguồn chuẩn

| STT | Tài liệu | Mục đích | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 16 | `Downloads/SWP490_R2_Huong-dan-chuan-bi-Review-2_1.pdf` | Yêu cầu chính thức của môn | v1.0 (10/2026) | Nguồn chuẩn của audit này |
| 17 | `Downloads/SWP490_R2_BM04_Review2-Document/` (BM01–04 gốc) và `Downloads/Report{2..5}_*.docx/xlsx/xls` | Template gốc | Gốc | Dùng để kiểm cấu trúc |
| 18 | `Reports_Output/TongQuan_HoSo_Review2.docx` | Tài liệu tổng quan để tự học | 26/10 | Trùng một phần với bộ này; bộ này thay thế phần "dự án" |
| 19 | `Reports_Output/DIAGRAM_AUDIT.md`, `DIAGRAM_CHANGELOG.md`, `DIAGRAM_QA_REPORT.md` | Nhật ký sơ đồ | 22–26/10 | Bằng chứng chất lượng sơ đồ |
| 20 | `Reports_Output/Report1/2/3_Audit.md`, `Report4_Notes.md`, `Docs_Cleanup_Report.md` | Nhật ký audit trước | 21–22/10 | Lịch sử; không cần nộp |
| 21 | `Reports_Output/diagrams/` và repo `docs/diagrams/` (nhánh `docs/review2-cleanup`) | Nguồn sơ đồ | 26/10 | **Chưa có trên `main`** (AU-03) |

### 1.3 Tài liệu kỹ thuật trong repo (`docs/`)

| Nơi | Số lượng | Đánh giá |
|---|---|---|
| `main` (28/10) | ~150 file: hướng dẫn, runbook, spec, audit nội bộ (`docs/audits/` mới thêm 22–27/10), ảnh chụp, `wdp-erd.dbml` | Do dev viết, **chưa đối chiếu với code**. Theo quy ước của nhóm thì không dùng làm bằng chứng. Có file lỗi thời (`wdp-erd.dbml` – SR-17), file mang tên cũ, file chứa nội dung ngoài phạm vi |
| `docs/review2-cleanup` | 26 file .md + `docs/diagrams/` | Đã dọn ngày 21–26/10, **chưa merge**; xung đột với `main` (AU-03) |
| `CLAUDE.md`, `README.md` | — | Ngữ cảnh cho AI và dev; dùng tên cũ "Publication Trend System"/WDP301, mô tả nhiều chi tiết không còn đúng. Không phải hồ sơ nộp; chỉ ghi nhận |

### 1.4 Bản trùng lặp và lỗi thời (dễ nộp nhầm)

| Nơi | Nội dung | Kết luận |
|---|---|---|
| `D:\K9\deliverables\` | `LumiGap_Report1..5_Final.*` (20/10) và các PNG/MMD sơ đồ cũ | **Lỗi thời.** BM02 đã chạy trên các bản này |
| `D:\K9\outputs\` | 15 bản Report 3 EN/VI, use case, system context (03–07/10); bản nháp PaperLens v0.1 (21/09) | Lỗi thời |
| `D:\K9\tmp\` | Hàng chục PDF xem trước | Rác tạm |
| `Downloads/LumiGap_Report1/2/3.docx` | Bản gốc của nhóm (20/10) | Giữ để đối chiếu, không nộp |
| `D:\K9\SWP490_R2_*Plan*.docx`, `LumiGap_Plan_Sua_Report1_2_3.docx` | Kế hoạch ngày 20/10 | Đã thực hiện xong; lưu trữ |
| `lumi-gap/docs/reports/Bao_Cao_Hien_Trang_Lumi_Gap_2026-09-22.docx` | Báo cáo hiện trạng (commit 6a379f2, tên PaperLens) | Lỗi thời; nằm trên `main` |

**Đề xuất:** gom mọi bản cũ vào một thư mục `D:\K9\_archive\` (chỉ di chuyển, không xóa) để chỉ còn **một** bản hiện hành cho mỗi hồ sơ. Người dùng tự quyết định.

---

## 2. Tiến độ dự án theo tài liệu (Nhiệm vụ D)

[R2 §2.1] lập kế hoạch 6 vòng lặp 2 tuần (tuần 1–12), mốc M1–M5 ở tuần 3, 6, 9, 11, 12. **Không có ngày kick-off chính thức** ("calendar dates TBD") nên không đối chiếu được mốc theo lịch. Bảng dưới dựng lại tiến độ từ các mốc có ngày trong tài liệu và Git.

| Phase | Mục tiêu | Công việc dự kiến | Kết quả được báo cáo | Bằng chứng | Thay đổi / vấn đề | Tồn đọng | Phụ thuộc |
|---|---|---|---|---|---|---|---|
| **P0. Khởi động và phạm vi** (~12/09–24/09) | Chốt đề tài, phạm vi, kế hoạch | R1, R2, bản SRS đầu | R1 hoàn thành 23–24/09; R2 22/09; R3 nháp 22–23/09 | RoC của R1, R2, R3; commit đầu ngày 12/09 [R4 §1.3.3] | Bản đầu mô tả sai kiến trúc lưu trữ, có nội dung template lạ (BM02 SR-11) | Phiếu đăng ký chưa có trong hồ sơ | P1 |
| **P1. Iteration 1 (phát triển)** (12/09–26/10) | Xây nền tảng và tính năng | WBS FE-01…FE-08 | 179 commit, 43 PR tính tới ca8fe4d; 48 FR Implemented, 5 Partial | [R4 §1.3.3], [R3 §3.2–3.9] (dẫn chứng code) | — | 8 defect [R3 §5.4]; trạng thái "chết"; G-06 | P2 |
| **P2. Chuẩn bị Review 2** (20/10–26/10) | Hồ sơ Review 2 | BM01–04, sửa R1–R4, R5 kế hoạch, sơ đồ | Có đủ bản nháp; BM02 có 51 finding (11/17 High đã Fixed); 133+ sơ đồ | RoC R3/R4, [DIAGRAM_CHANGELOG], BM01–04 | Baseline đổi 3 lần (ab1a6c5 → c006ee1 → ca8fe4d); bỏ nội dung ngoài phạm vi (23/10) | Tag `review-2`; phiếu đăng ký; Project Tracking; PDF; merge nguồn sơ đồ | Buổi Review 2 |
| **P3. Sau baseline** (26/10–28/10) | (Không có trong kế hoạch tài liệu) | — | `main` có thêm PR #56–#66 | [GIT] | **Tài liệu không theo kịp** (AU-01) | Quyết định baseline cho tag | P2 và Review 2 |
| **P4. Review 2 → Defense 1.1** (sau Review 2 đến 18/11 trở đi) | Đạt ngưỡng [HD 09.4] | Staging 11/11; 79 TC + unit test 18/11; RF-07…RF-30 04–18/11; Report 6 | Chưa bắt đầu | [R5 §3.3], [BM04 §9] | — | Toàn bộ | Kết quả Review 2 |
| **P5. Viva** | Bảo vệ chính thức | Report 7, slide, bộ sản phẩm | Chưa bắt đầu | [HD mục 08] | — | — | Defense 1.1 |

**Phân loại trạng thái:**

| Loại | Hạng mục |
|---|---|
| Đã được tài liệu xác nhận hoàn thành | Report 1–4 bản v2; BM01–BM03 bản nháp; kế hoạch test R5; sơ đồ đã qua kiểm tra validator (ERD 0 lỗi so với migration) [DQA]; CI hiện có; production lumigap.uk (theo Jenkinsfile) |
| Báo cáo hoàn thành nhưng chưa đủ bằng chứng | 48 FR "Implemented" và F-07…F-11 "Done": chỉ có dẫn chứng file code, **không có kết quả test** [R5 §5]. Mọi NFR "Implemented" chưa có số đo (N4 còn PROPOSED). 11 finding High "Fixed": sửa trong Word nhưng link commit cho phần nằm trong repo chưa có trên `main` |
| Đang thực hiện | F-01…F-05, F-12…F-15 "In progress" [BM01 §6]; FR-20, 27, 28, 29, 52 Partial; 6 High Planned; 26 Medium + 5 Low Planned |
| Chưa thực hiện | Viết và chạy 79 TC và 127 unit case; staging; corpus fixture; job Playwright trong CI; Report 6, 7; Project Tracking; tag `review-2` |
| Chưa xác định được | Ngày Review 2 và Defense 1.1; ngày kick-off; owner của 29 dòng WBS; hosting provider; staging; giai đoạn dùng công cụ AI; nội dung thay đổi của PR #56–#66; branch protection |

---

## 3. Audit chất lượng (Nhiệm vụ E)

Mức đánh giá: **Đạt**, **Đạt một phần**, **Chưa đạt**. Không chấm điểm số.

### 3.1 Tính đầy đủ (E1)

Đánh giá: **Đạt một phần**

Lý do: Report 3 và 4 đủ mọi mục [HD mục 03] yêu cầu (kiến trúc, ERD, state machine, activity, khai báo công nghệ). Nhưng **3 hồ sơ bắt buộc chưa có** (phiếu đăng ký, Project Tracking, tag) và kết quả test chưa có (đúng giai đoạn).

| ID | Phát hiện | Mức | Bằng chứng |
|---|---|---|---|
| AU-06 | Thiếu phiếu đăng ký (`…_R2_Registration.pdf`), **Project Tracking** và tag `review-2`. BM03 chưa ghi số phiên bản phiếu | **High** | [HD mục 03 #1–2, mục 11]; [BM03 §1 "TBD"]; [BM01 G-02] |
| AU-16 | 48/53 FR trong R3 có "Screen layout: Visual mock-up to be attached … (TBD)", tức thiếu ảnh màn hình | Medium | [R3 §3.2–3.9] |
| AU-18 | R3 không có dòng nào dẫn LI-01…LI-09. Việc SR-03 (chuyển các giới hạn thành ràng buộc trong SRS) **chưa làm**; owner Hoàng, hạn 04/11 | Medium | [BM02 SR-03], [BM04 RF-22] |
| AU-25 | Chưa có Report 6 (cần cho Defense 1.1). Chưa có test nào chạy, chưa có test evidence | Medium (đúng giai đoạn) | [HD mục 08], [R5 §5] |
| AU-26 | Các luồng ngoài cam kết thiếu sơ đồ: gap closure, manuscript, community approval, mentorship/invitation, paper request; không có DFD | Low–Medium | [02 Phần E](02_PROJECT_ALL_FLOWS.md#phần-e--đối-chiếu-luồng--sơ-đồ-trong-báo-cáo); [BM02 SR-27, SR-28] |
| AU-23 | R1–R4 không có mục "References/Tài liệu tham khảo" riêng (R1 chỉ ghi URL ngay trong bài); không có bảng thuật ngữ và viết tắt | Low | Cấu trúc heading của R1–R4 |
| AU-24 | R4 §2.2 chỉ mô tả bảng thuộc WF-01…05 và bảng lõi; các model khác chỉ dẫn tới file Prisma (SR-20 Planned) | Low | [R4 §2.2] |

Traceability: ✅ đã có. R5 §4.2 có ma trận TC ↔ F ↔ FR; mỗi F trong BM01 đều có FR; mỗi WF có activity diagram [BM01 A1].

### 3.2 Tính nhất quán (E2)

Đánh giá: **Đạt một phần**

| ID | Mâu thuẫn | Mức | Vị trí |
|---|---|---|---|
| AU-08 | **Retry gap analysis**: R3 FR-18 viết "Re-queues the caller's own analysis", còn BM01/BM04 F-05 viết "creates a NEW queued analysis (30 credits charged again)". Đây là tính năng bắt buộc, giảng viên có thể hỏi | **High** | [R3 §3.4.5] và [BM01 §6 F-05] |
| AU-09 | Tên sản phẩm: R3 §1 "presented under the PaperLens product name in the web app", còn R1 §2 viết tên trên web là "LumiGap - Publication Trend System" và PaperLens không còn trong code | Medium | [R3 §1], [R1 §2, RoC 21/10] |
| AU-10 | Record of Changes lệch thực tế: R1 RoC ghi "redrew the map as two Mermaid diagrams (Figures 1-2)" nhưng hiện có 3 hình PlantUML; R3 RoC 21/10 ghi "Mermaid" diagrams; R3/R4 thiếu dòng cho đợt sửa 23/10 (bỏ nội dung ngoài phạm vi, kiểm lại ERD) và 26/10 (vẽ lại sơ đồ); R2 thiếu dòng 23/10; nhiều dòng ghi "LumiGap team" thay vì tên người | Medium | RoC của R1–R4; [DCL 23/10, 26/10] |
| AU-11 | Report 2: §1.2 nói "four end-to-end journeys" trong khi BM01 có 5 WF; §2.2 chỉ nhắc "academic-verification integration tests" trong khi R4/R5 ghi 6 bộ; mốc theo tuần (TBD) trong khi BM04/R5 đã có ngày cụ thể 04/11, 11/11, 18/11; bìa ghi "September 2026" | Medium | [R2 §1.2, §2.2, §3] |
| AU-12 | Cột "Status" của BM01 §6 (Done / In progress / Partial) dùng thang khác với R3 (Implemented / Partial / Not found). Ví dụ F-01 "In progress" nhưng FR-14 "Implemented" mà không có chú thích nghĩa của từng mức | Medium | [BM01 §6], [R3 §3.4.1] |
| AU-14 | Vai trò của Hoàng: R2 §4 phân 0 MD software, 46 MD docs; nhưng BM01 §8 và BM04 §7.3 giao Hoàng "Credits/PayOS tests", 13 TC, **RF-12 "Add tests"** (viết code test) | Medium (cần nhóm quyết) | [R2 §4], [BM01 §8], [BM04 §7.3, §9] |
| AU-19 | R4 §2.1 ghi "187 application tables", §2.2 ghi "188 models". Cần một câu giải thích thống nhất vì sao chỉ vẽ 187 bảng | Low | [R4 §2.1–2.2] |
| AU-20 | Caption hình R4 có ghi nguồn "(source: diagrams/…)", caption R3 thì không; trong R4, các ERD và sequence dẫn `.puml` còn state, class và C4 dẫn `.drawio` | Low | [R3 §2–3], [R4] |
| — | Thuật ngữ actor: BM01 dùng "Researcher", R3 dùng "User (Student / Researcher)". Chấp nhận được, nhưng nên có một câu định nghĩa trong BM01 | Low | [BM01 §6], [R3 §2.1] |

Phạm vi dự án và phạm vi triển khai: ✅ được tách rõ. R1 §6 ghi "does not claim that every feature is complete"; R5 §1.2 tách rõ những gì ngoài 79 TC.

### 3.3 Tính chính xác (E3)

Đánh giá: **Đạt một phần**

Điểm mạnh: R3 và R4 dẫn chứng tới từng file và dòng code. ERD được validator đối chiếu với 93 migration (0 lỗi) [DQA cập nhật 23/10]. C4 có đủ L1 (R3), L2, L3 và deployment (R4).

| ID | Phát hiện | Mức | Bằng chứng |
|---|---|---|---|
| AU-01 | **Lệch baseline.** Mọi tài liệu mô tả ca8fe4d và BM01 ghi "tag to be created at commit ca8fe4d, HEAD of main". Ngày 28/10, `main` đã ở **6b3d84a**: thêm 11 PR (#56–#66), 341 file đổi, migration 93→**97**, model 188→**191**, bảng mới `platform_ai_connections`, `trend_topic_follows`, `project_trend_snapshots`; cột mới ở `research_gaps`, `closure_calibrations`, `gap_closure_checks`. Các vùng đổi: trends, gap closure, communities/admin trust & safety, project workspace, AI connections dùng chung cho cả platform | **High** | [GIT: `git log ca8fe4d..origin/main`, `git diff --stat`] |
| AU-02 | **Định dạng nguồn sơ đồ không đúng yêu cầu.** [HD mục 03] yêu cầu "Sơ đồ được lưu dưới dạng mã nguồn (Mermaid hoặc PlantUML) trong repo". 46/65 sơ đồ draw.io **không có** bản `.puml`: 13 state machine, 11 C4, 3 package, 10 class (R4); C4 L1 và 8 screen flow (R3). R4 §2.3 còn ghi "Diagrams are also kept as PlantUML sources R4_State_*.puml", **không đúng** (các file `.puml` đó đã chuyển vào `_archive/pre_relayout`) | **High** | `docs/diagrams/report3,4`; [R4 §2.3]; [DCL 26/10] |
| AU-03 | Nguồn sơ đồ chưa có trên `main` (SR-38 vẫn mở). Nhánh `docs/review2-cleanup` **xung đột** với `main` ở 3 file (`docs/gap-closure-protocol.vi.md`, `docs/project-submissions.md`: modify/delete; `docs/rag-implementation.md`: nội dung). `wdp-erd.dbml` vẫn còn trên `main` (SR-17) | **High** | [GIT merge-tree], [BM04 RF-07, RF-13] |
| AU-04 | BM02 chạy trên **ab1a6c5** với các bản Report "Final" cũ trong `deliverables/`, trong khi [HD mục 05 bước 1] yêu cầu chạy "trên đúng phiên bản gắn tag `review-2`". Giảng viên sẽ chạy lại prompt để đối chiếu | **High** | [BM02 §1, §3 phần "Cannot be verified"], [HD mục 05] |
| AU-05 | Cột Team response của BM02 đã cũ: nhiều mục ghi "Planned" nhưng có dấu hiệu đã xử lý trong R1/R3/R4 v2. Ví dụ SR-02 (đã thêm 4 tính năng vào R1), SR-05 (LI đã liên tục), SR-08 (actor R3 §2.1), SR-10 (UC diagram mới), SR-16 (ERD có thuộc tính), SR-26 (R4 §2.3.10 đã mô tả pending/paid và dead values), SR-27 (state Project), SR-40, SR-43, SR-50 (C4/package/class/sequence mới). BM01 R3 và §5 vẫn ghi "6 High open". Cần kiểm từng mục rồi cập nhật thành Fixed kèm link. Theo [HD mục 05] chỉ cột Team response được sửa | **High** | [BM02 §3], [R4 §1.1, §1.2, §2.3], [R3 §2] |
| AU-07 | Không có staging, trong khi [HD 09.2] yêu cầu "Demo chạy trên môi trường staging đã khai báo trong Report 4". R4 §1.3.4 #04 ghi TBD | **High** | [R4 §1.3.4], [BM01 R1] |
| AU-15 | Checklist [HD mục 11] ghi "Report 4 có sơ đồ kiến trúc, **Logical ERD**, …". R4 chỉ có **Physical** ERD; ERD logic nằm ở R3 §3.1.5. Cần ít nhất một câu dẫn chéo trong R4 §2, hoặc đưa ERD logic vào | Medium | [HD mục 11], [R4 §2.1], [R3 §3.1.5] |
| AU-17 | R4 §1.3.5 khai báo công cụ AI nhưng cột "Usage stage" là TBD, trong khi [HD mục 03, mục 10] yêu cầu khai báo giai đoạn sử dụng. §1.3.3 #04 (branch protection) và §1.3.4 (hosting provider, host PostgreSQL) cũng TBD | Medium | [R4 §1.3.3–1.3.5] |
| AU-13 | BM01, BM02, BM03 đều ghi "Version 1.0 (draft)" và "Date 21/10/2026", dù nội dung đã cập nhật tới 26/10. BM01 §2 vẫn viết "diagram sources to be committed (SR-38)" | Medium | Header của BM01–03 |
| — | Mức độ khẳng định: R3/R4 tự phân biệt "Implemented" với "test TBD" và ghi rõ TBD. **Không thấy khẳng định quá mức nào so với bằng chứng.** Riêng BM01 "Done" có thể bị hiểu là đã test (AU-12) | — | — |

### 3.4 Chất lượng học thuật và trình bày (E4)

Đánh giá: **Đạt một phần**

| Tiêu chí | Đánh giá | Nguyên nhân |
|---|---|---|
| Văn phong | Đạt | Tiếng Anh kỹ thuật, câu ngắn, đúng [HD] "Tài liệu viết bằng tiếng Anh" |
| Cấu trúc | Đạt | Đúng heading của template R3/R4/R5 (đã đối chiếu với `Downloads/Report*_*.docx`) |
| Sơ đồ dễ đọc | Đạt một phần | Cỡ chữ ≥7 pt cho cả 130 hình, 27 hình dưới 8 pt; nhãn công nghệ trong C4 chỉ khoảng 4,5 pt [DQA §3–4] |
| Bảng biểu | Đạt | Có tiêu đề, cột rõ |
| Thuật ngữ Anh/Việt | Đạt một phần | Một số thông điệp lỗi trong code là tiếng Việt không dấu, R3 có ghi chú (chấp nhận được); tên sản phẩm lệch nhau (AU-09) |
| Nguồn tham khảo | Chưa đạt | Không có mục References riêng (AU-23) |
| Đánh số và dẫn chiếu | Đạt một phần | Hình được đánh số, có dẫn trong bài; R3 thiếu nguồn trong caption (AU-20); TOC phải cập nhật lại trước khi xuất PDF |
| Phù hợp yêu cầu môn | Đạt một phần | Thiếu hồ sơ (AU-06), sai định dạng nguồn sơ đồ (AU-02), BM02 chưa chạy trên tag (AU-04), chưa có staging (AU-07) |

---

## 4. Tổng hợp phát hiện theo mức độ

| Mức | Phát hiện |
|---|---|
| **High (phải xử lý trước khi nộp Review 2)** | AU-01 lệch baseline · AU-02 định dạng nguồn sơ đồ · AU-03 nguồn sơ đồ chưa có trên main / xung đột merge · AU-04 BM02 chưa chạy trên tag · AU-05 Team response BM02 đã cũ · AU-06 thiếu phiếu đăng ký, Project Tracking, tag · AU-07 chưa có staging · AU-08 mâu thuẫn FR-18 và F-05 |
| **Medium** | AU-09 tên sản phẩm · AU-10 Record of Changes · AU-11 Report 2 · AU-12 thang trạng thái · AU-13 header BM · AU-14 vai trò Hoàng · AU-15 Logical ERD trong R4 · AU-16 ảnh màn hình · AU-17 TBD trong R4 · AU-18 SR-03 · AU-25 Report 6 |
| **Low** | AU-19 · AU-20 · AU-23 · AU-24 · AU-26 · dọn bản cũ (§1.4) |

Chi tiết cách xử lý từng mục có trong [04_MY_DOCUMENTATION_TASKS.md](04_MY_DOCUMENTATION_TASKS.md).
