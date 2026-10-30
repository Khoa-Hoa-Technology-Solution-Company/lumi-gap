# 05 — Bộ câu hỏi và trả lời để nắm chắc dự án

> [01 Tổng quan](01_PROJECT_COMPLETE_OVERVIEW.md) · [02 Toàn bộ luồng](02_PROJECT_ALL_FLOWS.md) · [03 Audit](03_DOCUMENTATION_AUDIT.md) · [04 Việc của tôi](04_MY_DOCUMENTATION_TASKS.md) · **05 Hỏi đáp** · [07 Nội dung tài liệu](07_REPORT_CONTENT_SUMMARY.md) · [08 Ký hiệu sơ đồ](08_DIAGRAM_NOTATION_GUIDE.md)
>
> Mọi câu trả lời đều lấy từ tài liệu, có ghi nguồn. Ký hiệu ⚠ = tài liệu chưa có bằng chứng hoặc còn TBD: khi bị hỏi thì **nói thật là chưa có**, không khẳng định.
> Cách học: đọc câu hỏi, tự trả lời thành tiếng, rồi mới xem đáp án. Cấp 5 là phần giảng viên phản biện hay hỏi nhất (theo trình tự buổi review [HD mục 07]).

---

## Cấp 1 — Tổng quan

**1.1. LumiGap là gì, nói trong một câu?**
Nền tảng web hỗ trợ sinh viên đại học đi từ một chủ đề rộng đến một research gap có bằng chứng, rồi tiếp tục làm dự án nhóm và nhận review từ giảng viên, trong một hệ thống duy nhất. AI chỉ đưa gợi ý. [R1 §2, §5]

**1.2. Giải quyết vấn đề gì?**
Có hai vấn đề:
(1) Sinh viên khó xác định gap thật, vì bằng chứng nằm rải rác trong rất nhiều bài báo.
(2) Quy trình bị chia cắt qua nhiều công cụ (Semantic Scholar, Elicit, ResearchRabbit, Overleaf) nên mất dấu vết từ bằng chứng đến dự án và review. [R1 §2, §3.5]

**1.3. Ai dùng?**
Guest, User (Student/Researcher), Lecturer (đã xác minh), Gap validation expert, Project owner/member, Community moderator, External reviewer, Administrator. [R3 §2.1]

**1.4. Khác các công cụ hiện có ở đâu?**
Mỗi công cụ kia mạnh ở một khâu. LumiGap nối các khâu: **bằng chứng → gap → dự án → review** đều truy được dấu vết, và có giảng viên con người tham gia thẩm định. [R1 §3.5, §4]

**1.5. Mã đề tài, nhóm, GVHD?**
FA26SE004, nhóm GFA26SE61, GVHD thầy Trương Long. [R1 §1]

**1.6. Phạm vi KHÔNG làm gì?**
LI-01…LI-09:
- AI không phải người phán quyết cuối cùng.
- Không đảm bảo bao phủ toàn bộ tài liệu khoa học.
- Không phải nền tảng xuất bản, kho lưu trữ hay dịch vụ kiểm đạo văn.
- Không tự động phân công reviewer.
- Link hồ sơ ngoài không đủ để xác minh danh tính.
- Không phải mạng xã hội.
- Thanh toán chỉ dùng để mua credit qua PayOS. [R1 §6.2], [BM01 §1.2]

---

## Cấp 2 — Chức năng và luồng người dùng

**2.1. Có bao nhiêu chức năng, bao nhiêu chức năng bắt buộc?**
53 FR và 45 UC [R3]. Có 15 tính năng bắt buộc F-01…F-15, nằm trong 5 main workflow [BM01 §6, Phụ lục A1].

**2.2. Kể 5 main workflow và người sở hữu.**
WF-01 Report (Hòa) · WF-02 Gap analysis và thẩm định (Anh) · WF-03 Nộp bài và peer review (Khoa) · WF-04 Xác minh giảng viên (Thanh) · WF-05 Nạp credit PayOS (**Hoàng**). [BM01 A1]

**2.3. Report được tạo ra thế nào?**
Xem trước bằng chứng (miễn phí) → `POST /reports` trừ credit (fast 20 / standard 50 / deep 100) và tạo bản ghi `queued` → worker chuyển `generating` → LLM viết, trích dẫn [n] trỏ tới bài bằng chứng → `ready`. Nếu thất bại thì `failed` và hoàn credit một lần. Web hỏi lại trạng thái mỗi 3 giây. [R3 FR-14…16], [R4 §3.1]

**2.4. Gap được thẩm định thế nào?**
Chủ gap gửi yêu cầu thẩm định. Chuyên gia có quyền GAP_VALIDATION, không thuộc dự án, bỏ phiếu VALIDATE, REJECT hoặc REFINE_SCOPE. Đủ quorum 2 thì chốt VALIDATED, REJECTED hoặc REFINED. Người tạo gap và thành viên dự án không được thẩm định. [R3 FR-20, BR-09]
⚠ Hiện chỉ dữ liệu seed mới cấp quyền GAP_VALIDATION (G-06).

**2.5. Luồng nộp bài và review?**
Nộp PDF (`submitted`) → tác giả yêu cầu AI pre-review (`ready_for_review` khi xong) → gửi yêu cầu review (`REQUESTED`, submission `under_review`) → reviewer chấp nhận → lưu nháp (`IN_REVIEW`) → submit: `COMPLETED` hoặc `REVISION_REQUESTED` → tác giả nộp lại (`RESUBMITTED`). [BM01 A1 WF-03], [R4 §2.3.5]

**2.6. Xác minh giảng viên?**
Giảng viên nộp minh chứng (`PENDING`) → admin duyệt: `VERIFIED` (được cấp quyền review và mentor), `NEEDS_MORE_INFORMATION` hoặc `REJECTED`. Nếu đổi vị trí, trường hoặc email trường thì minh chứng đang chờ chuyển `INVALIDATED`. [R3 FR-43…45]

**2.7. (WF-05 của tôi) Nạp credit hoạt động thế nào?**
User nhập số tiền (≥10.000 VND, là bội số của 100) → API tạo PaymentOrder `pending` và link PayOS → user thanh toán → PayOS gọi webhook → API kiểm chữ ký HMAC, `code 00`, số tiền khớp → cộng credit đúng một lần (khóa `payos:<orderCode>`) → đơn chuyển `paid`. 1 credit = 100 VND, ví dụ 20.000 VND ra 200 credit. [R3 FR-32, FR-33], [R4 §3.5], [BM01 DS-05a]

**2.8. Vì sao return URL không cộng tiền?**
Trình duyệt người dùng có thể bị giả mạo. Chỉ webhook có chữ ký từ PayOS mới là nguồn sự thật để cộng credit. [R4 §3.5.2: "balance changes only through the webhook"]

**2.9. Credit dùng vào đâu?**
Re-rank 5; report 20/50/100; gap 30; directions 15; gap closure 10; chat dự án 1/tin; yêu cầu thêm bài 100; AI review 10 (3 nếu dùng key cá nhân). Tìm kiếm thường thì miễn phí. User mới được 1000 credit. [R3 BR-03, BR-04]

**2.10. Guest làm được gì?**
Tìm bài, xem chi tiết bài, xem trends, đọc forum và community, xem danh bạ giảng viên và hồ sơ công khai. [R3 §2.1]

---

## Cấp 3 — Kiến trúc và lựa chọn công nghệ

**3.1. Kiến trúc gồm những khối nào?**
React SPA → Express API → PostgreSQL + pgvector; API → Redis/BullMQ → 11 worker; AI Reviewer (Python FastAPI + SQLite); LaTeX compiler; file storage; các dịch vụ ngoài. [R4 §1.1]

**3.2. Vì sao dùng PostgreSQL + pgvector thay vì một vector DB riêng?**
Để có **một kho có giao dịch nhất quán** cho dữ liệu, sổ cái credit và vector. Phương án đã cân nhắc là document store cộng vector DB riêng. Quyết định D1, người chịu trách nhiệm Khoa. [BM01 §3 D1]

**3.3. Vì sao cần hàng đợi BullMQ và worker?**
Sinh report hay phân tích gap mất nhiều thời gian và hay gặp lỗi tạm thời từ LLM. Đưa vào hàng đợi giúp: trả lời người dùng ngay, thử lại tối đa 5 lần với backoff, hoàn credit khi thất bại, và quét job bị kẹt. Phương án đã cân nhắc là xử lý đồng bộ hoặc dùng cron. Quyết định D2 (Hòa). [BM01 §3 D2], [R3 §5.2]

**3.4. Vì sao AI Reviewer tách thành dịch vụ Python?**
Để xử lý PDF bằng hệ sinh thái Python và có dữ liệu riêng (SQLite). Dịch vụ được gọi bằng header `X-Internal-Key`. Quyết định D3 (Anh). [BM01 §3 D3], [R4 §1.1 #05]

**3.5. LLM được truy cập thế nào?**
Có công tắc chọn provider (gemini/ollama) và cache Redis. Người dùng có thể dùng key cá nhân, được mã hóa AES-256-GCM. Quyết định D4 (Hòa). [BM01 D4]

**3.6. Phân quyền thiết kế thế nào?**
Kiểm tra theo từng đối tượng (project, review assignment) chứ không chỉ theo role. JWT RS256 hạn 15 phút, refresh token xoay vòng hạn 7 ngày. File chỉ truy cập qua URL có thời hạn. Quyết định D5 (Thanh). [BM01 D5], [R3 NFR-SEC-01]

**3.7. Redis dùng để làm gì?**
Bốn việc: hàng đợi BullMQ, cache câu trả lời LLM, nơi lưu bộ đếm rate limit (tùy chọn), và heartbeat của worker. [R4 §1.1 #09]

**3.8. CI/CD hiện có những gì?**
CI (GitHub Actions) chạy khi có PR hoặc push vào `main`: migrate, typecheck, Vitest, 6 bộ integration test. Không chạy lint, Playwright, pytest. CD dùng Jenkins: build image theo git sha → kiểm env production → backend ứng viên phải qua `/ready` → thay container chạy thật ở lumigap.uk. [R4 §1.3.3]

**3.9. Có những môi trường nào?**
Local (Docker Compose), CI (runner tạm), Production (lumigap.uk). ⚠ **Không có staging** (R4 §1.3.4 #04 TBD; rủi ro R1, owner Hòa, hạn 11/11).

---

## Cấp 4 — Chuyên sâu (dữ liệu, AI, workflow, kiểm chứng)

**4.1. Database có bao nhiêu bảng, ERD chia thế nào?**
Tại baseline ca8fe4d: 188 model, 93 migration SQL viết tay. ERD vật lý vẽ 187 bảng, chia thành 10 nhóm [R4 §2.1]. ERD logic có 57 entity trong 14 hình [R3 §3.1.5]. Khóa ngoại lấy từ migration, vì Prisma chỉ khai báo quan hệ cho một vài model.
⚠ Trên `main` ngày 28/10 đã có 97 migration và 191 model [GIT], nên các con số này chỉ đúng với ca8fe4d.

**4.2. Làm sao chắc ERD đúng với database?**
Đã chạy lại toàn bộ 93 migration trên PostgreSQL (PGlite) và dùng validator so sánh với 38 file ERD: 0 lỗi. [DIAGRAM_QA_REPORT, cập nhật 23/10]

**4.3. Làm sao tránh trừ hoặc cộng credit hai lần?**
Mỗi giao dịch có idempotency key (`report:<id>`, `review:<id>`, `payos:<orderCode>`). Hoàn credit được canh bởi cả `creditRefundedAt` lẫn sổ cái (`refundCreditsOnce`). Thao tác chạy trong transaction serializable. [R3 BR-04, FR-16], [R4 §3.5.1]

**4.4. AI có "bịa" trích dẫn được không?**
Thiết kế chặn việc này: chỉ chấp nhận citation [n] trỏ tới bài bằng chứng đã đánh số (`assertCitationsInRange`, `assertSourceLocators`, `assertGapReferences`). Riêng con số phần trăm không có trong bằng chứng thì chỉ được ghi vào `groundingChecks`, không làm report thất bại. [R4 §3.1.4 design note]
⚠ Chưa có bộ đánh giá "gold cases" nào được báo cáo (rủi ro #2 trong R2 §1.3).

**4.5. Vì sao "ít bài báo" không có nghĩa là có gap?**
Gap analysis dùng kiểm định observed/expected (`GAP_UNDEREXPLORED_MAX_RATIO`) cùng bằng chứng bên ngoài, sau đó còn cần chuyên gia thẩm định. [R3 BR-08]

**4.6. Trends quyết định "rising/declining" thế nào?**
Dùng kiểm định Mann-Kendall trên tỷ trọng của chủ đề trong lĩnh vực, hiệu chỉnh Benjamini-Hochberg, độ dốc Sen. Cần ít nhất 5 kỳ hoàn chỉnh và 30 bài; nếu không thì là `insufficient`. Khi OpenAlex lỗi thì dùng corpus local, nhưng mọi verdict thành `insufficient` (LOCAL_CORPUS). [R3 FR-11]

**4.7. Nếu worker chết giữa chừng thì sao?**
Sweep quét các report hoặc gap đang ở `generating`/`analyzing` quá 5 phút, hoặc `queued` quá 30 phút, chuyển sang `failed` và hoàn credit. Admin thấy heartbeat cũ sau 2 phút. [R3 NFR-REL-02, FR-39]

**4.8. Có bao nhiêu test và thế nào là đạt?**
Cam kết 79 test case = 3×15 tính năng + 5 workflow + 24 chuyển trạng thái + 5 NFR. Trong đó 73 test chạy trong CI (92%) và 6 test thủ công (5 E2E + N4). Thêm 127 unit case cho 22 hàm. Ngưỡng Defense 1.1: ≥90% test đạt, 100% test luồng chính, ≥50% chạy trong CI, 0 defect Critical/High. [BM01 A3], [R5 §3.4]
⚠ **Chưa test nào được viết hay chạy** [R5 §5].

**4.9. Trong 24 chuyển trạng thái đã cam kết, WF-05 có những cái nào? WF-05 có bao nhiêu test?**
WF-05 có 2 chuyển trạng thái: T23 PaymentOrder (new)→pending và T24 pending→paid. Cộng với 9 test tính năng, 1 E2E và 1 NFR (N3) thì WF-05 có 13 test. [BM01 A3], [R5 §4.1]

**4.10. 5 NFR là gì?**
N1 thử lại và hoàn credit · N2 rate limit (≤10 lần/giờ) · N3 webhook phải có chữ ký đúng · N4 p95 của evidence preview ≤3 s với 10 user (⚠ PROPOSED, chưa đo) · N5 token 15 phút / 7 ngày, dùng lại refresh token cũ thì bị chặn. [BM01 §7]

**4.11. Tài liệu được kiểm chứng bằng cách nào?**
R3 và R4 được viết từ code (có dẫn file và dòng), không dựa vào docs trong repo [R4 mở đầu §II]. BM02 dùng prompt chuẩn của môn chạy bằng AI để đối chiếu phiếu đăng ký, SRS, SDD và code. Kết quả là 51 finding, mỗi finding có phản hồi của nhóm. [BM02]

---

## Cấp 5 — Phản biện (câu khó, kèm điểm yếu phải thừa nhận)

**5.1. "Tài liệu mô tả commit nào? Repo hiện tại có khớp không?"**
Tài liệu mô tả `main` tại **ca8fe4d (26/10)**.
⚠ Từ đó tới nay `main` đã có thêm PR #56–#66 (4 migration mới, 3 bảng mới). Trả lời trung thực: tag `review-2` gắn ở commit nào thì tài liệu được cập nhật theo commit đó. Việc này phải chốt trước buổi review ([04 A-01](04_MY_DOCUMENTATION_TASKS.md)).

**5.2. "Hướng dẫn yêu cầu sơ đồ ở dạng Mermaid hoặc PlantUML, sao lại có draw.io?"**
⚠ Hiện 46 sơ đồ chỉ có `.drawio` [03 AU-02]. Hướng xử lý: bổ sung `.puml` tương đương trong repo, giữ `.drawio` làm bản trình bày ([04 A-04](04_MY_DOCUMENTATION_TASKS.md)). Nếu chưa xong trước buổi review thì nói rõ đây là việc đang làm, không chối.

**5.3. "Demo chạy trên staging à?"**
⚠ Chưa có staging (R1 trong BM01; hạn 11/11, owner Hòa). Hướng dẫn môn yêu cầu demo trên staging [HD 09.2]. Hiện chỉ chạy được bằng Docker Compose ở local hoặc trên production.

**5.4. "Webhook PayOS có an toàn không?" (câu dành riêng cho WF-05)**
Có kiểm chữ ký HMAC, kiểm `code 00`, kiểm số tiền khớp, và chống cộng hai lần bằng idempotency key.
⚠ Điểm yếu: chữ ký **chỉ được kiểm khi có cấu hình `PAYOS_CHECKSUM_KEY`**. Thiếu biến này thì bỏ qua kiểm tra. NFR-SEC-02 vì vậy ghi Partial. Đề xuất: bắt buộc biến này trong bộ kiểm env production. [R3 NFR-SEC-02], [R4 §3.5.3]
⚠ Chưa có test tự động cho payos.service, webhook và credit.service (SR-34 High).

**5.5. "Người dùng hủy thanh toán thì đơn ở trạng thái gì?"**
Vẫn ở `pending`. Các giá trị `cancelled` và `expired` có trong type nhưng không code nào gán (dead values). Không có key PayOS thì code trả URL giả và đơn không bao giờ `paid`. [R4 §2.3.10], BM02 SR-26 (Planned, RF-24)

**5.6. "Tình huống: thêm trạng thái `cancelled` cho PaymentOrder thì ảnh hưởng gì?"** (dạng câu hỏi tình huống thay đổi, [HD mục 07 #3])
Phân tích theo tài liệu:
- Thực thể PaymentOrder: thêm giá trị, có thể thêm CHECK constraint (hiện chưa có).
- State machine R4 §2.3.10: thêm transition pending→cancelled với trigger là webhook hủy hoặc hết hạn.
- API: xử lý callback hủy, có thể thêm job hết hạn.
- FR-32/33: thêm trường hợp bất thường.
- Test: thêm 1 chuyển trạng thái, nên tổng cam kết thành 80 TC.
- Report 5, BM04 §8: cập nhật con số.
⚠ Đây là lập luận dựa trên tài liệu, chưa kiểm trong code.

**5.7. "Tình huống: PayOS (hoặc Gemini) ngừng hoạt động?"**
- PayOS lỗi: tạo link trả HTTP 503 hoặc 400, đơn không được tạo hoặc nằm ở `pending`, không cộng credit [R3 FR-32].
- Gemini lỗi: job AI thử lại tối đa 5 lần rồi `failed` và hoàn credit [R3 NFR-REL-01]. Có thể đổi provider sang Ollama hoặc dùng key của người dùng [BM01 D4]. Tìm kiếm thường không dùng LLM nên vẫn chạy [R3 BR-05].
- OpenAlex lỗi: trends dùng corpus local và gắn `LOCAL_CORPUS` [R3 FR-11].

**5.8. "Tình huống: tải tăng 10 lần?"**
Theo tài liệu:
- Có rate limit theo user (report 10/giờ, gap 10/giờ, …) [R3 NFR-PER-01].
- Worker là tiến trình riêng nên có thể chạy thêm. ⚠ Chưa có tài liệu đo khả năng mở rộng.
- Bộ đếm rate limit mặc định nằm trong bộ nhớ từng tiến trình, có thể chuyển sang Redis (`RATE_LIMIT_STORE`) khi chạy nhiều instance [R3 §5.2].
- ⚠ N4 chưa có số đo nền; chưa có load test (nằm ngoài phạm vi [R5 §1.2]).

**5.9. "Tình huống: thêm một vai trò người dùng mới (ví dụ Reviewer chuyên trách)?"**
Hiện token chỉ có `user` và `admin`. Các vai còn lại thể hiện qua capability như STRUCTURED_REVIEW [R3 §2.1]. Cách thêm hợp với thiết kế là **thêm capability** và đường cấp capability, không thêm system role. Ảnh hưởng tới:
- Bảng `user_capabilities`
- Middleware `requirePermission`
- Ma trận phân quyền R3 §3.1.3
- Actor trong use case
- Test phân quyền ("-03")

**5.10. "AI có thay giảng viên chấm bài không?"**
Không. Pre-review chỉ để tham khảo. Review chính thức yêu cầu giảng viên đã xác minh, có lời mời rõ ràng được chấp nhận, không tự review, và vòng review đã nộp thì không sửa được. [R3 BR-07, BR-12], [R1 LI-01]

**5.11. "Có tính năng nào được báo Implemented mà thực ra chưa dùng được?"**
Có, và tài liệu đã tự ghi [R3 §5.4]:
- Tuyển cộng sự: guard thực tế chỉ admin dùng được.
- GAP_VALIDATION không có đường cấp lúc chạy.
- Key cá nhân cho AI review không cấu hình được.
- Upload của AI review không kiểm magic bytes của PDF.
- Chi phí format check có định nghĩa nhưng không thu.
- Webhook phụ thuộc biến cấu hình checksum.
- Submission có hai bộ từ vựng trạng thái.
- PaymentOrder không có cancelled/expired.

**5.12. "Có gì gọi đồng bộ dù quy ước là đưa việc dài vào hàng đợi?"**
AI paper review (timeout 180 s), format check (60 s) và dịch bài (15 s) gọi đồng bộ trong request [R4 §1.1]. Đây là finding SR-45 (High, Planned, Thanh, hạn 18/11): hoặc ghi rõ trong SDD, hoặc chuyển sang hàng đợi.

**5.13. "Vì sao BM02 chạy trên ab1a6c5 chứ không phải tag review-2?"**
Lúc chạy (21/10) chưa có tag. BM02 §1 ghi rõ điều này.
⚠ Hướng dẫn yêu cầu chạy trên tag [HD mục 05]. Kế hoạch là chạy lại trên tag, giữ nguyên kết quả gốc ([04 A-07](04_MY_DOCUMENTATION_TASKS.md)).

**5.14. "Có bao nhiêu finding High còn mở?"**
Theo BM02 bản hiện tại: 17 High, gồm 11 Fixed và 6 Planned (SR-17, SR-22, SR-33, SR-34, SR-38, SR-45). Mỗi mục Planned có owner và hạn, và đều được ghi lại ở BM01 §5 như hướng dẫn yêu cầu.
⚠ Một phần Team response cần cập nhật (AU-05), nên con số có thể đổi.

**5.15. "Các con số cam kết có khớp nhau không?"**
Theo workflow: 16+15+19+16+13 = 79, trùng với tổng theo thành viên. Số test tự động 14+14+18+15+12 = 73. [R5 §4.1], [BM04 §8]

**5.16. "Ai sở hữu phần nào, Hoàng sở hữu gì?"**
Hoàng: WF-05, F-13…F-15, N3, Report 5 (QA), tính nhất quán SRS/SDD, rủi ro R3 [BM01 §8], [BM04 §7.3].
⚠ Phần "viết code test" cần nhóm xác nhận ai làm ([04 C-16](04_MY_DOCUMENTATION_TASKS.md)). Tại Defense 1.1, mỗi thành viên phải mở repo, chỉ ra phần mình và chạy test [HD mục 08]. Hoàng cần tập **mở và chạy** bộ test WF-05 khi dev viết xong, và giải thích được từng test case.

**5.17. "Các tài liệu kỹ thuật trong repo có đáng tin không?"**
Nhóm không dùng docs trong repo làm bằng chứng. Report 3 và 4 được viết từ code. Docs trên `main` đang được dọn ở nhánh riêng (chưa merge). [R4 §II], [03 §1.3]

---

## Phiếu ôn nhanh cho WF-05 (thuộc lòng)

| Câu hỏi | Đáp |
|---|---|
| Endpoint | `POST /credits/payos/create-payment-link`, `POST /credits/payos/webhook` (public), `GET /credits/balance`, `/summary`, `/transactions`, `/orders` |
| Quy tắc tiền | ≥10.000 VND, bội số của 100, 1 credit = 100 VND |
| Trạng thái | pending → paid (cancelled/expired là dead values) |
| Chống trùng | Khóa `payos:<orderCode>`, transaction serializable |
| Ba kiểm tra của webhook | Chữ ký HMAC (nếu có checksum key) · code "00" · số tiền khớp |
| Lỗi | 400 sai chữ ký · 400 sai số tiền · đơn không tồn tại → 200 · lặp lại → "Order already paid" |
| Demo | DS-05a: 20.000 VND → +200 credit một lần; DS-05b: chữ ký giả hoặc sai số tiền → 400, đơn vẫn `pending` |
| Test | 13 TC: TC-F13/F14/F15-01..03, TC-WF05, TC-ST23, TC-ST24, TC-N3 |
| Điểm yếu phải nói thật | Checksum key là tùy chọn; chưa có test; chưa có staging/PayOS test key; đơn bị hủy kẹt ở pending |
| Sơ đồ | R4 Hình 112 (class), 113–115 (sequence), 116–117 (activity), 72 (state) |
