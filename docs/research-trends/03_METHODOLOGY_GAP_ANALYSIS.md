# 03 — Methodology Gap Analysis

> Checkpoint 1 · Ngày lập: 2026-10-21 · **Cập nhật Checkpoint 1.5 (2026-10-21)**: các dòng #9, #10, #12, #14, #15, #16, #20, #21 và §7, §8.1 đã được hiệu chỉnh theo `CHECKPOINT_1_5_REVIEW.md`.
> Dựa trên `01_SCIENTIFIC_LITERATURE_REVIEW.md` và `02_CURRENT_SYSTEM_AUDIT.md`.
> Mã `F1…F18` là phát hiện ở `02` §6. Ký hiệu nguồn: **[GỐC]** công thức của tác giả, **[ĐIỀU CHỈNH]** đã sửa cho OpenAlex, **[ĐỀ XUẤT]** do tài liệu này đề xuất.

## Tóm tắt một trang

**Lõi phương pháp hiện tại đúng hướng.** Verdict dựa trên **thị phần của topic trong field** (khử record inflation) + **Mann–Kendall / Sen / CI95 / Benjamini–Hochberg**, các công thức đã được kiểm tra dòng-theo-dòng và có 107 unit test pass. Không nên thay lõi này.

**Vấn đề lớn nằm ở ba chỗ, không nằm ở công thức:**
1. **Dữ liệu đưa vào không nhất quán** — trang chi tiết tính verdict trên quần thể khác với biểu đồ và khác overview (F2); trang chủ chỉ dùng kho local nên "xu hướng" thật ra là kích thước kho (F3); local và OpenAlex định nghĩa đơn vị khác nhau (F4).
2. **Hạ tầng làm hệ thống lặng lẽ rơi về dữ liệu local** — ngưỡng ngân sách OpenAlex không còn hợp với mô hình credit hiện nay (F1).
3. **Không tái lập được** — OpenAlex vừa đổi classifier topic và mô hình keyword trong tháng 10/2026; hệ thống không lưu phiên bản hay chuỗi đã dùng (F8).

**Những gì đang thiếu so với 4 bài báo:** GGT (có dữ liệu sẵn, chưa tính), burst detection (chưa có), emergence detection (chưa có và **không thể** làm đúng với cách chọn ứng viên hiện tại, F6), lớp giải thích theo Rotolo (chưa có).

**Những nhãn trên UI không có cơ sở:** "Hot" / "Hot Signal" (YoY thô > 100% / > 50%), câu "Focus on this direction" trong Compare.

---

## 1. Bảng đối chiếu chính

Priority: **P0** sửa lỗi khoa học/dữ liệu · **P1** GGT & baseline · **P2** Discover · **P3** Explore · **P4** Burst/Emerging · **P5** hiển thị/kiểm chứng (khớp với `05`).

| # | Component | Current Method | Scientific Reference | Problems | Recommended Action | Priority |
|---|---|---|---|---|---|---|
| 1 | Đơn vị đếm (OpenAlex) | `primary_topic.id`, 1 work = 1 topic | OpenAlex Topics docs; tránh đếm trùng | Không | **KEEP** | — |
| 2 | Đơn vị đếm (local) | Mọi topic của bài (`paper_topics` không lọc `is_primary`) | OpenAlex Topics docs | Khác định nghĩa với OpenAlex, thị phần các topic > 100% (F4) | **IMPROVE**: lọc `is_primary = true` ở mọi truy vấn trend local | P0 |
| 3 | Chuẩn hóa tăng trưởng | Thị phần `s_t = n_t / N_t`, N = field cùng scope | Nelis 2022 (record inflation, reference PO); Rotolo §4.2 (tăng **tương đối**) | Đúng về nguyên lý. Chỉ có 1 baseline (field) | **KEEP** công thức; **ADD** lựa chọn baseline (xem #9) | P1 |
| 4 | Kiểm định xu hướng | Mann–Kendall trên `s_t`, p xấp xỉ chuẩn | Helsel et al. 2020; Mann 1945; Kendall 1975 | Giả định độc lập (F9); p xấp xỉ ở n ≤ 10 | **KEEP**; **IMPROVE**: p chính xác cho n ≤ 10 (bảng phân phối S/ hoán vị), hiển thị cảnh báo tự tương quan; hiệu chỉnh tự tương quan → **DEFER** tới khi có backtest | P0 (exact p) / DEFER |
| 5 | Độ lớn xu hướng | Sen's slope + CI95, `relativeChangePct` | Sen 1968; Gilbert 1987 | Không | **KEEP** | — |
| 6 | Đa kiểm định | BH trên ứng viên của request | Benjamini & Hochberg 1995 | Family đổi theo `limit` → verdict đổi theo số dòng hiển thị (02 §3.4) | **IMPROVE**: cố định family = toàn bộ topic được tính trước trong cùng field/scope (cần precompute, P2) | P2 |
| 7 | Verdict | 6 luật (local/n<5/<30 bài/rising/declining/stable) | MIN_YEARS suy ra; MIN_PAPERS, high-confidence là quy ước dự án | Ngưỡng quy ước đã ghi rõ | **KEEP**; **ADD** ngưỡng "≥ 50 bài/năm" của Nelis làm điều kiện **cho GGT** (không thay luật 30 bài) | P1 |
| 8 | Nhất quán overview ↔ chi tiết | Chi tiết: thống kê bỏ Data Scope, dùng p; có thể trộn nguồn | — (lỗi kỹ thuật) | Cùng topic, cùng bộ lọc → hai verdict khác nhau (F2) | **IMPROVE**: truyền scope vào `computeTopicStatistics`; một nguồn duy nhất cho cả response; hiển thị rõ "p (1 giả thuyết)" vs "q (đa kiểm định)" | **P0** |
| 9 | Reference baseline | Cố định = field của topic | Nelis 2022: mặc định toàn cơ sở dữ liệu; theo ngành là tùy chọn | Không có global/domain/subfield; không chọn được. Baseline `global` nếu lấy cả works **không có topic** (1,7–3,1%/năm, đang giảm — đo 2026-10-21) sẽ lệch so với tử số chỉ gồm works có topic | **ADD** `baseline ∈ {global, domain, field, subfield}`, mặc định `field` (giữ hành vi). `global` = works **có** primary topic (`primary_topic.id:!null`) cùng scope **[ĐIỀU CHỈNH]**, trả về nhãn baseline và tỷ lệ works không có topic để minh bạch | P1 |
| 10 | GGT | Không có | Nelis 2022 Eq (i) **[GỐC]** | Điều kiện "less than 50% year-to-year variation" **không được định nghĩa** trong bài; cách hiểu tương đối mâu thuẫn với chính ví dụ của tác giả, cách hiểu điểm % chỉ là suy luận (CHECKPOINT_1_5 §2.3) | **ADD** annual GGT (global và theo baseline), mean GGT = trung bình cộng **[SUY LUẬN]** kèm SEM. Chỉ áp dụng **cứng** hai điều kiện rõ nghĩa: GGT < 100% và số bài/năm ≥ 50 (dùng **mọi năm** — cách hiểu thận trọng, ghi rõ). Điều kiện "ổn định": **không dùng làm cổng**, chỉ hiển thị chuỗi ΔGGT để người đọc tự đánh giá cho tới khi P5 chọn được định nghĩa có bằng chứng. Nhãn phân loại Nelis hiển thị kèm chú thích "điều kiện ổn định chưa được kiểm tra". **Không** dùng GGT để quyết định verdict | P1 |
| 11 | Chỉ số thô YoY/CAGR/OLS | Vẫn tính, vẫn trả về, vẫn gắn nhãn "Hot" | Nelis 2022 (bị record inflation bias) | F5, F16 | **REPLACE** mọi chỗ gắn nhãn/kết luận bằng GGT hoặc verdict; giữ số thô **chỉ để mô tả** | P0 (nhãn) / P1 (thay bằng GGT) |
| 12 | Nhãn "Hot"/"Hot Signal" | YoY > 100% / > 50% | Không có | Không có nguồn; "+-x%" | **REPLACE**: bỏ nhãn ở P0. Không dùng tên "Hot Right Now" (dữ liệu năm không phản ánh hiện tại). Thay thế ở P4 bằng "Bùng phát gần đây (đến hết năm Y)" — chỉ phát hành sau validation P4 | P0 bỏ / P4 thay |
| 13 | Keyword nổi lên | Log OR 2 kỳ, xếp theo z, totals = toàn scope | Woolf 1955; Haldane 1956 (công thức đúng) | N lớn → mọi keyword "significant", xếp theo z ưu tiên keyword phổ biến (F7); keyword OpenAlex vừa đổi mô hình | **IMPROVE**: xếp theo **log OR** (effect size) kèm ngưỡng hỗ trợ tối thiểu và q < 0.05; ghi phiên bản keyword; đổi tên "Supplementary keyword shift" | P0 (xếp hạng) |
| 14 | Chọn ứng viên topic | 30–200 topic lớn nhất của trang `group_by` đầu | Không có (giới hạn chi phí) | Không thể phát hiện topic nhỏ đang nổi (F6) | **IMPROVE**: precompute toàn bộ topic bằng cursor (`group_by=primary_topic.id`, mỗi năm 1 chuỗi cursor ≈ 23 trang). **Điều kiện tiên quyết:** API key (cursor qua trang 1 trả **401** khi không có key — đã kiểm tra 2026-10-21) và cổng kiểm chứng P2.0 (đủ topic, xử lý nhóm `unknown`, kiểm soát ngân sách) | P2 |
| 15 | Emergence (Porter) | Không có | Porter 2019 / patent US 10,803,124 (VERIFIED author source) | Cần term, tác giả, chuỗi năm đầy đủ; OpenAlex Keywords ≠ term trích từ abstract | **ADD (adapted)** "EScore-style" trên OpenAlex Keywords, chạy nền. **Không phát hành nhãn "Emerging"** trên UI trước khi qua validation P4 (cổng V-EM) | P4 |
| 16 | Burst (Kleinberg) | Không có | Kleinberg 2002 §4 batched binomial **[GỐC]**, γ mặc định = 1 | `d_t` cực lớn làm burst quá nhạy; chỉ ~10 lô; trạng thái ở **năm cuối** chuỗi kém ổn định (chưa có năm sau để xác nhận); dữ liệu năm trễ 10–22 tháng so với hiện tại | **ADD** `B²_{s,γ}` 2 trạng thái trên `(n_t, N_t)`; trả về burst period + weight + cờ `ongoingThroughLastCompleteYear`. Nhãn: "Bùng phát gần đây (đến hết năm Y)", **không** "Hot Right Now". Phát hành sau cổng V-BURST | P4 |
| 17 | Khung Rotolo | Không có | Rotolo 2015 (khung khái niệm, không thuật toán) | — | **ADD** lớp giải thích: thuộc tính nào có bằng chứng, thuộc tính nào không đo được. **Không** tạo "Rotolo score" | P5 |
| 18 | PP(top 10%) | Percentile chuẩn hóa của OpenAlex | Waltman & Schreiber 2013 | Năm gần chưa ổn định; đổi theo classifier (F11) | **KEEP**; **IMPROVE**: ẩn/gắn cờ 2 năm gần nhất | P5 |
| 19 | Năm hoàn chỉnh | `năm hiện tại − 1` | Nelis 2022 bỏ các năm còn được cập nhật | Độ trễ index (F10) | **IMPROVE**: tham số `indexLagYears` (mặc định 1 = hành vi hiện tại), cảnh báo nếu năm cuối có tổng N thấp bất thường so với xu hướng | P3 |
| 20 | Ngân sách OpenAlex | Khóa khi `remaining < 1000`; retry 429 hai lần | OpenAlex Authentication/Pricing/Paging (đọc 2026-10-21) | F1. Ngoài ra: 429 cũng là mã "hết ngân sách ngày" → retry vô ích; cursor cần key | **IMPROVE**: ngưỡng theo tỷ lệ `X-RateLimit-Remaining / X-RateLimit-Limit` (đơn vị credit; 1 credit = $0,0001); không retry khi 429 do hết ngân sách ngày (đọc `Remaining`/`Retry-After`); bắt buộc `OPENALEX_API_KEY` trong production; bỏ `mailto` | **P0** |
| 21 | Tái lập | Cache 7 ngày, không lưu | OpenAlex Topics/Keywords docs (đổi 10/2026) | F8. **API không trả trường phiên bản classifier nào**, tài liệu không nêu ngày chuyển chính xác | **ADD** chỉ những metadata **quan sát được**: `fetchedAt` (thời điểm gọi API, lưu cùng giá trị cache), `cacheVersion` (hằng số nội bộ), `corpus` (tham số gửi tường minh), `source`. **Không** ghi `classifierVersion` hay ngày chuyển classifier vì không có bằng chứng; thay cho điều đó: tăng `cacheVersion` khi OpenAlex công bố thay đổi (có link nguồn trong changelog nội bộ). Snapshot OpenAlex (S3) **khác** cache API — không gọi cache là snapshot | P0 (metadata) / P2 (lưu trữ) |
| 22 | Trang chủ | Overview local | — | F3 | **IMPROVE**: đọc kết quả precompute OpenAlex; nếu chưa có thì ghi rõ "kho dữ liệu nội bộ, không phải xu hướng" và **không** xếp theo "trend" | **P0** (nhãn) / P2 (dữ liệu) |
| 23 | Compare | Chuỗi thô + verdict mượn theo tên | — | F17 | **IMPROVE**: trả về thị phần + verdict + GGT cho từng topic; bỏ câu khuyến nghị "Focus on this direction" | P3 |
| 24 | Topic resolver | Chỉ Topic; khớp tên chính xác | OpenAlex taxonomy | Không phân tích được ở cấp Subfield/Field (ví dụ "Artificial Intelligence" là subfield) | **ADD** resolver đa cấp (topic/subfield/field) + gợi ý topic con | P3 |
| 25 | Cửa sổ mặc định | OpenAlex 10, local 5 | — | F13 | **IMPROVE**: một hằng số chung | P0 |
| 26 | Gaps module | CAGR thô cho "parent rising" | Nelis 2022 | F16 | **IMPROVE** (sau P1): dùng verdict/GGT của engine chung | P3 |
| 27 | Code chết, chú thích sai | `trend.filters.ts` Mongo; link `trend-methodology.ts` | — | F14, F15 | **IMPROVE** dọn dẹp | P5 |

---

## 2. Những gì hiện tại **đúng** (có bằng chứng)

| Hạng mục | Bằng chứng |
|---|---|
| Dùng thị phần trong field thay vì số bài thô để kết luận | Nelis 2022 (record inflation); Rotolo §4.2; GGT ≈ tốc độ tăng thị phần × (1+g_O) (01 §1.7) |
| Đếm theo `primary_topic` ở luồng OpenAlex (không đếm trùng) | OpenAlex Topics docs; `trend.openalex-overview.ts:166` |
| Loại năm chưa hoàn chỉnh | `trend.formulas.ts:37-42`, `trend.openalex-overview.ts:187` |
| Công thức Mann–Kendall (ties, continuity), Sen, CI95 rank method, BH, log OR Haldane–Woolf | Đối chiếu `trend.statistics.ts` với Helsel 2020, Gilbert 1987, B&H 1995, Woolf/Haldane; 107 test pass |
| `MIN_YEARS = 5` | Suy ra: n = 4 → Z tối đa 1.70, p ≈ 0.089 |
| Chỉ dùng `group_by` (không tải bản ghi), lọc theo loại tài liệu | OpenAlex Example costs; khuyến nghị lọc type trong Topics docs |
| PP(top 10%) thay cho tổng trích dẫn | Waltman & Schreiber 2013 |
| Resolver chỉ nhận tên khớp chính xác | Tránh gán nhầm topic |
| Ghi rõ "quy ước dự án" cho ngưỡng không có nguồn | `trend.verdict.ts:26-32` |
| LLM chỉ được dùng số đã whitelist | `trend.service.ts:73`, `trend-explain.prompt.ts` |

## 3. Những gì **chưa có cơ sở khoa học**

| Hạng mục | Vì sao |
|---|---|
| Nhãn "Hot" (YoY > 100%), "Hot Signal" (YoY > 50%, ≥ 15 bài), "Exploratory (< 15 papers)" | Ngưỡng tự đặt, đo trên số thô (bị record inflation) |
| `MIN_PAPERS = 30`, high confidence `p < 0.01 & n ≥ 8` | Quy ước dự án (đã ghi rõ — chấp nhận được nếu tiếp tục ghi rõ) |
| Chia đôi cửa sổ cho keyword shift | Quy ước, không có trong 4 bài |
| `relativeChangePct` dùng để xếp hạng rising | Quy ước trình bày, không phải kiểm định (đã ghi trong spec) |
| Câu "strongest candidate … Focus on this direction" | Suy diễn chính sách từ verdict mô tả quá khứ |
| "Recommended comparisons" = 3 topic rising đầu | Chấp nhận như gợi ý UI, không phải khuyến nghị khoa học |

## 4. Những gì đang **tính sai** hoặc cho kết quả sai lệch

| Hạng mục | Sai ở đâu | Hậu quả |
|---|---|---|
| F2 — verdict trang chi tiết | Bỏ qua Data Scope, có thể trộn nguồn | Người dùng lọc "article, tiếng Anh" nhưng verdict tính trên mọi loại, mọi ngôn ngữ |
| F3 — trang chủ | Dùng kho local | "Top trends" trên trang chủ = topic có nhiều bài đã sync |
| F1 — ngân sách | Ngưỡng tuyệt đối 1.000 credit | Không có key → trend luôn local → luôn insufficient |
| F4 — local đếm mọi topic | Không lọc `is_primary` | Số bài/topic và thị phần local bị thổi phồng |
| F7 — xếp keyword theo z | z ∝ √N | Keyword lớn luôn đứng đầu "Emerging Keywords" |
| `+${growthRatePct}%` | Không xét dấu | Hiển thị "+-12.3%" |
| BH family theo `limit` | Family thay đổi theo request | Verdict không ổn định khi đổi số dòng |
| `contains` cho topicId (F12) | So khớp chuỗi con | Có thể lấy nhầm topic (xác suất thấp) |

## 5. Những gì cần **giữ** (KEEP)

Lõi thống kê (#1, #3, #4 công thức, #5, #7), PP(top10%) (#18), cách truy vấn aggregate, resolver khớp chính xác, cơ chế LLM grounded. Thay các phần này **không có căn cứ** vì chưa có phương pháp nào được kiểm chứng tốt hơn trên cùng dữ liệu.

## 6. Những gì cần **cải tiến** (IMPROVE)

#2, #6, #8, #13, #14, #19, #20, #21, #22, #23, #25, #26, #27 — chi tiết thứ tự ở `05`.

## 7. Những gì **không nên triển khai** (hoặc chưa)

| Đề xuất | Quyết định | Lý do |
|---|---|---|
| Thay Mann–Kendall bằng GGT để ra verdict | **Không** | GGT là chỉ số mô tả theo năm; Nelis dùng Spearman để kiểm định GGT, không đưa ra quy tắc kết luận. Thị phần + MK đã khử record inflation |
| Một "Trend Score" tổng hợp (cộng GGT + burst + EScore + citation có trọng số) | **Không** | Không bài nào đề xuất/kiểm chứng tổ hợp như vậy; trọng số sẽ là tự đặt rồi gắn tên tác giả |
| "Rotolo score" 0–5 | **Không** | Rotolo không đưa ra thang điểm; 2/5 thuộc tính không đo được bằng scientometrics (01 §4.2) |
| Gọi biến thể trên OpenAlex Keywords là "Porter EScore" | **Không** | Dữ liệu và trích term khác; chỉ được gọi "EScore-style (adapted)" |
| Burst theo tháng | **DEFER** | Nhiều bài thiếu ngày → dồn tháng 1; chưa kiểm tra chất lượng ngày |
| Hiệu chỉnh tự tương quan (Hamed–Rao, prewhitening) | **DEFER** | Nguồn chưa xác minh trong checkpoint này; với n ≈ 10 ước lượng tự tương quan rất bất định; cần backtest trước |
| Dự báo (forecast) xu hướng | **Không** | Ngoài phạm vi 4 bài; spec nội bộ đã nêu "xu hướng là mô tả quá khứ" |
| Topic "mới" thật sự (radical novelty) dựa trên OpenAlex Topics | **Không** | Danh sách topic cố định 4.516, không có topic mới; chỉ có thể dùng keyword |
| Nhãn "Hot Right Now" | **Không** (đổi tên) | Năm hoàn chỉnh gần nhất trễ 10–22 tháng so với hiện tại; trạng thái năm cuối của Kleinberg chưa được năm sau xác nhận. Dùng "Bùng phát gần đây (đến hết năm Y)" |
| Tín hiệu từ năm hiện tại chưa hoàn chỉnh (YTD) | **DEFER** | Độ trễ index khác nhau theo loại tài liệu (preprint nhanh, kỷ yếu theo đợt) làm lệch cả thị phần; chưa có kiểm chứng |
| Điều kiện "ổn định < 50%" của GGT làm cổng cứng | **DEFER** | Bài không định nghĩa cách đo (CHECKPOINT_1_5 §2.3) |
| Ghi "phiên bản classifier" vào response | **Không** | API không cung cấp; ngày chuyển không được công bố chính xác |
| P2 (worker toàn bộ topic) khi chưa có API key | **Không** | Cursor qua trang 1 trả 401 khi không có key |

---

## 8. Đánh giá hai chế độ sản phẩm (Phase 4)

### 8.1 Mode A — Discover Trends

| Tính năng mong muốn | Hiện có? | Phương pháp phù hợp với dữ liệu đang có | Ghi chú |
|---|---|---|---|
| **Trending Research Topics** | **Một phần** — overview rising (OpenAlex), nhưng chỉ trong 30–200 topic lớn nhất; trang chủ dùng local | Verdict thị phần + MK/BH (giữ) | Cần precompute để family BH và tập ứng viên ổn định |
| **Hot Right Now** → đổi thành **"Bùng phát gần đây (đến hết năm Y)"** | **Không** (chỉ có nhãn "Hot" vô căn cứ) | **Kleinberg burst** còn kéo dài tới năm hoàn chỉnh cuối, trên `(n_t, N_t)` | Dữ liệu năm **không** phản ánh "hiện tại": năm cuối kết thúc 10–22 tháng trước thời điểm xem, cộng độ trễ xuất bản và index. Trạng thái năm cuối có thể đổi khi thêm năm mới → chỉ phát hành sau cổng V-BURST (05, P4) |
| **Fastest Growing** | **Một phần** — rising xếp theo `relativeChangePct` | **Mean GGT** (theo baseline) trong các topic có verdict rising, đạt hai điều kiện rõ nghĩa của Nelis (GGT < 100%, ≥ 50 bài mọi năm) | Không dùng YoY/CAGR thô; điều kiện "ổn định" chỉ hiển thị (xem #10) |
| **Emerging Research Topics** | **Không** | **EScore-style trên keywords** (đề xuất, thử nghiệm) + giải thích theo Rotolo; ở cấp topic chỉ có thể nói "topic nhỏ, base-period share thấp, tăng nhanh" | Không thể phát hiện **topic** mới (danh sách cố định). Không phát hành nhãn trước cổng V-EM (05, P4) |
| **Trending by Field** | **Một phần** — lọc Data Scope theo field cho ra overview của field | Cùng engine, nhóm theo field, precompute | Hiện mỗi field là một lần tính ~80 request |

### 8.2 Mode B — Explore by Topic

| Năng lực | Hiện trạng | Đánh giá |
|---|---|---|
| Topic resolution | Topic theo ID/tên chính xác; candidates theo `display_name.search` | Tốt cho Topic. **Thiếu** Subfield/Field — ví dụ "Artificial Intelligence 2018–2025" sẽ không resolve vì AI là subfield 1702 |
| Year filtering | `yearFrom/yearTo` có ở mọi endpoint; năm chưa hoàn chỉnh bị loại khỏi thống kê | Tốt. Cần cảnh báo khi cửa sổ < 5 năm hoàn chỉnh (verdict sẽ insufficient) |
| Publication time-series | Có (`yearlyBreakdown`, `shareSeries`) | Tốt |
| Global GGT | Không | Thêm (P1) — dữ liệu gần sẵn |
| Field-relative GGT | Không | Thêm (P1) — dữ liệu sẵn |
| Chọn baseline | Không | Thêm (P1) |
| Topic ranking (trong field/subfield đã chọn) | Có qua overview + scope, nhưng chỉ topic lớn | Cải tiến bằng precompute (P2) |
| Topic comparison | Chuỗi thô; verdict mượn | Cải tiến (P3) |
| Research evidence | Thống kê, keyword shift, PP(top10), top nguồn/tác giả/keyword, LLM grounded | Tốt về nội dung; cần sửa F2 để bằng chứng đúng với scope |

### 8.3 Shared Analytics Engine

Hai chế độ **đã** dùng chung một phần (`trend.verdict.ts`, `trend.statistics.ts`), nhưng logic "lấy chuỗi topic + chuỗi baseline + tính thống kê" bị lặp ở 3 nơi (`trend.openalex-overview.ts`, `trend.evidence.ts`, `trend.postgres.ts`) với ba cách xử lý scope khác nhau — đây chính là nguồn gốc F2 và F4. Kiến trúc đề xuất ở `04` gộp phần này thành một hàm thuần duy nhất.
