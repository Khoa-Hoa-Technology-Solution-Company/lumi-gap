# Giao thức Đóng khoảng trống nghiên cứu (Gap Closure Protocol, GCP v1)

Cách quyết định một khoảng trống nghiên cứu (research gap) có thật hay không, sao cho giảng viên kiểm tra được và bất kỳ ai cũng có thể làm lại bằng tay, không cần phần mềm.

Bản tiếng Anh: [gap-closure-protocol.md](gap-closure-protocol.md).
Thiết kế phần mềm và hợp đồng API: [superpowers/specs/2026-10-15-gap-closure-protocol-design.md](superpowers/specs/2026-10-15-gap-closure-protocol-design.md).
Các quy tắc được cài đặt trong `apps/backend/src/modules/gap-closure/closure.rules.ts`; mọi con số trong tài liệu này đều do tệp đó tạo ra và có thể tính lại bằng bút chì hoặc bảng tính.

Mục lục

1. [Vấn đề](#1-vấn-đề)
2. [Định nghĩa](#2-định-nghĩa)
3. [Quy trình thủ công và phiếu làm việc](#3-quy-trình-thủ-công-và-phiếu-làm-việc)
4. [Tính cận Clopper-Pearson bằng tay](#4-tính-cận-clopper-pearson-bằng-tay)
5. [Ví dụ minh họa từ đầu đến cuối](#5-ví-dụ-minh-họa-từ-đầu-đến-cuối)
6. [Vì sao cận này đúng](#6-vì-sao-cận-này-đúng)
7. [Khả năng tái lập và vai trò của AI](#7-khả-năng-tái-lập-và-vai-trò-của-ai)
8. [Hạn chế](#8-hạn-chế)
9. [Tài liệu tham khảo](#9-tài-liệu-tham-khảo)

---

## 1. Vấn đề

"Không tìm thấy bài báo nào" không có nghĩa là "có khoảng trống nghiên cứu". Một lượt tìm kiếm có thể trả về kết quả rỗng vì chưa ai nghiên cứu câu hỏi đó, nhưng cũng có thể vì câu trả lời nằm trong một bài báo mà cơ sở dữ liệu của ta không có, truy vấn của ta không chạm tới, hoặc phần tóm tắt không nêu kết quả. Công cụ hay sinh viên nào coi mọi kết quả rỗng là khoảng trống thì sớm muộn cũng đề xuất một câu hỏi đã được giải quyết từ nhiều năm trước. Ta gọi lỗi này là **false novelty** (tính mới giả).

Trước đây LumiGap gắn nhãn "Confirmed" cho một khoảng trống khi corpus của chính nó có ít bài chứa đồng thời hai thuật ngữ dò (probe terms). Đây là quy tắc *co-mention* (đếm số bài có hai thuật ngữ cùng xuất hiện). Nó là cách xếp hạng ứng viên khá hợp lý ("cặp này có vẻ ít được khai thác") nhưng không phân biệt được câu hỏi chưa có lời giải với câu hỏi có lời giải nhưng corpus không chứa. Trong Giao thức Đóng khoảng trống, số đếm co-mention thấp chỉ được giữ làm **tín hiệu xếp hạng**. Nó không bao giờ quyết định một khoảng trống là mở hay không.

Nhóm đã đo mức độ sai của quy tắc cũ trong nghiên cứu GapClose (*Absence of Evidence Is Not a Research Gap: Certified Gap Claims under Corpus Incompleteness*, bản nộp ICAI-FAI 2026, đang được bình duyệt, sau đây gọi là "bài báo của nhóm"). Các số liệu dưới đây lấy từ các bảng của bài báo đó, trên GapClose-SciFact (1.109 câu hỏi có nhãn bằng chứng do chuyên gia gán):

| Phát hiện trong bài báo của nhóm | Con số |
|---|---|
| Quy tắc co-mention, false novelty trên corpus **đầy đủ** (Bảng II) | 0,197, tức khoảng 1 trên 5 câu hỏi đã có lời giải bị gọi là mở |
| Ngưỡng tối ưu F1 (chỉnh theo độ chính xác), false novelty khi thiếu bằng chứng | tới 0,73 (BGE reranker: 0,236 trên corpus đầy đủ, 0,731 khi mất toàn bộ bằng chứng) |
| Hiệu chuẩn split-conformal chuẩn trên corpus đầy đủ | vượt mục tiêu 10% khi thiếu một phần mười bằng chứng, với 10 trên 12 điểm số |
| Quy tắc có chứng nhận (hiệu chuẩn tại chỗ hoặc chuyển giao), false novelty trung bình tệ nhất trên 12 điểm số và mọi mức xóa | 0,101 và 0,100, tức đúng mục tiêu 10% |
| Thử nghiệm hồi cứu, văn liệu đóng băng tới năm 2010 (Bảng VIII) | tới 68% khoảng trống được các bài báo sau này lấp đã được chứng nhận là mở, và 96% khoảng trống được tuyên bố mở thực sự còn mở tại thời điểm cắt |

Một minh họa khác đến từ ca nghiên cứu ESV-Gap của nhóm (bản nộp AMI 2026, phát hiện xâm nhập IoT): trong corpus cục bộ gồm 150 bài, nhóm tìm ra năm khoảng trống ứng viên. Khi tìm chủ động trên các chỉ mục bên ngoài (Semantic Scholar, OpenAlex), 4 trên 5 ứng viên bị bác bằng phản chứng; chỉ 1 ứng viên còn lại. Bốn "khoảng trống" trông như chưa ai giải quyết trong corpus cục bộ thực ra không tồn tại.

Bài học của cả hai nghiên cứu giống nhau: một tuyên bố về khoảng trống cần **một lượt tìm kiếm có ghi nhật ký ngoài corpus cục bộ**, **bằng chứng được trích nguyên văn** cho mỗi quyết định, và **một phát biểu về mức sai số**. Đó là những gì giao thức này cung cấp.

### Tín hiệu xếp hạng (ít được khám phá)

Mục này chỉ dùng để **xếp hạng** các khoảng trống ứng viên. Nó không phải quy tắc quyết định: chỉ kiểm tra đóng ở mục 3 mới có thể nói một khoảng trống là mở. Đừng trích các con số dưới đây như bằng chứng rằng một câu hỏi chưa có lời giải.

LumiGap đếm số bài trong corpus của chính nó có chứa cả hai chủ đề của một probe và so sánh với số bài mà ngẫu nhiên sẽ tạo ra. Đặt

- `N`: số bài đang hoạt động trong phạm vi đếm (corpus trong các năm đã chọn),
- `nA`, `nB`: số bài nhắc đến chủ đề A, chủ đề B,
- `nAB`: số bài nhắc đến cả hai (phần giao),
- `k`: số probe được kiểm định cùng lúc (các khoảng trống có probe của cùng một lần phân tích hoặc báo cáo).

Khi đó

```
E = nA * nB / N          phần giao kỳ vọng nếu hai chủ đề độc lập
R = nAB / E              quan sát / kỳ vọng (van Eck & Waltman 2009: độ mạnh liên kết tỷ lệ với nAB / E)
p = P(X <= nAB)          X ~ Poisson(E), tức p = exp(-E) * tổng_{j=0..nAB} E^j / j!
```

Một probe được gắn cờ **ít được khám phá** khi thỏa cả ba điều kiện:

1. `N > 0` và `min(nA, nB) >= GAP_MIN_PARENT_PAPERS` (mặc định 5), để mỗi chủ đề có đủ bài mà nói được điều gì đó;
2. `R <= GAP_UNDEREXPLORED_MAX_RATIO` (mặc định 0,5), tức nhiều nhất bằng một nửa phần giao kỳ vọng;
3. `p <= GAP_UNDEREXPLORED_ALPHA / k` (mặc định 0,05 / k, hiệu chỉnh Bonferroni khi kiểm định `k` probe cùng lúc).

Điểm xếp hạng lưu cùng khoảng trống (`evidenceConfidence`, từ 0 đến 1) là `0,5 + 0,5 * (1 - R)` khi probe được gắn cờ và `0,25 * max(0, 1 - R)` trong trường hợp còn lại. Nếu `N = 0` hoặc `min(nA, nB) = 0` thì không có tín hiệu và điểm bằng 0. Tốc độ tăng của chủ đề cha vẫn được hiển thị nhưng không còn nằm trong quy tắc.

| | N | nA | nB | nAB | E | R | p | Ít được khám phá? |
|---|---|---|---|---|---|---|---|---|
| Ví dụ minh họa | 20.000 | 400 | 300 | 1 | 6 | 0,167 | 0,0174 | Có với `k = 1` (0,0174 <= 0,05). Không với `k = 5` (0,0174 > 0,01). |
| Báo động giả | 1.000 | 20 | 15 | 0 | 0,3 | 0 | 0,7408 | Không. Phần giao rỗng là điều ngẫu nhiên dự đoán ở đây. |
| Chủ đề lớn | 20.000 | 5.000 | 4.000 | 200 | 1.000 | 0,2 | dưới 10^-100 | Có. 200 bài là nhiều, nhưng kỳ vọng là 1.000 bài. |

Dòng đầu đọc là "1 bài trong khi kỳ vọng là 6". Quy tắc cũ chỉ đếm `nAB`, bỏ qua `N`, nên sẽ gọi dòng báo động giả là "hiếm" (0 bài) và dòng chủ đề lớn là "phổ biến" (200 bài). Cả hai kết luận đều sai ở điểm quan trọng: tín hiệu phụ thuộc vào việc ngẫu nhiên sẽ đặt bao nhiêu bài vào phần giao.

Tín hiệu không làm được gì: nó không nói gì về các bài trả lời câu hỏi mà không dùng thuật ngữ của probe, hoặc không có trong corpus. Đó chính là thứ kiểm tra đóng đi tìm.

---

## 2. Định nghĩa

**Câu hỏi.** Một khoảng trống được viết thành một câu hỏi `q`. Hãy tách nó theo các khía cạnh PICOC; khía cạnh để trống sẽ không được kiểm tra.

| Khía cạnh | Ý nghĩa | Ví dụ |
|---|---|---|
| Population (đối tượng) | ai hoặc cái gì được nghiên cứu | thiết bị biên IoT |
| Intervention (can thiệp) | phương pháp được áp dụng | học liên kết (federated learning) |
| Comparison (so sánh) | so với cái gì | huấn luyện tập trung |
| Outcome (kết quả) | đo cái gì | độ trễ phát hiện |
| Context (bối cảnh) | môi trường, tập dữ liệu, giai đoạn | mạng nhà thông minh |

**Các quyết định.** Mỗi lần kiểm tra kết thúc bằng đúng một trong ba quyết định.

| Quyết định | Ý nghĩa |
|---|---|
| `CLOSED` | Có ít nhất một tài liệu trả lời câu hỏi. Khoảng trống **không** tồn tại. Câu trả lời (witness quote) được hiển thị. |
| `OPEN_CERTIFIED` | Không tài liệu nào trả lời, không còn việc dang dở, và cận false novelty `B` không vượt mức tối đa cho phép (mặc định 0,20). Khoảng trống là hợp lý và mức sai số được nêu rõ. |
| `ABSTAIN` | Quy trình không thể kết luận. Mọi lý do đều được liệt kê. Từ chối kết luận là kết quả bình thường và trung thực, không phải thất bại. |

**False novelty.** Gọi một câu hỏi là mở trong khi đã có công trình công bố trả lời nó. Giao thức chặn trên xác suất của lỗi này.

**Nhãn sàng lọc.** Mỗi tài liệu tìm được được gán nhãn so với câu hỏi:

| Nhãn | Quy tắc |
|---|---|
| `ANSWERS` | Một câu trong tiêu đề hoặc tóm tắt nêu kết quả về câu hỏi, và **mọi khía cạnh đã nêu đều khớp**. |
| `PARTIAL` | Tài liệu đề cập câu hỏi nhưng ít nhất một khía cạnh khác đi, hoặc chỉ nêu câu hỏi như một hạn chế hay hướng nghiên cứu tương lai. |
| `UNRELATED` | Tài liệu không đề cập câu hỏi. |

`ANSWERS` và `PARTIAL` cần một **trích dẫn nguyên văn** từ tiêu đề hoặc tóm tắt, dài ít nhất 20 ký tự sau khi chuẩn hóa (chữ thường, thống nhất dấu nháy và dấu gạch kiểu typography, gộp khoảng trắng liên tiếp, bỏ dấu nháy và dấu chấm ở đầu và cuối).

---

## 3. Quy trình thủ công và phiếu làm việc

Làm lần lượt theo từng bước. Hãy cố định các thiết lập ở Bước 0 **trước khi** xem bất kỳ kết quả nào, để không ai có thể chỉnh chúng cho ra đáp án đẹp hơn.

### Bước 0. Thiết lập (ghi lại trước)

| Thiết lập | Mặc định | Giá trị của bạn |
|---|---|---|
| Tham số tin cậy `delta` | 0,05 | |
| Cận tối đa cho phép `Bmax` | 0,20 | |
| Số truy vấn | tối đa 3 | |
| Số kết quả sàng lọc cho mỗi truy vấn và mỗi nguồn | 20 từ corpus LumiGap, 10 từ OpenAlex | |
| Khoảng năm tìm kiếm (tùy chọn) | không giới hạn | |
| Người đánh giá 1 / Người đánh giá 2 | | |
| Loại người phán xét (judge kind) | HUMAN khi bạn tự gán nhãn mọi tài liệu | |
| Chế độ hiệu chuẩn (Bước 5) | TRANSFER; chỉ dùng IN_SITU khi thỏa các điều kiện ở Bước 5 | |

### Bước 1. Câu hỏi và các khía cạnh (Phiếu 1)

| Trường | Nội dung |
|---|---|
| Tên / mã khoảng trống | |
| Câu hỏi `q` (một câu, kèm khẳng định mong đợi) | |
| Population | |
| Intervention | |
| Comparison | |
| Outcome | |
| Context | |

### Bước 2. Tìm kiếm có nhật ký (Phiếu 2)

Tự viết các truy vấn (kết hợp từ khóa từ các khía cạnh và từ đồng nghĩa), hoặc để AI đề xuất rồi bạn rà soát. Chạy **mọi** truy vấn trên **ít nhất hai** nguồn, ví dụ corpus LumiGap và OpenAlex (hoặc Scopus, Google Scholar, một cơ sở dữ liệu chuyên ngành). Ghi lại mọi truy vấn, kể cả những truy vấn bị lỗi. Truy vấn bị lỗi, quá thời gian hoặc bị bỏ qua được tính là "lỗi tìm kiếm" và ngăn quyết định `OPEN_CERTIFIED`.

| # | Nguồn | Nội dung truy vấn chính xác | Ngày giờ | Số kết quả đã sàng lọc | Lỗi (không / thông báo) |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

Loại các bản trùng giữa các truy vấn (cùng DOI hoặc cùng tiêu đề) và giữ lần xuất hiện đầu tiên.

### Bước 3. Sàng lọc (Phiếu 3)

Với mỗi tài liệu, đọc tiêu đề và tóm tắt rồi gán nhãn theo tiêu chí ở mục 2. Với `ANSWERS` và `PARTIAL`, chép trích dẫn **y nguyên** và kiểm tra bằng chức năng tìm kiếm của trình đọc PDF hoặc trình duyệt; nếu không tìm thấy nguyên văn thì đó không phải là trích dẫn hợp lệ.

| # | Tài liệu (tiêu đề, DOI, năm) | Tìm thấy bởi truy vấn # | Nhãn | Trích dẫn nguyên văn (>= 20 ký tự) | Khía cạnh: P / I / C / O / Ctx (khớp, khác, không nhắc tới) | Là phát biểu hạn chế hoặc hướng tương lai? (Có/Không) | Nhãn của người đánh giá thứ hai |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

Quy tắc gán nhãn:

- Chỉ gán `ANSWERS` khi câu đó nêu kết quả về cùng một mối quan hệ **và không khía cạnh nào đã nêu bị mâu thuẫn**. Khác đối tượng, khác kết quả đo hoặc khác phương pháp thì là `PARTIAL`.
- Bài viết rằng "nghiên cứu tương lai nên khảo sát q" là `PARTIAL` kèm cờ hạn chế. Nó giúp chứng minh tầm quan trọng của khoảng trống nhưng không bao giờ trả lời được câu hỏi.
- Mỗi tài liệu đều cần một nhãn. Tài liệu bạn không thể đánh giá (không đọc được, không có tóm tắt và không lấy được toàn văn) được tính là "đang chờ", và tài liệu đang chờ khiến kiểm tra kết thúc bằng `ABSTAIN`.
- Hãy tự gán nhãn trước. Người đánh giá thứ hai sau đó gán nhãn độc lập cho cùng các tài liệu (cột cuối, không bắt buộc nhưng nên làm), xem mục 7.

### Bước 4. Kiểm tra độ phủ (Phiếu 4)

Độ phủ cho biết khả năng một bài báo có câu trả lời đơn giản là không có trong các nguồn bạn đã tìm.

Bước này chỉ cần cho hiệu chuẩn **TRANSFER** (Bước 5). Hiệu chuẩn **IN_SITU** đã đo phần mất này nên có thể bỏ qua bước này; nếu vẫn làm, hãy ghi `pHat` để tham khảo nhưng không cộng vào `B`.

1. Lấy `m` DOI tham chiếu của các bài cùng chủ đề từ một nguồn **độc lập với lượt tìm kiếm của bạn**: danh mục tài liệu tham khảo của một bài tổng quan (survey) hoặc tổng quan hệ thống gần đây, hoặc danh sách do chuyên gia cung cấp. Nên dùng ít nhất 50. Không lấy từ kết quả tìm ở Bước 2.
2. Với mỗi DOI, kiểm tra xem bài đó có tìm thấy trong các nguồn bạn đã tìm ở Bước 2 không (tra theo DOI). DOI không tìm thấy ở nguồn nào là "thiếu".
3. Gọi `x` là số DOI thiếu, `pHat = ClopperPearsonUpper(x, m, delta)` (mục 4).

| Nguồn tham chiếu (tên, DOI, ngày) | |
|---|---|

| # | DOI tham chiếu | Có trong nguồn A? | Có trong nguồn B? | Thiếu (không có ở nguồn nào)? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| ... | | | | |

| Đại lượng | Giá trị |
|---|---|
| `m` (số DOI tham chiếu) | |
| `x` (số bị thiếu) | |
| `pHat` (mục 4, cận trên ở độ tin cậy 1 - delta) | |

### Bước 5. Hiệu chuẩn (Phiếu 5)

Hiệu chuẩn cho biết **chính quy trình của bạn** bỏ sót bao nhiêu phần trăm câu trả lời đang tồn tại.

Xây dựng **ít nhất 30** câu hỏi đã biết chắc là có lời giải, cùng lĩnh vực và cùng phong cách với khoảng trống bạn đang kiểm tra. Hai nguồn được chấp nhận:

- **Quyết định REJECT của chuyên gia kèm phản chứng.** Một khoảng trống bị chuyên gia bác vì đã có bài công bố trả lời cho ta một câu hỏi và một DOI chứng cứ (witness DOI).
- **Phát hiện của một bài tổng quan hoặc tổng quan hệ thống.** Một câu như "X cải thiện Y ở đối tượng Z, xem [12]" cho ta câu hỏi "X có cải thiện Y ở Z không?" và bài được trích dẫn là witness DOI.

Quy tắc xây dựng bộ câu hỏi để ước lượng trung thực:

1. Viết câu hỏi và witness DOI từ bài tổng quan hoặc ghi chú của chuyên gia, **không dùng tìm kiếm của LumiGap** (hay công cụ nào bạn dùng để sàng lọc). Nếu witness được tìm bằng chính công cụ đó thì phép thử bị vòng tròn và `epsHat` sẽ quá nhỏ.
2. Diễn đạt mỗi câu hỏi như cách một khoảng trống thật được diễn đạt. Không sao chép tiêu đề bài chứng cứ.
3. Viết truy vấn cho mỗi câu hỏi hiệu chuẩn **trước khi** xem bài chứng cứ.
4. Dùng đúng quy trình như với khoảng trống thật: cùng số truy vấn, cùng nguồn, cùng số kết quả sàng lọc, cùng tiêu chí, và **cùng loại người phán xét** (người với người, AI với AI).

Với mỗi câu hỏi, chạy Bước 2 và Bước 3. Câu hỏi là **FOUND** nếu có tài liệu được gán nhãn `ANSWERS` (kèm trích dẫn hợp lệ), và là **MISSED** nếu không có tài liệu nào như vậy sau khi mọi tài liệu đã có nhãn và không truy vấn nào lỗi. Câu hỏi có truy vấn lỗi hoặc tài liệu chưa có nhãn là "đang chờ" và chưa được tính cho đến khi hoàn tất.

| # | Câu hỏi | Witness DOI | Nhãn đến từ đâu (ghi chú chuyên gia / survey + tài liệu) | Kết quả (FOUND / MISSED) | Trích dẫn đã đóng câu hỏi |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| ... | | | | | |
| 30 | | | | | |

| Đại lượng | Giá trị |
|---|---|
| `n` (số câu hỏi) | |
| `misses` (số MISSED) | |
| `epsHat = ClopperPearsonUpper(misses, n, delta)` | |

Lưu ý: một câu hỏi cũng được tính là MISSED khi witness của nó hoàn toàn không có trong các nguồn đã tìm. Điều này là chủ ý (xem mục 6).

**Chế độ hiệu chuẩn.** Chọn khi tạo hiệu chuẩn, trước khi chạy câu hỏi nào; sau đó không đổi được.

| Chế độ | Cận | Dùng khi |
|---|---|---|
| `IN_SITU` | `B = epsHat` | Thỏa cả ba: (1) câu hỏi và DOI witness được viết từ một survey, tổng quan hệ thống hoặc ghi chú chuyên gia, **không** nhìn vào các nguồn sẽ tìm (quy tắc 1 ở trên), nên witness có khả năng vắng mặt trong nguồn giống như lời giải của một khoảng trống thật; (2) hiệu chuẩn chạy trên cùng nguồn, cùng khoảng năm, cùng ngân sách truy vấn và kết quả với các lần kiểm tra sẽ dùng nó; (3) các nguồn chưa thay đổi nhiều kể từ đó (chạy lại hiệu chuẩn sau một đợt nhập dữ liệu lớn hoặc sau thời gian dài). |
| `TRANSFER` | `B = epsHat + pHat` | Mọi trường hợp khác. Đây là mặc định, cần kiểm tra độ phủ (Bước 4), và vẫn hợp lệ khi nguồn đã thay đổi. |

Vì sao `IN_SITU` không cần kiểm tra độ phủ: câu hỏi có witness vắng mặt được tính là MISSED, nên `epsHat` đã đo *cả hai* cách một câu hỏi đã có lời giải bị gọi là mở (lời giải vắng mặt, lời giải có mặt nhưng bị bỏ sót). Đây là ý tưởng hiệu chuẩn tại chỗ trong bài báo của nhóm (Định lý 1). Xem mục 6.

### Bước 6. Quyết định (Phiếu 6)

Áp dụng các quy tắc theo thứ tự này và dừng ở quy tắc đầu tiên thỏa mãn.

1. **Có tài liệu nào có nhãn hiệu lực là `ANSWERS` không?** Nếu có, quyết định là `CLOSED`. Ghi lại tài liệu witness và trích dẫn của nó. (Nếu có nhiều, ưu tiên tài liệu đã được một người xác nhận.) Không cần gì thêm: trích dẫn chính là bằng chứng.
2. Nếu không, kiểm tra từng điều kiện. Mỗi điều kiện thỏa mãn là một lý do ABSTAIN:

| Mã lý do | Áp dụng khi | Áp dụng? |
|---|---|---|
| `SEARCH_ERRORS` | có ít nhất một truy vấn lỗi, quá thời gian hoặc bị bỏ qua | |
| `PENDING_REVIEW` | có ít nhất một tài liệu chưa có nhãn hiệu lực (kể cả nhãn `ANSWERS` hoặc `PARTIAL` của AI mà trích dẫn không tìm thấy nguyên văn) | |
| `NO_COVERAGE` | hiệu chuẩn là `TRANSFER` và chưa có kiểm tra độ phủ (Bước 4) | |
| `NO_CALIBRATION` | chưa có hiệu chuẩn đã tính (Bước 5) | |
| `CALIBRATION_JUDGE_MISMATCH` | hiệu chuẩn được chạy với loại người phán xét khác với lần kiểm tra này (xem bên dưới) | |
| `BOUND_EXCEEDS_MAX` | `B` (`epsHat` với `IN_SITU`, `epsHat + pHat` với `TRANSFER`) lớn hơn `Bmax` | |

3. Nếu không điều kiện nào thỏa mãn, quyết định là `OPEN_CERTIFIED`. Nếu có ít nhất một điều kiện thỏa mãn, quyết định là `ABSTAIN`, và danh sách lý do là một phần của kết quả.

Tính `B`: với hiệu chuẩn `IN_SITU` thì `B = epsHat`; với hiệu chuẩn `TRANSFER` thì `B = epsHat + pHat`, làm tròn 4 chữ số thập phân (tối đa 1). Vì hai thành phần đã được làm tròn lên tới 4 chữ số, cứ cộng đúng như đã ghi.

**Loại người phán xét.** Lần kiểm tra là `HUMAN` chỉ khi một người đã gán nhãn **mọi** tài liệu; ngược lại là `AI`. Lần kiểm tra không sàng lọc tài liệu nào (không có tài liệu) được tính là `AI`, vì chỉ các truy vấn quyết định; khi làm thủ công, hãy coi tìm kiếm rỗng là dấu hiệu truy vấn quá hẹp và viết lại. Hiệu chuẩn phải cùng loại người phán xét với lần kiểm tra.

| Mục | Giá trị |
|---|---|
| Quyết định | CLOSED / OPEN_CERTIFIED / ABSTAIN |
| Tài liệu witness và trích dẫn (nếu CLOSED) | |
| Chế độ hiệu chuẩn; `epsHat` (+ `pHat` nếu TRANSFER) = `B` | |
| `B <= Bmax`? | |
| Các lý do (nếu ABSTAIN) | |
| Có đồng thuận bổ trợ (corroborated)? (một tài liệu `PARTIAL` có cờ hạn chế, từ bài mà khoảng trống **không** được suy ra) | |
| Người quyết định, ngày | |

Corroboration được báo cáo vì nó cho thấy các tác giả khác cũng coi câu hỏi này là còn mở. Nó **không** thuộc về cận và không bắt buộc để đạt `OPEN_CERTIFIED`.

---

## 4. Tính cận Clopper-Pearson bằng tay

`ClopperPearsonUpper(x, m, delta)` là cận tin cậy trên một phía của một tỉ lệ quan sát được là `x` sự kiện trên `m` lần thử (Clopper và Pearson, 1934). Đó là tỉ lệ `p` mà ở đó một thí nghiệm nhị thức với `m` lần thử cho `x` sự kiện trở xuống với xác suất đúng bằng `delta`. Nó cố ý lớn hơn `x / m`: với ít quan sát, ta phải tính đến rủi ro xui xẻo. Luôn **làm tròn lên** 4 chữ số thập phân, để số hiển thị không bao giờ nhỏ hơn giá trị chính xác.

**Trường hợp x = 0 (không có sự kiện).** Công thức đóng:

```
pUpper = 1 - delta ^ (1 / m)
```

Kiểm tra bằng máy tính: `m = 50`, `delta = 0.05`: `0.05^(1/50) = exp(ln(0.05) / 50) = exp(-0.059915) = 0.941845`, nên `pUpper = 0.058155`, làm tròn lên thành **0,0582**. Với `m = 30`: `0.05^(1/30) = 0.904966`, `pUpper = 0.095034`, làm tròn lên thành **0,0951**. (Quy tắc nhẩm gần đúng: khoảng `3 / m` khi delta = 0,05.)

**Trường hợp x >= 1.** Dùng bảng tính. Trong Excel, Google Sheets hoặc LibreOffice Calc:

```
=BETA.INV(1 - delta, x + 1, m - x)
```

Ví dụ `=BETA.INV(0.95, 4, 27)` với `x = 3`, `m = 30` cho 0,238598, làm tròn lên thành **0,2386**. (Công thức này cũng đúng khi `x = 0`: `=BETA.INV(0.95, 1, m)`.) Ở các bản Excel cũ, hàm tên là `BETAINV`. Nếu `x = m` thì cận bằng 1.

**Bảng tính sẵn cho delta = 0,05** (làm tròn lên 4 chữ số; giá trị được tính bằng phép chia đôi trên phân phối nhị thức chính xác và đối chiếu với phân vị Beta ở trên):

| m \ x | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 20 | 0,1392 | 0,2162 | 0,2827 | 0,3437 | 0,4011 | 0,4556 |
| 30 | 0,0951 | 0,1486 | 0,1954 | 0,2386 | 0,2797 | 0,3190 |
| 50 | 0,0582 | 0,0914 | 0,1207 | 0,1479 | 0,1738 | 0,1989 |
| 100 | 0,0296 | 0,0466 | 0,0617 | 0,0758 | 0,0892 | 0,1023 |

Với `m`, `x` hoặc `delta` khác, hãy dùng công thức bảng tính.

**Bạn "chịu được" bao nhiêu** (mặc định `Bmax = 0,20`, mọi giá trị lấy từ bảng):

- `n = 30` câu hỏi hiệu chuẩn với 0 lần bỏ sót (`epsHat = 0,0951`) và `m = 50` tham chiếu với 0 bị thiếu (`pHat = 0,0582`): `B = 0,1533`, đạt chứng nhận. Chỉ cần một lần bỏ sót trong 30 câu (`epsHat = 0,1486`) thì `B = 0,2068`, đã quá lớn.
- `n = 50` với tối đa 2 lần bỏ sót (0,1207) cộng `m = 50`, `x = 0` (0,0582): `B = 0,1789`, đạt. Với 3 lần bỏ sót (0,1479): `B = 0,2061`, quá lớn.
- Dưới khoảng 20 câu hỏi ở mỗi phía thì không thể đạt `Bmax = 0,20` ngay cả khi không bỏ sót lần nào (`n = 20`, `m = 20`, không sự kiện: `B = 0,1392 + 0,1392 = 0,2784`).
- Với hiệu chuẩn `IN_SITU` thì không phải trả phần `pHat`: `n = 20` không bỏ sót cho `B = 0,1392`, `n = 30` bỏ sót 1 cho `B = 0,1486`, `n = 50` bỏ sót tối đa 5 cho `B <= 0,1989`, đều đạt chứng nhận. Cái giá là các điều kiện ở Bước 5.

Cận này trung thực với mẫu nhỏ: muốn chứng nhận khoảng trống thì phải đầu tư vào bộ hiệu chuẩn và danh sách tham chiếu lớn hơn.

---

## 5. Ví dụ minh họa từ đầu đến cuối

Mọi câu hỏi, bài báo và trích dẫn dưới đây đều **được bịa ra để minh họa**, không phải trích dẫn thật.

### Ví dụ (a): OPEN_CERTIFIED

**Câu hỏi.** "Nén mô hình có làm thay đổi độ chính xác nhận dạng chữ viết tay tiếng Việt trên thiết bị di động không?" Các khía cạnh: đối tượng = chữ viết tay tiếng Việt; can thiệp = nén mô hình; kết quả = độ chính xác nhận dạng; bối cảnh = thiết bị di động.

**Thiết lập.** `delta = 0,05`, `Bmax = 0,20`. Loại người phán xét: HUMAN.

**Tìm kiếm.** 3 truy vấn, mỗi truy vấn chạy trên corpus LumiGap (top 20) và trên OpenAlex (10 kết quả): ghi nhật ký 6 lượt tìm, 0 lỗi. Sau khi loại trùng, 41 tài liệu được một người đánh giá sàng lọc. Kết quả: 33 `UNRELATED`, 8 `PARTIAL` (nén mô hình trên chữ Latin, hoặc nhận dạng chữ viết tay không có nén). Không có `ANSWERS`. Mọi tài liệu đều có nhãn nên không có tài liệu đang chờ. Hai tài liệu `PARTIAL` nêu trong phần tóm tắt rằng việc triển khai trên di động "vẫn chờ được nghiên cứu", được gắn cờ phát biểu hạn chế.

**Độ phủ.** Nguồn tham chiếu: danh mục tài liệu tham khảo của một bài tổng quan năm 2025 về nhận dạng chữ viết tay. `m = 50` DOI, tất cả đều tìm thấy trong corpus LumiGap hoặc OpenAlex, nên `x = 0`.

```
pHat = 1 - 0.05^(1/50) = 0.058155  ->  0.0582
```

**Hiệu chuẩn.** 30 câu hỏi với witness DOI lấy từ các phát hiện của bài tổng quan và viết ra mà không dùng tìm kiếm của LumiGap; cùng quy trình và cùng người phán xét. Quy trình đóng được cả 30 câu: `n = 30`, `misses = 0`.

```
epsHat = 1 - 0.05^(1/30) = 0.095034  ->  0.0951
```

**Quyết định.**

```
B = epsHat + pHat = 0.0951 + 0.0582 = 0.1533
0.1533 <= 0.20
```

Không lỗi tìm kiếm, không tài liệu đang chờ, có độ phủ, có hiệu chuẩn cùng loại người phán xét, cận nằm trong mức tối đa: **OPEN_CERTIFIED**, `B = 0,1533`. (Nếu 30 câu hỏi được chạy như hiệu chuẩn `IN_SITU` thỏa các điều kiện ở Bước 5 thì không cần kiểm tra độ phủ và `B = epsHat = 0,0951`.) Phát biểu là: "nếu câu hỏi này đã có lời giải thì quy trình gọi nó là mở với xác suất tối đa 0,1533, ở độ tin cậy ít nhất 90%" (ý nghĩa chính xác xem mục 6). Khoảng trống này còn được **corroborated** (hai tài liệu nêu câu hỏi như hướng nghiên cứu tương lai).

### Ví dụ (b): CLOSED với trích dẫn witness

**Câu hỏi.** "Học liên kết (federated learning) có làm giảm độ trễ phát hiện xâm nhập trên thiết bị biên IoT không?" Các khía cạnh: đối tượng = thiết bị biên IoT; can thiệp = federated learning; kết quả = độ trễ phát hiện.

**Tìm kiếm.** 2 truy vấn trên corpus cục bộ và OpenAlex, không lỗi, sàng lọc 27 tài liệu. Tài liệu số 9 (bịa, "Bài D9", 2024) có câu sau trong phần tóm tắt:

> "We find that federated learning reduces detection latency by 30% on edge devices."

Sàng lọc Bài D9:

| Kiểm tra | Kết quả |
|---|---|
| Trích dẫn tìm thấy nguyên văn trong tóm tắt (dùng chức năng tìm) | có; trích dẫn dài 81 ký tự, nhiều hơn mức tối thiểu 20 |
| Population: thiết bị biên | khớp |
| Intervention: federated learning | khớp |
| Outcome: độ trễ phát hiện | khớp (giảm 30%) |
| Có khía cạnh nào bị mâu thuẫn? | không |
| Nhãn | `ANSWERS` |

**Quyết định.** `CLOSED`. Witness là Bài D9 và trích dẫn trên. Khoảng trống không tồn tại, và không cần độ phủ hay hiệu chuẩn để kết luận như vậy: một trích dẫn đã kiểm chứng là đủ. (Nếu cũng câu đó nhưng nói về đối tượng khác, chẳng hạn "trên máy chủ", thì nhãn sẽ là `PARTIAL` và câu hỏi vẫn còn mở.)

Một biện pháp phòng ngừa hợp lý: nhờ người thứ hai xác nhận trích dẫn và sự khớp khía cạnh cho mọi quyết định `CLOSED`. Một `CLOSED` sai làm sinh viên mất một đề tài tốt.

### Ví dụ (c): ABSTAIN

Cùng câu hỏi và nguồn như ví dụ (a), nhưng với các sự kiện sau:

- Một truy vấn OpenAlex trả về lỗi HTTP và không được chạy lại.
- Hai tài liệu có nhãn AI `ANSWERS` nhưng trích dẫn không tìm thấy nguyên văn trong tóm tắt; chưa ai rà soát.
- Kiểm tra độ phủ thấy 3 trên 30 DOI tham chiếu bị thiếu (`m = 30`, `x = 3`): `pHat = 0,2386`.
- Bộ hiệu chuẩn có `n = 30` và 3 lần bỏ sót: `epsHat = 0,2386`. Nó được chạy với người phán xét là người, nhưng lần kiểm tra có hai tài liệu chưa có nhãn nên được tính là `AI`.

```
B = 0.2386 + 0.2386 = 0.4772  >  0.20
```

Quyết định: **ABSTAIN**, với các lý do

| Lý do | Vì sao |
|---|---|
| `SEARCH_ERRORS` | một truy vấn bị lỗi |
| `PENDING_REVIEW` | hai tài liệu chưa có nhãn hiệu lực |
| `CALIBRATION_JUDGE_MISMATCH` | hiệu chuẩn là HUMAN, lần kiểm tra là AI |
| `BOUND_EXCEEDS_MAX` | 0,4772 lớn hơn 0,20 |

Việc cần làm tiếp: chạy lại truy vấn lỗi, rà soát hai tài liệu (có thể một trong hai thực sự là `ANSWERS`, khi đó quyết định thành `CLOSED`), và cải thiện độ phủ hoặc hiệu chuẩn. Lưu ý rằng ngay cả khi ba lý do đầu được khắc phục, `B = 0,4772` cho thấy các nguồn hoặc quy trình quá yếu để chứng nhận bất cứ điều gì về chủ đề này.

---

## 6. Vì sao cận này đúng

Nói bằng lời. Một câu hỏi *đã có lời giải* chỉ có thể bị gọi nhầm là mở vì hai lý do:

1. **Mọi** tài liệu trả lời nó đều không có trong các nguồn ta đã tìm (vấn đề độ phủ).
2. Có tài liệu trả lời, nhưng tìm kiếm hoặc sàng lọc của ta bỏ sót (vấn đề quy trình).

Ta ước lượng khả năng của lý do thứ nhất bằng kiểm tra độ phủ (`pHat`), và khả năng của lý do thứ hai bằng hiệu chuẩn (`epsHat`). Khả năng một trong hai điều xảy ra nhiều nhất bằng tổng hai khả năng. Mỗi số là một cận tin cậy trên, nên tổng cũng là một cận tin cậy trên, với độ tin cậy giảm đi đôi chút.

Trong năm dòng:

```
q đã có lời giải; W = tập tài liệu trả lời (ít nhất 1); p = xác suất một tài liệu của W vắng mặt trong các nguồn đã tìm
(1) false novelty = "tuyên bố mở trong khi đã đóng"  =>  A hoặc E
    A = mọi tài liệu của W đều vắng         P(A) <= p^|W| <= p
    E = có tài liệu của W hiện diện nhưng quy trình không gán nhãn ANSWERS      P(E) <= eps
(2) P(false novelty) <= P(A) + P(E) <= p + eps                       (cận hợp)
(3) pHat >= p với xác suất >= 1 - delta; epsHat >= eps với xác suất >= 1 - delta   (Clopper-Pearson)
(4) cả hai cùng đúng với xác suất >= 1 - 2 delta  =>  P(false novelty) <= pHat + epsHat = B
```

Với `delta = 0,05` mặc định, phát biểu đúng với độ tin cậy 90%.

**Hiệu chuẩn tại chỗ (`IN_SITU`).** Các câu hỏi hiệu chuẩn đi qua đúng quy trình sẽ phán xét khoảng trống: cùng nguồn, khoảng năm, ngân sách truy vấn, ngân sách kết quả, tiêu chí và loại người phán xét. Một câu hỏi hiệu chuẩn chỉ là FOUND khi có tài liệu trả lời hiện diện **và** được gán nhãn `ANSWERS`, nên MISSED bao gồm cả A lẫn E:

```
eps* = P(A hoặc E) với một câu hỏi đã có lời giải   (đại lượng hiệu chuẩn đo trực tiếp)
(1) P(false novelty) = eps*
(2) epsHat >= eps* với xác suất >= 1 - delta   (Clopper-Pearson trên misses / n)
(3) =>  P(false novelty) <= epsHat = B, với độ tin cậy 1 - delta (mặc định 95%)
```

Không cần cận hợp, nên đảm bảo vừa chặt hơn vừa có độ tin cậy cao hơn. Nó dựa trên việc các câu hỏi hiệu chuẩn hoán đổi được với các câu hỏi khoảng trống **kể cả khả năng lời giải của chúng bị thiếu**: vì vậy witness phải lấy từ ngoài các nguồn được tìm, và phải chạy lại hiệu chuẩn khi nguồn thay đổi. Trong bài báo của nhóm, đây là Định lý 1, đúng với mọi tỉ lệ thiếu, kể cả khi không biết tỉ lệ đó.

**Phát biểu này có nghĩa là gì.** `B` chặn trên xác suất một câu hỏi *đã có lời giải* bị gọi nhầm là mở, với các câu hỏi cùng loại với bộ hiệu chuẩn. Đó là phát biểu về sai số dài hạn của quy trình trên các câu hỏi đã có lời giải. Nó **không** phải xác suất một khoảng trống cụ thể đã được chứng nhận là sai; điều đó phụ thuộc vào việc có bao nhiêu câu hỏi ứng viên thực sự còn mở, mà giao thức không biết.

**Các giả định** (đảm bảo chỉ tốt bằng các giả định này):

1. **Thiếu một cách ngẫu nhiên.** Các tài liệu trả lời vắng mặt trong các nguồn một cách độc lập với câu hỏi (một bài không dễ vắng hơn chỉ vì nó trả lời một khoảng trống). Nếu cả một nhánh lĩnh vực bị thiếu thì giả định này không còn đúng.
2. **Hiệu chuẩn mang tính đại diện.** Các câu hỏi hiệu chuẩn lấy từ cùng lĩnh vực, cùng phong cách câu hỏi với các khoảng trống đang kiểm tra; witness của chúng độc lập với tìm kiếm của LumiGap (hay công cụ sàng lọc); và chúng độc lập với nhau.
3. **Cùng loại người phán xét và cùng quy trình.** Hiệu chuẩn dùng cùng loại người phán xét (người hoặc AI) và cùng ngân sách truy vấn, nguồn, số kết quả, tiêu chí như lần kiểm tra khoảng trống. Phần mềm từ chối chứng nhận nếu khác (`CALIBRATION_JUDGE_MISMATCH`).
4. **Mẫu độ phủ mang tính đại diện.** Các DOI tham chiếu là mẫu công bằng của những bài có thể trả lời các câu hỏi như vậy, và độc lập với lượt tìm kiếm.

**Một chi tiết mang tính thận trọng (TRANSFER).** Một câu hỏi hiệu chuẩn mà witness vắng mặt trong các nguồn được tính là MISSED. Vì vậy `epsHat` đã bao gồm một phần phần mất do độ phủ, và cộng thêm `pHat` đếm trùng một phần. Tổng này do đó phóng đại sai số thực thay vì đánh giá thấp. `TRANSFER` giữ phép cộng vì nó vẫn hợp lệ khi hiệu chuẩn và lần kiểm tra không nhìn cùng một tập nguồn; khi chúng cùng nguồn, hãy dùng `IN_SITU` và bỏ `pHat`.

**Quan hệ với bài báo của nhóm.** Các định lý GapClose hiệu chuẩn một *ngưỡng* trên điểm đóng liên tục và đơn điệu bằng conformal prediction (hiệu chuẩn tại chỗ, Định lý 1; chuyển giao với cận trên của tỉ lệ thiếu, Định lý 2), và hệ quả của chúng cho `P(false novelty) <= alpha + delta` khi tỉ lệ thiếu được ước lượng bằng cận Clopper-Pearson. Giao thức này không dùng điểm số hay ngưỡng: nó làm việc với nhãn rời rạc (một tiêu chí do người hoặc AI áp dụng) và đo trực tiếp tỉ lệ bỏ sót của quy trình. `IN_SITU` theo lập luận của Định lý 1 (hiệu chuẩn dưới cùng mức thiếu hụt, không cần ước lượng tỉ lệ thiếu); `TRANSFER` kết hợp hai cận bằng phép cận hợp (union bound) thuần túy. Đây là **sự điều chỉnh** của nhóm cho ý tưởng đó trên nhãn rời rạc do người hoặc AI gán. Nó liên quan tới, nhưng **không đồng nhất với** các định lý trong bài báo của nhóm, và dạng cận hợp đơn giản hóa này **chưa được bình duyệt**. Bài báo của nhóm đang được bình duyệt (bản nộp ICAI-FAI 2026). Hãy trình bày với giảng viên như một lập luận minh bạch, kiểm tra được, không phải một định lý đã công bố.

---

## 7. Khả năng tái lập và vai trò của AI

**Hai người đánh giá.** Với mỗi lần kiểm tra khoảng trống, một người thứ hai nên gán nhãn độc lập các tài liệu (không xem nhãn của người thứ nhất) và chỉ ghi lại nhãn của mình. Mức đồng thuận giữa hai người được đo bằng **hệ số kappa của Cohen**:

```
po = tỉ lệ tài liệu mà hai nhãn giống nhau
pe = tổng theo nhãn L của (tỉ lệ người 1 gán L) * (tỉ lệ người 2 gán L)
kappa = (po - pe) / (1 - pe)
```

Ví dụ với 4 tài liệu, nhãn (người 1, người 2): (ANSWERS, ANSWERS), (ANSWERS, ANSWERS), (UNRELATED, UNRELATED), (UNRELATED, ANSWERS). `po = 3/4`. Người 1 gán ANSWERS 2/4 và UNRELATED 2/4; người 2 gán ANSWERS 3/4 và UNRELATED 1/4, nên `pe = 0,5 * 0,75 + 0,5 * 0,25 = 0,5` và `kappa = (0,75 - 0,5) / (1 - 0,5) = 0,5`. Kappa bằng 1 là đồng thuận hoàn toàn và bằng 0 là đồng thuận không hơn ngẫu nhiên. Hãy báo cáo kèm số tài liệu; với ít hơn 2 cặp thì kappa không xác định. Khi hai người bất đồng về một `ANSWERS`, hãy cùng xem lại trích dẫn và các khía cạnh và thống nhất một nhãn trước khi quyết định; kappa thấp nghĩa là câu hỏi hoặc các khía cạnh cần được viết rõ hơn.

**Hồ sơ (dossier).** Mỗi lần kiểm tra tạo ra một hồ sơ chứa mọi thứ cần để làm lại quyết định bằng tay:

- phiên bản giao thức, câu hỏi, các khía cạnh, khoảng năm, `delta` và `Bmax`;
- toàn bộ nhật ký truy vấn (nguồn, nội dung, thời gian, số kết quả, lỗi);
- mọi tài liệu cùng nhãn và trích dẫn của AI, nhãn, trích dẫn và khía cạnh của người đánh giá, nhãn của người đánh giá thứ hai và cờ hạn chế;
- kiểm tra độ phủ (nguồn tham chiếu, từng DOI có hay thiếu) và hiệu chuẩn (từng câu hỏi, witness DOI và FOUND hay MISSED);
- `epsHat`, `pHat`, `B`, quyết định, trích dẫn witness hoặc danh sách lý do abstain, cờ corroboration và kappa của Cohen;
- chế độ hiệu chuẩn và phép tính bằng các dòng dễ đọc, ví dụ `B = 0.0951 + 0.0582 = 0.1533 <= 0.2` (TRANSFER) hoặc `B = epsHat = 0.0951 <= 0.2` (IN_SITU).

**AI được dùng như thế nào.** AI chỉ làm hai việc: **đề xuất truy vấn tìm kiếm** (tối đa ba, người dùng có thể thay hoặc sửa) và **gán nhãn sơ bộ** cho mọi tài liệu theo tiêu chí, kèm một câu trích dẫn. Phần mềm sau đó kiểm tra mỗi trích dẫn của AI có thực sự xuất hiện nguyên văn trong tiêu đề hoặc tóm tắt không; nhãn `ANSWERS` hay `PARTIAL` của AI mà trích dẫn không tìm thấy thì không được tính cho tới khi một người rà soát. Nhãn của người luôn ghi đè nhãn của AI. AI không bao giờ tính `epsHat`, `pHat` hay `B`, và không bao giờ đưa ra quyết định: những việc đó do các quy tắc tất định và người bấm "decide" (người tạo khoảng trống hoặc chủ dự án) thực hiện. Vì AI là tùy chọn, mọi thứ trong tài liệu này đều có thể làm mà không cần nó.

---

## 8. Hạn chế

Hãy nêu rõ những điều này khi trình bày phương pháp.

1. **Corpus nhỏ, nhiều lần abstain.** Với bộ hiệu chuẩn hay danh sách tham chiếu nhỏ, cận sẽ lớn (mục 4) và kết quả trung thực là `ABSTAIN`. Hãy chờ đợi nhiều lần abstain với các chủ đề hẹp.
2. **Tóm tắt có thể không chứa câu trả lời.** Việc sàng lọc dùng tiêu đề và tóm tắt. Bài có kết quả chỉ nằm trong toàn văn sẽ trông như `UNRELATED` hoặc `PARTIAL`. Điều này không bị che giấu: những thất bại như vậy hiện ra thành các câu hỏi hiệu chuẩn MISSED và làm tăng `epsHat`.
3. **Thiên lệch của người sở hữu.** Nếu người đề xuất khoảng trống cũng là người sàng lọc tài liệu, họ có thể muốn khoảng trống đó tồn tại. Hãy dùng người đánh giá thứ hai không phải người đề xuất, ghi lại kappa, và nhờ người khác xác nhận mọi `CLOSED` và mọi `OPEN_CERTIFIED`.
4. **Lệch miền của hiệu chuẩn.** Nếu các câu hỏi hiệu chuẩn đến từ lĩnh vực khác, thập kỷ khác hay phong cách câu hỏi khác, `epsHat` không mô tả khoảng trống đang xét. Bài báo của nhóm cũng cảnh báo rằng câu hỏi hiệu chuẩn nên cùng lĩnh vực và cùng loại với các ứng viên (thí nghiệm hold-out cho false novelty cao hơn đôi chút so với thí nghiệm lấy mẫu lại, dù không loại trừ được nhiễu lấy mẫu).
5. **Thiên lệch của mẫu độ phủ.** Danh mục tài liệu tham khảo của một bài tổng quan phản ánh những gì các tác giả chọn trích dẫn và có thể nghiêng về các bài nổi tiếng.
6. **Corroboration không nằm trong cận.** Các tài liệu `PARTIAL` và phát biểu hạn chế chỉ thêm ý nghĩa. Một khoảng trống có thể là `OPEN_CERTIFIED` mà không có corroboration, và corroboration không làm khoảng trống "chắc chắn" hơn.
7. **Loại khoảng trống là một bước định tính riêng.** Phân loại khoảng trống (ví dụ bằng chứng mâu thuẫn, phương pháp, đối tượng, lý thuyết; xem khung của Robinson và cộng sự, Müller-Bloch và Kranz) là phán đoán của con người, thực hiện sau khi khoảng trống đã được chứng nhận. Cận không nói gì về điều đó.
8. **Phạm vi của tuyên bố.** Cận nói về các câu hỏi đã có lời giải bị gọi là mở. Nó không chứng nhận rằng câu hỏi đáng nghiên cứu, khả thi, hay mới so với các nguồn chưa được tìm (toàn văn trả phí, tài liệu xám, các ngôn ngữ khác).
9. **Chưa được bình duyệt.** Dạng cận hợp (mục 6) và bài báo của nhóm đang được bình duyệt. Bằng chứng từ bài báo (mục 1) đến từ các thí nghiệm benchmark và hồi cứu trên SciFact và Climate-FEVER, không phải từ người dùng LumiGap.

---

## 9. Tài liệu tham khảo

1. Snilstveit B, Vojtkova M, Bhavsar A, Stevenson J, Gaarder M (2016). Evidence & Gap Maps: A tool for promoting evidence informed policy and strategic research agendas. *Journal of Clinical Epidemiology* 79:120-129. doi:10.1016/j.jclinepi.2016.05.015
2. Robinson KA, Saldanha IJ, McKoy NA (2011). Development of a framework to identify research gaps from systematic reviews. *Journal of Clinical Epidemiology* 64(12):1325-1330. doi:10.1016/j.jclinepi.2011.06.009
3. Müller-Bloch C, Kranz J (2015). A Framework for Rigorously Identifying Research Gaps in Qualitative Literature Reviews. *ICIS 2015 Proceedings*.
4. Sandberg J, Alvesson M (2011). Ways of constructing research questions: gap-spotting or problematization? *Organization* 18(1):23-44. doi:10.1177/1350508410372151
5. Swanson DR (1986). Fish oil, Raynaud's syndrome, and undiscovered public knowledge. *Perspectives in Biology and Medicine* 30(1):7-18.
6. van Eck NJ, Waltman L (2009). How to normalize co-occurrence data? An analysis of some well-known similarity measures. *Journal of the American Society for Information Science and Technology* 60(8):1635-1651. doi:10.1002/asi.21075
7. Clopper CJ, Pearson ES (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika* 26(4):404-413.
8. Cohen J (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement* 20(1):37-46.
9. Le AH, Phan LVK, Nguyen DT, Nguyen DH, Ho DA, Truong L. *Absence of Evidence Is Not a Research Gap: Certified Gap Claims under Corpus Incompleteness* (bản thảo GapClose). Bản nộp ICAI-FAI 2026, đang được bình duyệt. Mã nguồn và ghi chú lý thuyết: `ESV-Gap/gapclose` trong kho nghiên cứu của nhóm.
10. ESV-Gap: *An Auditable Autonomous Scientific Reasoning Framework for Evidence-Grounded Hypothesis Triage (A Case Study in IoT Cybersecurity)*. Bản nộp AMI 2026.
