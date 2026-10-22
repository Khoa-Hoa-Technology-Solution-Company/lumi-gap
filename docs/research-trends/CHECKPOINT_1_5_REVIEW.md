# Checkpoint 1.5 — Review & Correction of the Implementation Plan

> Ngày: 2026-10-21 · Phạm vi: chỉ kiểm tra và cập nhật tài liệu. Không sửa code ứng dụng, không chạy migration, không bắt đầu P0–P5.
> File đã sửa: `03_METHODOLOGY_GAP_ANALYSIS.md`, `05_IMPLEMENTATION_PLAN.md` (viết lại), `01_SCIENTIFIC_LITERATURE_REVIEW.md` (1 đính chính + 1 ghi chú).

## Bằng chứng đã thu thập

| Nguồn | Cách lấy |
|---|---|
| Nelis et al. (2022) | Toàn văn Europe PMC `PMC9122180` (XML), tìm mọi câu chứa "50%", "variation", "fluctuat", "consistent", "SEM", "average GGT" |
| Kleinberg (bản DMKD 2003) | Toàn văn PDF đã tải ở Checkpoint 1, đọc lại §2 trang 9 |
| OpenAlex docs | help.openalex.org: Paging, LLM Quick Reference, Topics (đọc lại ngày 2026-10-21) |
| OpenAlex API (đọc-only, không key, tổng ≈ $0,0006) | (a) `group_by=primary_topic.id:include_unknown&cursor=*` năm 2024; (b) trang cursor thứ 2; (c) `primary_topic.id:null` và `:!null` theo năm 2016–2025 |

Kết quả API quan sát được (5 loại tài liệu mặc định của hệ thống):

| Năm | Tổng (`meta.count`) | Không có topic (`null`) | Có topic (`!null`) | % không topic | null + !null = tổng |
|---|---|---|---|---|---|
| 2016 | 8.277.739 | 259.684 | 8.018.055 | 3,14% | ✓ |
| 2019 | 8.331.561 | 213.938 | 8.117.623 | 2,57% | ✓ |
| 2022 | 7.738.825 | 233.800 | 7.505.025 | 3,02% | ✓ |
| 2024 | 8.737.187 | 196.364 | 8.540.823 | 2,25% | ✓ |
| 2025 | 9.911.950 | 171.148 | 9.740.802 | 1,73% | ✓ |

(đủ 10 năm 2016–2025 đều khớp; bảng chỉ trích 5 năm)

- Trang 1 của `group_by=primary_topic.id:include_unknown&cursor=*` (2024): 200 nhóm, sắp theo **key** (`unknown`, T10001, T10002, …, T10199), nhóm `unknown` = 196.364 = đúng count của `primary_topic.id:null`.
- Trang cursor thứ 2 không key: **HTTP 401** `{"error":"API key required for cursor paging"}`.
- Header: `X-RateLimit-Limit: 1000`, `X-RateLimit-Remaining` (credit), `X-RateLimit-Remaining-USD`, `X-RateLimit-Cost-USD: 0.0001` cho một request group_by.

---

## 1. Nhận xét được xác nhận

### 1.1 P2.1 — không được coi `meta.count` là tổng works đã phân loại · **XÁC NHẬN**
- Bản cũ của 05 viết acceptance "tổng count khớp `meta.count`". Sai: `meta.count` gồm cả works **không có primary topic** (1,73–3,14%/năm theo bảng trên; tài liệu OpenAlex nêu ~10% trên toàn bộ works).
- Hệ quả thêm, chưa nêu ở Checkpoint 1: baseline `global` nếu lấy tổng scope sẽ chứa nhóm không topic, trong khi tử số luôn có topic. Tỷ lệ nhóm này **giảm dần** (3,14% → 1,73%), nên tổng tăng chậm hơn phần có topic → GGT global bị lệch nhẹ có hệ thống.
- Sửa: cổng P2.0 kiểm `Σ nhóm topic = count(!null)` và `unknown = count(null)`; baseline `global` = `primary_topic.id:!null` [ĐIỀU CHỈNH]; trả `unclassifiedSharePct` để minh bạch. (05 P1.1, P2.0; 03 #9)
- Ghi chú: baseline `field`/`subfield`/`domain` hiện tại **không** bị ảnh hưởng vì filter `primary_topic.field.id:X` tự loại works không topic.

### 1.2 P0.6 — phân biệt classifier version, snapshot, `fetchedAt`, `cacheVersion` · **XÁC NHẬN**
- Bản cũ viết `topicClassifier: "2026-10"` — **hardcode không có bằng chứng**. Kiểm tra lại:
  - API OpenAlex **không có trường nào** cho biết classifier nào sinh ra topic của một work (Topics docs, LLM Quick Reference).
  - Tài liệu chỉ nói đổi classifier "in October 2026", **không có ngày go-live**. "5 October 2026" là ngày đóng băng topic cũ trong **GitHub release v2.0.0** của `ourresearch/openalex-topic-classification`, không phải phiên bản API. "14 October 2026" là ngày của **snapshot S3**, không liên quan tới API.
  - Cache Redis của hệ thống **không phải snapshot**.
  - Bản hiện tại lưu cache **không kèm thời điểm fetch** → nếu thêm `fetchedAt = now` khi đọc cache sẽ sai.
- Sửa: `dataProvenance` chỉ gồm `fetchedAt` (lưu trong cache), `cacheVersion`, `corpus`, `source`; bỏ `classifierVersion`; không dùng từ "snapshot" cho cache. (05 P0.6; 03 #21)

### 1.3 P1.2 — ngưỡng "50%" của Nelis không được mặc nhiên đổi thành 50 điểm % · **XÁC NHẬN**
- Nguyên văn (mục "Applying the GGT to analyse trends of well-known fields"): "GGTs are consistent (less than 50% year-to-year variation) and smaller than 100%". Bài **không định nghĩa** cách đo "variation".
- Phân tích hai cách hiểu:

  | Cách hiểu | Ý nghĩa | Đối chiếu với chính bài báo |
  |---|---|---|
  | (A) Hiệu tuyệt đối | `|GGT_y − GGT_{y−1}| < 50` điểm % | Phù hợp với câu song song "GGT>100% or fluctuations in the GGT of more than 100%" (cùng thang %), và với các lĩnh vực ổn định được tác giả coi là tin cậy. Nhưng **chỉ là suy luận** |
  | (B) Tương đối | `|ΔGGT| / |GGT_{y−1}| < 50%` | **Mâu thuẫn** với ví dụ của tác giả: lĩnh vực đã ổn định có GGT dao động quanh 0 (ví dụ "-0.8% ± 2.3%", "1.5% ± 2.2%"; Alzheimer "fluctuate very little"); với GGT gần 0, thay đổi tương đối gần như luôn > 50% → mọi lĩnh vực ổn định sẽ bị coi là "không tin cậy" |
  | (C) Độ lệch chuẩn / SEM | Bài báo cáo "mean ± SEM" | Không có ngưỡng nào gắn với SEM |
- Kết luận: (B) bị loại vì mâu thuẫn ví dụ; (A) hợp lý nhất nhưng không được tác giả xác nhận. **Không triển khai điều kiện này thành cổng.** Hiển thị chuỗi ΔGGT; chọn định nghĩa ở P5 bằng dữ liệu S1/S2 của bài (tác giả công bố số liệu thô và GGT năm trong S1/S2).
- Đồng thời ghi rõ một điểm mơ hồ thứ hai: "at least 50 publications per year" không nói mọi năm hay trung bình → chọn **mọi năm** (thận trọng) và ghi [SUY LUẬN]. (05 P1.2; 03 #10; 01 §1.5)

### 1.4 P4 — "Hot Right Now" với dữ liệu năm · **XÁC NHẬN**
- Năm hoàn chỉnh gần nhất hiện là 2025. Tại ngày xem (2026-10-21), dữ liệu đó kết thúc **~10 tháng** trước; đầu năm sau đó là ~22 tháng. Cộng thêm độ trễ nộp → xuất bản → index (Nelis bỏ hẳn 3 năm gần nhất vì bản ghi còn cập nhật).
- Với Kleinberg, trạng thái của **năm cuối** chỉ dựa trên dữ liệu tới năm đó; khi có năm tiếp theo, Viterbi có thể đổi trạng thái năm cuối → "đang burst" là kết luận tạm.
- Dùng năm chưa hoàn chỉnh (YTD) cũng không giải quyết được: độ trễ index khác nhau theo loại tài liệu nên lệch cả thị phần → DEFER.
- Sửa: bỏ tên "Hot Right Now". Nhãn: **"Bùng phát gần đây (đến hết năm {Y})"** / "Recent burst (through {Y})", kèm câu "dữ liệu năm, không phản ánh các tháng gần đây". Chỉ bật sau cổng V-BURST (ổn định năm cuối qua backtest, độ nhạy với `d_t` lớn). (05 P4; 03 #12, #16, §7, §8.1)

### 1.5 API key, cursor, rate limit, chi phí · **XÁC NHẬN, có phát hiện mới**

| Hạng mục | Theo tài liệu + kiểm tra thực tế (2026-10-21) | Ảnh hưởng tới kế hoạch |
|---|---|---|
| API key | Miễn phí; $1/ngày (≈ 10.000 credit). Không key: $0,10/ngày, **chung theo IP** | P0.1 |
| Cursor | **Cần key để đi qua trang 1** (401 thực tế). Trang cursor sắp theo key | **P2 không thể làm khi không có key** — thêm vào cổng P2.0 |
| `group_by` | ≤ 200 nhóm/trang; trang không cursor sắp theo count (code hiện tại dựa vào điều này — đúng) | Giữ |
| `per_page` | Với list: 100 là tối đa được hỗ trợ, 200 là "deprecated legacy"; với group_by tài liệu Grouping vẫn hướng dẫn `per_page=200` | Rủi ro theo dõi, không đổi ngay |
| Tốc độ | 10 req/s không key, 30 req/s có key; vượt tốc độ **hoặc** hết ngân sách ngày → 429 | P0.1: không retry 429 khi hết ngân sách (code hiện tại retry 2 lần) |
| Chi phí | Singleton miễn phí; list/group_by $0,0001; search $0,001; `/text/topics` $0,01 | Ước tính P2: mỗi năm ~23 trang cursor ≈ $0,0023; 10 năm ≈ $0,023 cho một scope → đo thật ở P2.0 |
| Header | `X-RateLimit-Remaining` tính bằng credit (1 credit = $0,0001), có thêm bản `-USD` | Ngưỡng theo tỷ lệ `Remaining/Limit` |

### 1.6 Các yêu cầu điều chỉnh kế hoạch · **ĐÃ ÁP DỤNG** (05 §0)
- Không làm P2 khi chưa qua cổng P2.0.
- Không phát hành nhãn burst/Emerging khi chưa qua V-BURST/V-EM.
- Golden dataset từ P0 (G0) và P1 (G1, gồm tái tạo số liệu Nelis S1/S2).
- Exit criteria độc lập cho từng P0–P5.
- Dừng review sau mỗi giai đoạn (`PHASE_Px_REPORT.md`).

---

## 2. Nhận xét bị bác bỏ

**Không có nhận xét nào của anh/chị bị bác bỏ.**

Một điểm chỉ được chấp nhận **một phần**: nhận xét P1.2 đúng khi nói không được mặc nhiên dùng 50 điểm %. Tuy vậy, cách hiểu ngược lại (thay đổi tương đối) cũng bị loại, vì mâu thuẫn với chính ví dụ của Nelis (§1.3). Vì vậy kế hoạch không chọn cách nào, mà hoãn điều kiện này tới khi có dữ liệu S1/S2.

Các khẳng định **của chính Checkpoint 1** bị bác bỏ hoặc sửa:

| Khẳng định cũ | Vị trí | Sai vì | Đã xử lý |
|---|---|---|---|
| Kleinberg "không đưa ra một giá trị γ mặc định" | 01 §3.2 | Bài viết "γ will often be set to a default value of 1" (trang 9) | Sửa 01 |
| `topicClassifier: "2026-10"` trong metadata | 05 P0.6 cũ | Không có bằng chứng ở API | Sửa 05, 03 |
| Acceptance P2.1 "tổng count khớp `meta.count`" | 05 P2.1 cũ | `meta.count` gồm works không topic | Sửa 05 (P2.0) |
| `ggtReliability`: "\|ΔGGT\| < 50 điểm %" | 04 §2.5, 05 P1.2 cũ | Không có trong bài | Sửa 05, 03. **04 chưa sửa** (ngoài phạm vi được phép) — 05 và 03 có hiệu lực cao hơn |
| "Hot Right Now" = burst đang mở | 03 #12, §8.1; 04 §2.6 | Dữ liệu năm không phản ánh hiện tại | Sửa 03, 05. **04 §2.6 chưa sửa** |
| Ước tính "~5.000 credit/lần chạy", "worker dùng 60% quota" | 04 §2.7 | Ước tính chưa đo; cursor cần key | Thay bằng cổng P2.0 (≤ 30% quota, đo thật). **04 chưa sửa** |
| Thiếu thông tin "cursor cần key" | 02 §7 dòng 3 | Thiếu, không sai | Ghi tại đây; 02 không sửa |

---

## 3. Thay đổi trong kế hoạch (05)

| Thay đổi | Trước | Sau |
|---|---|---|
| Quy trình | Chuỗi P0→P5 liên tục | Dừng review sau mỗi giai đoạn, có báo cáo |
| Golden dataset | Chỉ ở P5.1 | G0 (P0) … G4 (P4); G1 tái tạo số liệu Nelis |
| P0 | 7 task | Thêm **P0.0 fixtures**; P0.1 thêm xử lý 429; P0.6 chỉ metadata quan sát được, lưu `fetchedAt` trong cache, `corpus=core` tường minh, tăng `cacheVersion` có nguồn |
| P1 | GGT có cổng "ổn định 50 điểm %" | Chỉ 2 điều kiện rõ nghĩa làm cổng; ΔGGT chỉ hiển thị; baseline `global` = works có topic |
| P2 | P2.1 kiểm chứng truy vấn rẻ | **Cổng P2.0** bắt buộc: key, đủ topic, `unknown`, ngân sách ≤ 30%, dừng/tiếp tục |
| P4 | "Hot Right Now" | "Bùng phát gần đây (đến hết năm Y)"; cổng **V-BURST**, **V-EM**; code sau cờ tắt |
| P5 | Validation chung | Thêm chọn định nghĩa "ổn định" GGT; nhắc hạn 13/01/2027 của classifier cũ |
| Exit criteria | Bảng tổng hợp chung | Mỗi giai đoạn có checklist riêng |

---

## 4. Rủi ro chưa giải quyết

| # | Rủi ro | Mức | Hướng xử lý |
|---|---|---|---|
| R1 | Chưa biết production có `OPENALEX_API_KEY` hay không (không đọc `.env`) | Cao | Đội xác nhận; P0.1 thêm cảnh báo khởi động. Không có key thì P2 bị chặn |
| R2 | Định nghĩa "ổn định" của GGT chưa xác định | Trung bình | P1 không dùng làm cổng; P5 chọn bằng S1/S2 |
| R3 | File S1/S2 của Nelis **chưa mở** → chưa chắc đủ dữ liệu làm golden | Trung bình | Mở ở P1.0; nếu không đủ, dùng ví dụ tính tay và ghi rõ |
| R4 | So sánh trước/sau classifier phụ thuộc `/text/topics?version=1` (hết 13/01/2027) | Trung bình | Cần quyết định có làm bước thu thập đọc-only sớm hay không |
| R5 | Cache Redis có thể đang chứa count trước và sau đổi classifier (TTL 7 ngày, ngày chuyển không rõ) | Thấp–TB | P0.6 tăng `cacheVersion` |
| R6 | OpenAlex cập nhật hằng ngày → hai lần chạy khác nhau | Thấp | P2.0 đo mức khác biệt; lưu `fetchedAt` |
| R7 | Mann–Kendall tự tương quan chưa xử lý | Trung bình | DEFER, cần backtest (P5) |
| R8 | Preprint và bản xuất bản có thể bị đếm hai lần | Chưa đo | Đề xuất đo ở P2.0 (đọc-only) |
| R9 | `per_page=200` đang là legacy với list endpoint | Thấp | Theo dõi trang Deprecations |
| R10 | 04 còn 3 đoạn đã lỗi thời (§2.5 ngưỡng 50 điểm %, §2.6 "Hot Right Now", §2.7 ước tính chi phí) | Thấp | Sửa khi được phép chỉnh 04; hiện 03/05 có hiệu lực |

---

## 5. Quyết định: có đủ điều kiện chuyển sang P0 không?

**Có, có điều kiện.**

- P0 không phụ thuộc DB, không thêm phương pháp mới, và toàn bộ test chạy trên fixtures (P0.0). Vì vậy P0 làm được ngay cả khi chưa xác nhận API key.
- Các lỗi P0 nhắm tới đều có bằng chứng trong code (02 §6) và đã được kiểm lại trong checkpoint này. Không có phát hiện mới nào làm thay đổi phạm vi P0, ngoài việc bổ sung P0.0, xử lý 429 trong P0.1 và thu hẹp P0.6.
- Điều kiện:
  1. Anh/chị duyệt bản P0 trong `05_IMPLEMENTATION_PLAN.md`.
  2. Song song, đội xác nhận tình trạng `OPENALEX_API_KEY` ở production (R1). Việc này cần để **kiểm tra** P0.1 trên môi trường thật, không cần để viết code.
  3. Thực hiện theo thứ tự P0.0 → P0.1 → P0.2 → P0.6 → P0.4 → P0.5 → P0.3 → P0.7, rồi dừng với `PHASE_P0_REPORT.md`.
- **Chưa đủ điều kiện** cho P2: cổng P2.0 cần API key và chưa chạy.
