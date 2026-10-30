# 04 — Việc documentation tôi phải làm tiếp

> [01 Tổng quan](01_PROJECT_COMPLETE_OVERVIEW.md) · [02 Toàn bộ luồng](02_PROJECT_ALL_FLOWS.md) · [03 Audit](03_DOCUMENTATION_AUDIT.md) · **04 Việc của tôi** · [05 Hỏi đáp](05_PROJECT_KNOWLEDGE_QA.md) · [07 Nội dung tài liệu](07_REPORT_CONTENT_SUMMARY.md) · [08 Ký hiệu sơ đồ](08_DIAGRAM_NOTATION_GUIDE.md)
>
> Người phụ trách: Nguyễn Đức Hoàng (Requirements & Documentation Lead [R2 §4]). Lập ngày 28/10/2026.
> Danh sách này chỉ gồm việc tài liệu có căn cứ (AU-xx ở [03](03_DOCUMENTATION_AUDIT.md), RF/SR trong BM02/BM04). **Không có việc lập trình hay tự kiểm thử.** Phần cần dev làm nằm ở Nhóm C, dưới dạng "yêu cầu nhóm kỹ thuật cung cấp".
> Mốc chưa biết: **ngày Review 2**. Các hạn cố định đã có: 04/11, 11/11, 18/11/2026 [BM04 §9].

---

## Nhóm A — Làm ngay (ảnh hưởng trực tiếp tới việc nộp Review 2)

| ID | Việc cần làm | Tài liệu liên quan | Ưu tiên | Lý do | Cách thực hiện | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|
| A-01 | **Chốt baseline với Leader:** gắn tag `review-2` ở ca8fe4d (giữ nguyên tài liệu) hay ở HEAD mới của `main` (phải cập nhật tài liệu) | BM01 §0, G-02; mọi Report | **P0** | AU-01: `main` đã thêm PR #56–#66, 97 migration, 191 model; BM01 ghi ca8fe4d là "HEAD of main" | Nhắn Hòa kèm số liệu ở [03 AU-01]. Nếu chọn HEAD mới thì làm thêm A-02 | Có quyết định bằng văn bản (tin nhắn hoặc biên bản) gồm commit được gắn tag |
| A-02 | Nếu baseline mới: cập nhật R3, R4, BM01 theo các thay đổi sau ca8fe4d (trends follow-ups, gap closure calibration, community/trust & safety, project workspace, platform AI connections, 3 bảng mới) | R3 FR-11, FR-21, FR-41, FR-42, FR-22…FR-27; R4 §1.1, §2.1, §2.3; ERD | P0 (có điều kiện) | AU-01 | Xin dev mô tả thay đổi (C-01), rồi giao Claude đối chiếu và soạn bản sửa (D-01). Ghi một dòng vào RoC từng báo cáo | Mọi con số (migration, model, bảng) khớp với commit được tag; RoC có dòng mới |
| A-03 | **Sửa mâu thuẫn FR-18 và F-05** (retry gap tạo bản ghi mới, trừ 30 credit lần nữa) | R3 §3.4.5 | P0 | AU-08; F-05 là tính năng bắt buộc | Hỏi Anh (owner WF-02) xác nhận hành vi đúng, rồi sửa "Function description" và AC của FR-18 cho khớp BM01 | R3 §3.4.5 và BM01/BM04 F-05 mô tả cùng một hành vi |
| A-04 | **Nguồn sơ đồ ở dạng PlantUML hoặc Mermaid** cho 46 sơ đồ chỉ có `.drawio` | `docs/diagrams/report3,4`; R4 §2.3 | P0 | AU-02: [HD mục 03] yêu cầu Mermaid hoặc PlantUML; R4 §2.3 đang ghi sai rằng có `.puml` | Giao Claude (D-02) sinh bản `.puml` tương đương, dùng `_archive/pre_relayout` làm nền cho state và class, rồi kiểm tra là render được. Giữ `.drawio` làm bản vẽ đẹp. Sửa câu trong R4 §2.3 | Mỗi hình trong R3/R4 có một file `.puml` hoặc `.mmd` trong `docs/diagrams/`; câu trong R4 §2.3 đúng |
| A-05 | **Đưa nguồn sơ đồ và docs đã dọn lên `main` qua PR** (đóng SR-38, SR-17) | Nhánh `docs/review2-cleanup`; BM04 RF-13, RF-07 | P0 | AU-03: chưa merge, xung đột 3 file | Nhờ Claude merge `main` vào nhánh docs và giải quyết xung đột (D-03, không đụng `main`). Mở PR rồi nhờ Hòa duyệt và merge (C-02) | PR được merge trước khi gắn tag; `docs/diagrams/` có trên `main`; `wdp-erd.dbml` đã gỡ |
| A-06 | **Cập nhật cột Team response của BM02** cho các mục đã xử lý trong Report v2 | BM02 §3, §4; BM01 R3, §5, G-05; BM04 §9 | P0 | AU-05: nhiều mục "Planned" đã làm xong; BM01 vẫn ghi 6 High mở | Giao Claude đối chiếu từng SR với R1/R3/R4 v2 (D-04). Bạn duyệt từng dòng, đổi thành "Fixed – <mục báo cáo> – <link commit>". **Không sửa cột kết quả AI** | Mỗi SR có response đúng thực tế; các con số High/Planned ở BM01 R3, §5 và BM04 §9 khớp BM02 |
| A-07 | **Chạy lại prompt BM02 trên tag `review-2`** với bản Report cuối | BM02 §1–§4 | P0 (sau A-01, A-05) | AU-04: [HD mục 05] bắt buộc chạy trên tag; giảng viên sẽ chạy lại | Sau khi có tag và bản cuối R3/R4: giao Claude chạy **đúng nguyên văn prompt** (D-05), dán kết quả gốc, ghi công cụ, model, ngày, commit. Sau đó làm lại A-06 cho lần chạy mới. Nhóm quyết định bản cũ đưa vào phụ lục hay thay thế (hỏi C-03) | BM02 §1 ghi đúng tag `review-2`; kết quả gốc không bị chỉnh; mọi finding có Team response |
| A-08 | **Thu phiếu đăng ký đề tài** và hoàn thiện BM03 (số phiên bản hiện hành và đề xuất) | BM03 §1; `…_R2_Registration.pdf` | P0 | AU-06: hồ sơ #1, căn cứ cho mọi hồ sơ khác | Xin Hòa hoặc GVHD file phiếu bản hiện hành (C-04). Điền "Current/Proposed registration version" trong BM03, BM02 §1, BM04 §2 | Có PDF phiếu đề xuất chốt, kèm BM03; các ô version hết TBD |
| A-09 | **Lập Project Tracking** (hồ sơ #2 bắt buộc) | Mới; R2 WBS; BM04 §9 | P0 | AU-06; bản duy nhất là bản nháp PaperLens ngày 21/09 | Dùng template môn (hỏi C-05 nếu không có). Lấy WBS R2 làm khung, cập nhật tiến độ theo [03 §2]; xin số liệu từ issue board hoặc PR (C-06) | File Project Tracking có từng hạng mục WBS, owner, trạng thái, % hoàn thành, mốc và ngày cập nhật |
| A-10 | Sửa các header của BM: Version và Date (21/10 → ngày nộp), BM01 §2 câu về SR-38, BM01 R3 số High mở | BM01 §0, §2, §4; BM02 §1; BM03 §1 | P1 | AU-13 | Sửa sau A-05 và A-06 để con số đúng | Header ghi ngày nộp; không còn câu "to be committed" nếu đã merge |
| A-11 | Chuyển các giới hạn LI-01…LI-09 thành ràng buộc trong SRS (**RF-22, owner Hoàng, hạn 04/11**) | R3 §5.1 hoặc §5.4; R1 §6.2 | P1 | AU-18: R3 chưa có LI nào | Thêm mục "Constraints from Report 1" trong R3 §5.4 (hoặc thêm BR mới), mỗi LI một dòng: LI-xx → BR/FR liên quan hoặc "out of scope". Giao Claude soạn nháp (D-06) | 9/9 LI có mặt trong R3 và dẫn chéo được; BM02 SR-03 và SR-05 đổi thành Fixed |
| A-12 | Đóng **RF-23** (SR-10, SR-50) và **RF-24** (SR-26) của Hoàng ở phần tài liệu | BM04 §7.3, §9; R3 Hình 2–5; R4 §3; R4 §2.3.10 | P1 | Các sơ đồ đã được thay ở bản v2; PaymentOrder đã được mô tả | Ghi bằng chứng (số hình, mục) vào BM02 Team response; với SR-26, xác nhận với nhóm là chọn phương án "chỉ ghi tài liệu" (không implement cancelled/expired) (C-07) | RF-23, RF-24 có bằng chứng; BM04 §9 cập nhật |

## Nhóm B — Hoàn thiện trước khi nộp (chất lượng, thống nhất)

| ID | Việc cần làm | Tài liệu | Ưu tiên | Lý do | Cách thực hiện | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|
| B-01 | Thống nhất tên sản phẩm (bỏ "PaperLens" ở R3 §1) | R3 §1 | P1 | AU-09 | Sửa câu: "The web page title currently reads 'LumiGap - Publication Trend System'" như R1 §2 | Tìm "PaperLens" trong R1–R5 và BM thì chỉ còn trong RoC hoặc BM02 nguyên văn |
| B-02 | Sửa và bổ sung Record of Changes | R1–R4 RoC | P1 | AU-10 | R1: "three PlantUML diagrams (Figures 1(a), 1(b), 2)". R3: thay "Mermaid" bằng "PlantUML/draw.io". Thêm dòng 23/10 và 26/10 vào R2/R3/R4. Ghi tên người phụ trách thay cho "LumiGap team" | Mọi thay đổi đã biết đều có dòng RoC; không còn mô tả sai định dạng |
| B-03 | Đồng bộ Report 2 với Review 2 | R2 §1.2, §2.2, §3, §6.3 | P1 | AU-11 | §1.2: dẫn tới 5 WF của BM01. §2.2: "six integration suites". §3: thêm ngày cố định đã có. Bìa: tháng 10/2026 | R2 không còn mâu thuẫn với BM01 và R5 |
| B-04 | Xin owner cho 29 dòng WBS đang TBD | R2 §1.1 | P1 | AU-11 | Lấy Ownership Map BM01 §8 làm gợi ý, gửi bảng cho Hòa chốt (C-08) | 0 dòng TBD, hoặc ghi rõ lý do |
| B-05 | Thêm chú thích nghĩa của Status trong BM01 §6 và BM04 §3 | BM01 §6 | P1 | AU-12 | Thêm một dòng: "Done = implemented in code at baseline; tests planned" hoặc dùng cùng thang với R3 | Người đọc không hiểu "Done" thành "đã test" |
| B-06 | Dẫn chéo ERD logic trong R4 §2 | R4 §2 (mở đầu) | P1 | AU-15 | Thêm một câu: "The logical ERD is given in Report 3 §3.1.5 (Figures 10–14); this section gives the physical design" | Checklist [HD mục 11] "Logical ERD" trả lời được |
| B-07 | Điền các TBD trong R4 §1.3 | R4 §1.3.3 #04, §1.3.4, §1.3.5 | P1 | AU-17 | Xin thông tin (C-09, C-10, C-11), điền bảng | Không còn TBD, hoặc mỗi TBD có lý do và người chịu trách nhiệm |
| B-08 | Chèn ảnh màn hình cho các FR có giao diện | R3 §3.2–3.9 (48 FR) | P2 | AU-16 | Chụp trên https://lumigap.uk (hoặc staging khi có) bằng tài khoản demo do dev cấp (C-12). Ưu tiên 15 FR của F-01…F-15 trước | 15 FR bắt buộc có ảnh; các FR còn lại có ảnh hoặc ghi "no screen" |
| B-09 | Thống nhất caption: thêm nguồn vào hình R3 như R4 | R3 tất cả hình | P2 | AU-20 | Thêm "(source: diagrams/report3/…)" | 32/32 hình R3 có nguồn |
| B-10 | Giải thích 187 so với 188 trong R4 §2.1–2.2 | R4 §2 | P2 | AU-19 | Một câu nêu bảng không vẽ và lý do (phải đồng ý với nhóm trước cách diễn đạt) | Hai mục khớp nhau |
| B-11 | Thêm mục References và Glossary | R1 (cuối), R3 §5.4, R4 | P2 | AU-23 | Danh sách: 4 hệ thống tham khảo (R1 §3), OpenAlex, C4 model, UML 2.x, các tài liệu môn | Mỗi báo cáo có References; R3 có bảng thuật ngữ |
| B-12 | Cập nhật TOC, xuất PDF đúng tên `SWP490_FA26SE004_R2_<Tên>.pdf` | Tất cả | P0 trước nộp | [HD mục 01, 03, 11] | Mở Word → References → Update Table → Export PDF; xóa chữ hướng dẫn màu xám trong BM; kiểm BM01 ≤4 trang không tính Phụ lục A | Có 4 hồ sơ PDF + Report 1–5 PDF + Project Tracking |
| B-13 | Gom bản cũ vào `D:\K9\_archive\` | §1.4 của [03] | P2 | Tránh nộp nhầm | Chỉ di chuyển, không xóa; giữ một bản hiện hành cho mỗi hồ sơ | Mỗi hồ sơ chỉ còn một file hiện hành ngoài archive |
| B-14 | Bổ sung sơ đồ cho luồng ngoài cam kết (gap closure, manuscript, mentorship, community approval) | R4 §2.3, §3 | P3 (làm nếu còn thời gian, hoặc khi giảng viên yêu cầu) | AU-26; BM02 SR-27, SR-28 | Giao Claude vẽ từ FR trong R3 (D-07) rồi nhờ owner kiểm | Mỗi luồng có ít nhất một state hoặc activity diagram |

## Nhóm C — Yêu cầu nhóm kỹ thuật cung cấp

| ID | Cần gì | Hỏi ai | Dùng cho | Tiêu chí nhận |
|---|---|---|---|---|
| C-01 | Danh sách thay đổi hành vi trong PR #56–#66 (API mới, trạng thái mới, bảng mới, tính năng bỏ đi) | Hòa (#57–#66 nhiều nhất), Khoa (7 commit), Anh, Thanh | A-02 | Mỗi PR có 2–3 dòng "đổi gì, ảnh hưởng FR nào" |
| C-02 | Duyệt và merge PR nhánh docs vào `main`; gắn tag `review-2` | Hòa | A-05, A-01 | PR merged; `git tag review-2` tồn tại |
| C-03 | Quyết định: BM02 lần chạy cũ giữ làm phụ lục hay thay hẳn | Hòa, sau đó GVHD | A-07 | Quyết định rõ ràng |
| C-04 | File phiếu đăng ký bản hiện hành, kèm số phiên bản | Hòa / GVHD Trương Long | A-08 | File .docx hoặc .pdf |
| C-05 | Template Project Tracking của môn (nếu có) | GVHD hoặc trang môn | A-09 | File template |
| C-06 | Số liệu tiến độ thực tế: issue board, giờ làm từng tuần (R2 §1.1 yêu cầu ghi "actual weekly availability") | Hòa và từng thành viên | A-09 | Bảng giờ theo tuần |
| C-07 | Xác nhận phương án SR-26 (PaymentOrder cancelled/expired: chỉ ghi tài liệu hay implement) và SR-22 (trạng thái chết của Submission) | Hòa, Khoa | A-12, R4 §2.3 | Quyết định kèm người làm |
| C-08 | Owner cho 29 dòng WBS | Hòa | B-04 | Bảng owner |
| C-09 | Branch protection có bật không, có bắt buộc CI check không (ảnh chụp cài đặt GitHub) | Hòa | B-07 (R4 §1.3.3) | Ảnh chụp hoặc câu xác nhận |
| C-10 | Hosting provider, nơi đặt PostgreSQL production, kế hoạch staging (host, URL, ngày) | Hòa (owner staging R1/G-01), Thanh | B-07, R4 §1.3.4, R5 §3.2 | Thông tin điền được vào bảng |
| C-11 | Công cụ AI từng người dùng, ở giai đoạn nào (đặc tả, thiết kế, code, test, review) | Cả 5 người | B-07 (R4 §1.3.5), [HD mục 10] | Mỗi người một dòng |
| C-12 | Tài khoản demo và quyền truy cập staging hoặc production để chụp màn hình (không gửi mật khẩu qua tài liệu) | Hòa / Thanh | B-08 | Tài khoản dùng được |
| C-13 | Xác nhận hành vi retry gap (bản ghi mới hay xếp lại bản cũ) | Anh | A-03 | Câu trả lời kèm tên hàm hoặc PR |
| C-14 | Corpus fixture, PayOS test key, tài khoản lecturer thứ hai (dùng cho DS-01…DS-05) | Hòa (G-03), Khoa (DS-03b) | Cập nhật BM01 A2 và BM04 khi xong | Các mục TBD trong DS hết |
| C-15 | Kết quả chạy test (sau 18/11): log CI, số pass/fail, defect | Mỗi owner WF | Report 5 §5, Test Report, Unit Test | Log CI và file kết quả |
| C-16 | **Thống nhất vai trò của Hoàng trong WF-05**: ai viết code test TC-F13…F15 và RF-12 | Hòa và cả nhóm | BM01 §8, BM04 §7.3 | Xem ghi chú bên dưới |

> **Ghi chú C-16 (quan trọng, nhóm phải quyết):** BM01 §8 và BM04 §7.3 đang giao Hoàng viết 13 test case (12 test tự động trong CI) và RF-12 "Add tests…". Đây là việc lập trình, trái với vai trò documentation trong R2 §4 (0 MD software). Mặt khác, hướng dẫn môn yêu cầu **mỗi thành viên sở hữu ít nhất một workflow** [HD 09.1] và tại Defense 1.1 **mỗi thành viên phải mở repo, chỉ ra phần mình sở hữu, chạy test** [HD mục 08]. Có hai hướng để nhóm cân nhắc:
> (a) Hoàng giữ quyền sở hữu WF-05 và phần tài liệu, test case mô tả, kịch bản demo; một dev viết code test và được ghi là "supporting member".
> (b) Đổi Ownership Map.
> Dù chọn hướng nào, BM04 phải ghi đúng người viết từng test, vì [HD mục 08 #5] quy định "mỗi test case chỉ được tính cho một người". Cả hai hướng đều cần GVHD đồng ý.

## Nhóm D — Việc có thể giao Claude hỗ trợ

| ID | Việc | Đầu vào cần có | Đầu ra | Bước tiếp theo |
|---|---|---|---|---|
| D-01 | Đối chiếu tài liệu với baseline mới và soạn bản sửa R3/R4/BM01 | Quyết định A-01 và C-01 | Danh sách chỗ phải sửa kèm đoạn văn thay thế | Bảo Claude: "cập nhật R3/R4 theo baseline <commit>" |
| D-02 | Sinh `.puml` cho 46 sơ đồ draw.io và kiểm tra render | Không cần thêm | 46 file `.puml` cùng SVG để so sánh | Yêu cầu làm trên nhánh `docs/review2-cleanup` |
| D-03 | Merge `main` vào nhánh docs, giải quyết 3 xung đột, đẩy nhánh (không đụng `main`) | Bạn đồng ý cách xử lý từng file | Nhánh docs merge sạch | Duyệt đề xuất xử lý xung đột |
| D-04 | Rà 51 SR: xác định mục nào đã Fixed, kèm bằng chứng (mục, hình) | R1–R4 v2 | Bảng đề xuất Team response | Bạn duyệt từng dòng |
| D-05 | Chạy lại prompt BM02 nguyên văn trên tag `review-2` | Tag đã có | Kết quả gốc + thông tin lần chạy | Sau C-02 |
| D-06 | Soạn mục "Constraints from Report 1" (LI → BR/FR) | R1 §6.2, R3 | Đoạn văn tiếng Anh để dán vào R3 | Duyệt rồi dán |
| D-07 | Vẽ sơ đồ cho các luồng ngoài cam kết | FR trong R3 | `.puml` + PNG | Owner kiểm nội dung |
| D-08 | Soạn khung Project Tracking từ WBS R2 | Template (C-05) nếu có | File .xlsx | Bạn điền số liệu thật (C-06) |
| D-09 | Soạn khung Report 6 (User Guide) theo 5 WF và các màn hình chính | R3 screen flow và FR | Dàn ý và nội dung nháp | Chờ ảnh màn hình (B-08) |
| D-10 | Soạn slide và kịch bản trình bày Design Brief (5 quyết định, 3 rủi ro, các mục Kept/Planned) | BM01, BM02 | Bộ slide | Theo trình tự buổi review [HD mục 07] |
| D-11 | Điền Report 5 §5 và hai workbook từ log test | C-15 | R5 có kết quả | Sau 18/11 |
| D-12 | Chuẩn hóa định dạng: TOC, caption, RoC, xuất PDF | Bản cuối | PDF đúng tên | Ngay trước khi nộp |

---

## Tiến độ (cập nhật 28/10/2026)

| Việc | Trạng thái |
|---|---|
| A-04 Nguồn PlantUML | ✅ 46 file `.puml` đã thêm (23 chuyển từ draw.io, 23 state/class lấy từ nguồn tương đương); render được cả 46; `docs/diagrams` không còn sơ đồ nào chỉ có `.drawio` (chưa commit) |
| A-11 LI-01…LI-09 vào R3 §5.4 | ✅ Xong. BM02 SR-03/SR-05 sẽ cập nhật ở A-06 |
| B-01 Bỏ "PaperLens" trong R3 §1 | ✅ |
| B-02 Record of Changes R1–R5 | ✅ Đã sửa mô tả "Mermaid", thêm dòng 22–23/10, 26/10, 28/10; ô "In charge" là Nguyễn Đức Hoàng |
| B-06 Dẫn chéo ERD logic trong R4 §2 | ✅ |
| Ảnh màn hình R3 | 🟡 35 ảnh / 33 FR đã chèn; còn 15 FR |
| Ngày Review 2 vào R5, BM01 | ✅ 05/11/2026 |

## Lịch cụ thể tới Review 2 (05/11/2026, thứ Năm)

| Ngày | Việc chính | Phụ thuộc |
|---|---|---|
| T4 28/10 – T5 29/10 | Gửi câu hỏi cho Hòa (baseline, phiếu đăng ký, staging, owner, hạn nộp hồ sơ) và cả nhóm (công cụ AI). Làm A-03, A-11, B-01…B-03, B-05, B-06 | — |
| T5 29/10 – T6 30/10 | A-04 (.puml), A-05 (PR nhánh docs). Nếu baseline mới thì A-02 | Câu trả lời của Hòa |
| T7 31/10 – CN 01/11 | A-08 (phiếu + BM03), A-09 (Project Tracking), B-04, B-07, chèn ảnh còn thiếu | Thông tin từ nhóm |
| T2 02/11 | Hòa gắn tag `review-2` → A-07 chạy lại BM02 → A-06 cập nhật Team response | PR đã merge |
| T3 03/11 | A-10 header, A-12; rà chéo con số giữa BM01, BM02, BM04 và R5 | — |
| T4 04/11 | B-12: cập nhật mục lục, xuất PDF, đặt tên đúng; nộp (nếu hạn nộp trước buổi review). Hạn các RF ngày 04/11: RF-13, RF-22, RF-27 | — |
| T5 05/11 | **Review 2.** Ôn [05](05_PROJECT_KNOWLEDGE_QA.md), nhất là phiếu WF-05 | — |
| đến T3 10/11 | BM04 hoàn thiện, có chữ ký (≤3 ngày làm việc sau review) | Biên bản review |

⚠ Hỏi Hòa **hạn nộp hồ sơ** (thường trước buổi review). Nếu hạn sớm hơn 04/11 thì dồn lịch lên.

## Lộ trình đề xuất (tránh làm hai lần)

Nguyên tắc: **chốt baseline trước, sửa nội dung sau, định dạng cuối cùng.** Phần nào phụ thuộc baseline thì không làm trước A-01.

| Bước | Khi nào | Việc | Vì sao theo thứ tự này |
|---|---|---|---|
| 1 | Hôm nay | A-01 (chốt baseline), gửi C-01, C-04, C-16 | Mọi số liệu trong báo cáo phụ thuộc baseline |
| 2 | Ngay sau bước 1 | A-03, A-11, B-01, B-02, B-03, B-05, B-06 | Sửa chữ; không phụ thuộc baseline |
| 3 | Song song | A-04 (D-02), A-05 (D-03 → C-02) | Nguồn sơ đồ phải lên `main` trước khi gắn tag |
| 4 | Sau khi có C-01 | A-02 (D-01) nếu baseline mới | Cập nhật nội dung theo code mới |
| 5 | Sau khi gắn tag | A-07 (D-05) chạy lại BM02 → A-06 (D-04) cập nhật Team response → A-10 header → A-12 | BM02 phải chạy trên bản cuối; BM01 §4–5 lấy số từ BM02 |
| 6 | Song song khi có thông tin | A-08 (phiếu + BM03), A-09 (Project Tracking), B-04, B-07 | Chờ thông tin từ nhóm |
| 7 | Trước nộp 1–2 ngày | B-12: TOC, PDF, đặt tên; kiểm checklist [HD mục 11] | Định dạng làm cuối để không phải làm lại |
| 8 | Sau Review 2 (≤3 ngày làm việc) | Hoàn thiện BM04 theo biên bản | [HD mục 08] |
| 9 | Đến 18/11 | B-08 ảnh màn hình, B-11, B-14, D-09 Report 6 | Ưu tiên thấp hơn hồ sơ Review 2 |
| 10 | Sau khi chạy test | D-11 Report 5 kết quả | Phụ thuộc C-15 |

## Checklist nộp Review 2 (theo [HD mục 11])

- [ ] `SWP490_FA26SE004_R2_Registration.pdf`: phiếu đề xuất chốt kèm BM03 → A-08
- [ ] `SWP490_FA26SE004_R2_Report1…5.pdf` và Project Tracking cập nhật → A-09, B-12
- [ ] Report 4 có sơ đồ kiến trúc, Logical ERD, state machine, activity, bảng công nghệ → B-06, B-07
- [ ] Repo gắn tag `review-2`; Iteration 1 chạy được; CI chạy test tự động → A-01, C-02
- [ ] Sơ đồ ở dạng Mermaid hoặc PlantUML trong repo → A-04, A-05
- [ ] `…_R2_SelfReview.pdf` (BM02): kết quả gốc, thông tin lần chạy, Team response cho mọi mục → A-06, A-07
- [ ] `…_R2_DesignBrief.pdf` (BM01): đủ mục 0–8, ≤4 trang, có Phụ lục A, có link repo → A-10
- [ ] Mỗi thành viên ôn phần mình sở hữu: Hoàng ôn WF-05 → [05](05_PROJECT_KNOWLEDGE_QA.md)
