# 07 — Tóm tắt nội dung từng tài liệu

> [01 Tổng quan](01_PROJECT_COMPLETE_OVERVIEW.md) · [02 Luồng](02_PROJECT_ALL_FLOWS.md) · [03 Audit](03_DOCUMENTATION_AUDIT.md) · [04 Việc của tôi](04_MY_DOCUMENTATION_TASKS.md) · [05 Hỏi đáp](05_PROJECT_KNOWLEDGE_QA.md) · [06 Ảnh chụp](06_SCREENSHOT_CHECKLIST.md) · **07 Nội dung tài liệu** · [08 Ký hiệu sơ đồ](08_DIAGRAM_NOTATION_GUIDE.md)
>
> Mục đích: biết **mỗi tài liệu có gì, mục nào nói gì, hình nào ở đâu** để tra nhanh khi giảng viên hỏi. Số liệu theo bản ngày 30/10/2026 trong `Reports_Output/` và `Review2_Output/`.

## Bản đồ tài liệu: tài liệu nào trả lời câu hỏi nào

| Câu hỏi của giảng viên | Mở tài liệu | Mục |
|---|---|---|
| Dự án là gì, vì sao làm, khác gì sản phẩm có sẵn? | Report 1 | §2–§5 |
| Phạm vi gồm gì, không làm gì? | Report 1 | §6.1, §6.2 (LI-01…LI-09) |
| Ai làm gì, bao nhiêu công, rủi ro gì? | Report 2 | §1.1 (WBS), §1.3 (rủi ro), §4 (RACI) |
| Quy trình làm việc, CI, công cụ? | Report 2 | §2.1, §6.2, §6.3 |
| Người dùng là ai, làm được gì? | Report 3 | §2.1 (actor), §2.2 (45 use case) |
| Chức năng X hoạt động thế nào, lỗi gì xảy ra? | Report 3 | §3.2–§3.9 (FR-01…FR-53) |
| Yêu cầu phi chức năng đo thế nào? | Report 3 | §4.2 (19 NFR), BM01 §7 (N1–N5) |
| Quy tắc nghiệp vụ? | Report 3 | §5.1 (BR-01…BR-17) |
| Kiến trúc, công nghệ, triển khai? | Report 4 | §1.1–§1.3 |
| Database thiết kế thế nào? | Report 4 | §2.1–§2.2 (ERD logic ở Report 3 §3.1.5) |
| Thực thể X có những trạng thái nào? | Report 4 | §2.3 (13 state machine) |
| Luồng WF-0x chạy qua những class và bước nào? | Report 4 | §3.1–§3.5 |
| Test cái gì, bao nhiêu, ai làm, ngưỡng đạt? | Report 5 | §1, §3, §4 + 2 workbook |
| Phạm vi đổi gì so với phiếu đăng ký? | BM03 | §2 |
| Tự rà soát phát hiện gì, xử lý ra sao? | BM02 | §3–§4 |
| 5 quyết định thiết kế, 3 rủi ro, gap, tính năng bắt buộc? | BM01 | §3–§8, Phụ lục A |
| Cam kết sau review? | BM04 | toàn bộ |

---

## Report 1 — Project Introduction (12 trang, 3 hình)

| Mục | Nội dung chính |
|---|---|
| I. Record of Changes | 4 dòng: 23–24/09 (tạo, chỉnh feature map), 21/10 (thêm 4 tính năng vào map), 22–23/10 (tách hình, đánh số lại LI) |
| §1.1 Project Information | Tên đề tài, mã FA26SE004, nhóm GFA26SE61, loại phần mềm |
| §1.2 Project Team | GVHD và 5 thành viên kèm email |
| §2 Product Background | Bài toán: tài liệu rải rác, khó xác định gap; quy trình bị chia cắt qua nhiều công cụ. Tiêu đề trang web là "LumiGap - Publication Trend System" |
| §3 Existing Systems | 4 hệ thống: Semantic Scholar, Elicit, ResearchRabbit, Overleaf. Mỗi hệ thống có actor, tính năng, điểm mạnh, hạn chế so với LumiGap; §3.5 bảng so sánh |
| §4 Business Opportunity | Nối khám phá → bằng chứng → gap → dự án → review; hỗ trợ sinh viên; cộng tác học thuật; nền tảng thí điểm cho trường |
| §5 Software Product Vision | Câu tầm nhìn: AI chỉ hỗ trợ, con người quyết định |
| §6 Scope & Limitations | §6.1: 8 nhóm tính năng, **Hình 1(a), 1(b), 2** (feature map; 4 tính năng mới có đánh dấu «new»). §6.2: **LI-01…LI-09** |

**Cần nhớ:** LI-01 (AI chỉ là gợi ý), LI-02 (không đảm bảo bao phủ), LI-05 (không tự phân công reviewer), LI-08 (chỉ thanh toán mua credit qua PayOS).

## Report 2 — Project Management Plan (22 trang, 2 hình)

| Mục | Nội dung chính |
|---|---|
| §1.1 Scope & Estimation | **WBS 284 MD**: 182 software, 30 verification, 50 docs, 12 PM, 10 training. Các nhóm P00, FE-01…FE-08, EX-01, Q00, D00, M00, T00. Bảng "WBS coverage note" liệt kê 6 năng lực có trong code nhưng chưa có dòng WBS. ⚠ 29 dòng chưa có owner |
| §1.2 Project Objectives | Bốn journey chính; bảng chất lượng theo 5 tầng test (review, unit, integration, system, acceptance); mốc tuần 3/6/9/11/12; công suất 300 MD |
| §1.3 Project Risks | 12 rủi ro, mỗi rủi ro có tác động, khả năng xảy ra, cách xử lý |
| §2.1 Project Process | Lặp 6 vòng × 2 tuần, 9 bước. **Hình 1(a)** (bước 1–5) và **Hình 1(b)** (bước 6–9 và phát hành) |
| §2.2 Quality Management | Phòng ngừa, review, unit, integration, system test; CI hiện có |
| §2.3 Training Plan | 5 nội dung đào tạo, điều kiện miễn |
| §3 Deliverables | §3.1: 7 report và trọng số điểm (R1 4%, R2 8%, R3 16%, R4 18%, R5 18%, R6 4%, R7 32%). §3.2: 6 gói mốc phần mềm |
| §4 Responsibility | Ma trận RACI (D/R/S/I) cho 5 người; phân bổ công: Hoàng 0 software, 46 docs, 6 QA |
| §5 Communications | Họp hằng ngày, review PR, review tài liệu hằng tuần, họp GVHD |
| §6 Configuration Mgmt | Quản lý tài liệu, nhánh, PR, CI (`ci.yml`), Jenkins; bảng công cụ §6.3 |

## Report 3 — SRS (khoảng 100 trang, 32 sơ đồ + 35 ảnh màn hình)

| Mục | Nội dung chính | Hình |
|---|---|---|
| §1 Product Overview | Mô tả hệ thống, baseline ca8fe4d, AI chỉ hỗ trợ | **Hình 1** C4 Level 1 (System Context) |
| §2.1 Actors | 9 actor (Guest, User, Lecturer, Gap expert, Project owner/member, Moderator, External reviewer, Admin, External systems) | — |
| §2.2 Use Cases | 45 use case UC-01…UC-45 kèm actor và FR tương ứng | **Hình 2(a)–5**: 7 use case diagram (4 nhóm) |
| §3.1.1 Screens Flow | Luồng màn hình theo route web | **Hình 6(a)–9**: 8 screen flow |
| §3.1.2 Screen Descriptions | 35 dòng: màn hình, route, mô tả | — |
| §3.1.3 Screen Authorization | Ma trận ai vào được màn hình nào | — |
| §3.1.4 Non-Screen Functions | 15 chức năng nền (11 worker, AI Reviewer, webhook, SSE, health) | — |
| §3.1.5 ERD | ERD **logic**: 57 entity, bảng mô tả entity | **Hình 10(a)–14(c)**: 16 ERD |
| §3.2–§3.9 | **53 FR**, mỗi FR gồm: trigger, mô tả (actor, status), screen layout, dữ liệu và kiểm tra, quy tắc, trường hợp thường, ngoại lệ, AC-xx.y, code evidence | **Hình 15–49**: 35 ảnh màn hình (33 FR) |
| §4.1 External Interfaces | 12 giao tiếp (web, OpenAlex, AI, Google, PayOS, SMTP, dịch, storage, GitHub, AI Reviewer, compiler…) | — |
| §4.2 Quality Attributes | 19 NFR theo 4 nhóm: Usability, Reliability, Performance, Security; mỗi NFR có chỉ số, ngưỡng, cách đo, trạng thái | — |
| §5.1 Business Rules | BR-01…BR-17 | — |
| §5.2 Common Requirements | Envelope JSON, Zod, phân trang, hàng đợi, rate limit, optimistic lock, audit, i18n | — |
| §5.3 Messages | Danh sách thông báo lỗi trích từ code | — |
| §5.4 Other Requirements | Các mục chưa xác minh hoặc chưa có, **ràng buộc LI-01…LI-09 → BR/FR**, 8 defect | — |

**Nhóm FR:** 3.2 Tài khoản (FR-01–06) · 3.3 Khám phá (07–13) · 3.4 Report và gap (14–21) · 3.5 Dự án (22–28) · 3.6 AI review (29–30) · 3.7 Credit, thông báo, xếp hạng (31–35) · 3.8 Quản trị (36–39) · 3.9 Cộng đồng, xác minh, review (40–53).

## Report 4 — SDD (163+ trang, 121 hình)

| Mục | Nội dung chính | Hình |
|---|---|---|
| Đoạn mở đầu §II | Viết từ code baseline ca8fe4d, không dùng docs trong repo; chỗ nào không xác minh được thì ghi TBD | — |
| §1.1 System Architecture | Bảng 16 thành phần; 7 luồng dữ liệu F1–F7 | **Hình 1–4**: C4 Level 2 (containers, sidecars, integrations) |
| §1.2 Package Diagram | Gói backend (39 module), web, ai-reviewer; C4 Level 3 | **Hình 5, 11, 12**: package diagram (backend, web, ai-reviewer); **Hình 6–10**: 5 component diagram (C4 L3) |
| §1.3.1 Third-party services | Bảng 1: 13 dịch vụ, dữ liệu gửi đi, biến môi trường | — |
| §1.3.2 Development technologies | Bảng 2: 25 dòng công nghệ và phiên bản | — |
| §1.3.3 SCM & DevOps | Bảng 3: GitHub, nhánh, commit, CI, Jenkins, container | — |
| §1.3.4 Deployment | Bảng 4: local, CI, production (lumigap.uk), staging (TBD) | **Hình 13–14**: deployment Compose và production |
| §1.3.5 AI tools | Bảng 5: công cụ AI dùng khi phát triển (giai đoạn dùng: TBD) | — |
| §2.1 Physical ERD | 190/191 bảng (theo main 016d562), 10 nhóm; câu dẫn chéo sang ERD logic ở R3 | **Hình 15–61**: 47 ERD vật lý |
| §2.2 Table Descriptions | Mô tả bảng của WF-01…05 và bảng lõi | — |
| §2.3 State Machines | 13 sơ đồ, mỗi sơ đồ có bảng "transition evidence" (file, dòng) và ghi chú dead value | **Hình 62–74** |
| §3.1 WF-01 Report | Class, sequence (create, worker), activity, design note | **Hình 75–82** |
| §3.2 WF-02 Gap | Class, sequence (analysis, validation), activity | **Hình 83–91** |
| §3.3 WF-03 Submission/review | Class, sequence (submission, review), activity | **Hình 92–104** |
| §3.4 WF-04 Lecturer verification | Class, sequence, activity | **Hình 105–111** |
| §3.5 WF-05 PayOS | Class, sequence (link, webhook, credit), activity, ghi chú rủi ro | **Hình 112–117** |
| §3.6 Authentication | Sequence: password, refresh, Google OIDC | **Hình 118–121** |

**WF-05 của bạn:** Hình 72 (state PaymentOrder), 112 (class), 113–115 (sequence), 116–117 (activity).

## Report 5 — Test Documentation (11 trang) + 2 workbook

| Mục | Nội dung chính |
|---|---|
| §1.1 In scope | **79 TC** = 3×15 tính năng + 5 workflow + 24 chuyển trạng thái + 5 NFR; bảng theo từng workflow |
| §1.2 Out of scope | Theo LI; chất lượng nội dung AI; các tính năng ngoài 15 tính năng bắt buộc |
| §1.3 Test levels | Unit (127 case, 22 hàm), Integration (73 test trong CI), System/E2E (6 test thủ công), Acceptance |
| §1.4 Constraints | Chưa có staging, chưa có corpus fixture, GAP_VALIDATION chỉ có qua seed, checksum PayOS, Review 2 ngày 05/11 |
| §2 Test Strategy | Loại test, tầng test, công cụ (Vitest, Playwright, pytest, k6) |
| §3 Test Plan | Nhân sự (16/15/19/16/13 TC theo người), môi trường, mốc (11/11, 18/11), tiêu chí vào/ra, quản lý defect, CI |
| §4 Test Cases | Số TC theo người; ma trận truy vết TC ↔ F ↔ FR |
| §5 Test Reports | Chưa có kết quả, sẽ điền sau khi chạy test |
| `Test_Report.xlsx` | 79 TC chia theo sheet WF01…WF05: ID, mô tả, bước, kết quả mong đợi, tiền điều kiện, owner, automation |
| `Unit_Test.xls` | 22 sheet UT01…UT22, 127 case normal/abnormal/boundary |

## BM01 — Design Brief (4 trang + Phụ lục A)

§0 Header (repo, tag `review-2`) · §1 Scope (2 thay đổi, 4 mục ngoài phạm vi) · §2 System at a Glance · §3 **5 quyết định D1–D5** · §4 **3 rủi ro R1–R3** · §5 Known Gaps (6 SR High + G-01…G-06) · §6 **F-01…F-15** kèm tiêu chí chấp nhận · §7 **N1–N5** · §8 Ownership Map · Phụ lục A: A1 **5 workflow**, A2 **10 kịch bản demo** DS-01a…DS-05b, A3 **79 TC** và 24 chuyển trạng thái T01–T24.

## BM02 — Self-Review Report

§1 Thông tin lần chạy (Claude Code, Sonnet 5.5, 21/10, commit ab1a6c5) · §2 Prompt chuẩn (nguyên văn) · §3 **51 finding** SR-01…SR-51: kết quả gốc của AI + Team response (Fixed / Kept / Planned) · §4 5 finding quan trọng nhất. Thống kê: High 17 (11 Fixed, 6 Planned), Medium 28, Low 6.

## BM03 — Record of Changes (phiếu đăng ký)

§1 Thông tin (phiên bản phiếu: TBD) · §2 **2 thay đổi**: (1) thêm 4 tính năng vào feature map, (2) sửa đánh số LI · §3 Quyết định của giảng viên (để trống).

## BM04 — Review 2 Commitment

§1–2 Thông tin, phiếu bản cuối · §3 15 tính năng · §4 5 NFR · §5 Ngoài phạm vi · §6.1–6.5 Cam kết theo từng workflow (owner, actor, trạng thái, TC, demo) · §7.1–7.5 Cam kết từng thành viên (Hoàng ở §7.3: WF-05, 13 TC, RF-12/22/23/24) · §8 Đối chiếu số liệu · §9 **RF-07…RF-30** (việc phải sửa, kèm hạn 04/11, 11/11, 18/11) · §10–11 Kết luận và chữ ký.

## Các con số "phải thuộc"

| Mục | Số |
|---|---|
| Tính năng nhóm / FR / UC / BR / NFR | 8 / 53 / 45 / 17 / 19 (5 NFR cam kết) |
| Tính năng bắt buộc / workflow / kịch bản demo | 15 / 5 / 10 |
| Test case cam kết / tự động / unit case | 79 / 73 (92%) / 127 |
| Database (main 016d562) | 99 migration, 191 model, 190 bảng vẽ ERD, 428 khóa ngoại |
| Worker / module backend | 11 / 39 |
| Hình: R1 / R2 / R3 / R4 | 3 / 2 / 32 + 35 ảnh màn hình / 121 |
| WBS | 284 MD |
| BM02 | 51 finding, 17 High (11 Fixed, 6 Planned) |
