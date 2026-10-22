# 01 — Scientific Literature Review

> Checkpoint 1 · Ngày lập: 2026-10-21 · Phạm vi: chức năng Research Trends của LumiGap
> Tài liệu này chỉ tóm tắt và đối chiếu phương pháp. Không có thay đổi code nào đi kèm.

## 0. Quy ước trạng thái xác minh

| Nhãn | Ý nghĩa |
|---|---|
| **VERIFIED (full text)** | Đã đọc toàn văn bản gốc (hoặc bản preprint/bản mở rộng của chính tác giả), có số mục/trang/phương trình. |
| **VERIFIED (author source)** | Không đọc được bài báo, nhưng đã đọc một tài liệu khác của **cùng nhóm tác giả** mô tả cùng thuật toán (ví dụ: bằng sáng chế). Chi tiết có thể khác nhẹ so với bài báo. |
| **SECONDARY** | Chỉ xác nhận qua bài báo khác trích dẫn lại. |
| **UNVERIFIED** | Chưa xác minh được. Không được dùng làm căn cứ triển khai. |

Mỗi công thức bên dưới được gắn một trong ba loại: **[GỐC]** đúng như bài báo, **[ĐIỀU CHỈNH]** đã thay đổi để hợp với dữ liệu OpenAlex, **[ĐỀ XUẤT]** do tài liệu này đề xuất, không phải của tác giả.

| # | Bài báo | Nguồn đã đọc | Trạng thái |
|---|---|---|---|
| 1 | Nelis et al. (2022), PLOS ONE 17(5): e0268433, doi:10.1371/journal.pone.0268433 | Toàn văn PMC9122180 (Europe PMC full-text XML, có MathML của phương trình) | **VERIFIED (full text)** |
| 2 | Porter, Garner, Carley & Newman (2019), TFSC 146:628–643, doi:10.1016/j.techfore.2018.04.016 | ScienceDirect trả 403; bản NSF-PAR không kết nối được. Đã đọc bằng sáng chế US 10,803,124 B2 (Garner, Carley, Newman, Porter; Search Technology Inc.) và bài thứ cấp arXiv:2211.01348 | Thuật toán: **VERIFIED (author source)**. Nội dung riêng của bài 2019 (phần "key players", kết quả kiểm chứng): **UNVERIFIED** |
| 3 | Kleinberg (2002), KDD '02, doi:10.1145/775047.775061 | Bản mở rộng cùng tên, *Data Mining and Knowledge Discovery* 7:373–397 (2003), toàn văn 25 trang | **VERIFIED (full text, bản tạp chí)**. Bản KDD 2002 không đọc riêng; phần thuật toán của hai bản là một |
| 4 | Rotolo, Hicks & Martin (2015), Research Policy 44(10):1827–1843, doi:10.1016/j.respol.2015.06.006 | Preprint arXiv:1503.00673 (44 trang, bản "in press") | **VERIFIED (full text, preprint)**. Số trang dưới đây là của preprint |

---

## 1. Nelis et al. (2022) — General Growth Tendency (GGT)

### 1.1 Vấn đề: record inflation bias

Tổng số công bố của mọi lĩnh vực cộng lại tăng đều theo thời gian. Vì vậy số bài của một lĩnh vực có thể tăng chỉ vì nó **giữ nhịp** với mức tăng chung, không phải vì nó đang hấp dẫn hơn. Tác giả gọi sai lệch này là *general publication record inflation*. Đếm thô hoặc tăng trưởng thô (YoY, CAGR) đều chịu sai lệch này.

### 1.2 Công thức [GỐC] — Methods, mục "GGT calculation and interpretation", Eq (i)

```
GGT_y = [ (PS_y − PS_{y−1}) / PS_{y−1}  −  (PO_y − PO_{y−1}) / PO_{y−1} ] × 100%
```

- `PS_y`: số công bố của lĩnh vực quan tâm trong năm `y`.
- `PO_y`: tổng số công bố (articles + reviews) trong cơ sở dữ liệu tham chiếu năm `y`.
- **Reference publication growth** = `(PO_y − PO_{y−1}) / PO_{y−1}`.
- Tham chiếu mặc định của bài là **toàn bộ Web of Science** (articles + reviews). Khi phân tích lĩnh vực, tác giả loại chỉ mục ESCI (thêm năm 2015) vì gây đứt gãy chuỗi. Tham chiếu theo ngành/category là **tùy chọn**, không phải mặc định.

GGT là **hiệu** hai tốc độ tăng, không phải tỷ số.

### 1.3 Annual GGT và Mean GGT

- **Annual GGT:** công thức trên, tính cho từng năm so với năm trước.
- **Mean GGT:** bài báo báo cáo "average GGT (2012–2018)" kèm SEM. **Bài không viết công thức riêng.** Cách hiểu hợp lý nhất là trung bình cộng các GGT năm trong giai đoạn. → Ghi chú: phép trung bình cộng là **[SUY LUẬN]**, không phải trích dẫn.
- Phân tích xu hướng của GGT theo thời gian trong bài dùng **tương quan Spearman** (không dùng Mann–Kendall).
- Tác giả **không dùng trung bình trượt** vì có thể tạo mẫu hình giả và làm sai phép tương quan.

### 1.4 Diễn giải [GỐC] — mục "Applying the GGT to analyse trends of well-known fields"

| Phân loại (GGT ổn định) | Ngưỡng |
|---|---|
| Consistent decrease | GGT < −10% |
| No consistent growth | −5% < GGT < 5% |
| Consistent growth | 5% < GGT < 15% |
| Consistent strong growth | 15% < GGT < 40% |
| Consistent intense growth | 40% < GGT < 80% |
| Unsustainable growth | GGT > 80% |

Lưu ý khi dùng bảng này:
- Khoảng **−10% … −5% không được gán nhãn** trong bài gốc. Nếu triển khai phải ghi rõ là khoảng trống của bài, không tự đặt tên rồi gắn cho tác giả.
- Ở chỗ khác bài viết GGT > 100% là dấu hiệu lĩnh vực non trẻ / tăng trưởng không bền, không khớp hẳn với mốc 80%.

### 1.5 Điều kiện áp dụng [GỐC]

Chỉ coi GGT là "tăng trưởng đã khử lạm phát" khi:
1. GGT **ổn định**: biến động giữa các năm < 50% và GGT < 100%;
2. lĩnh vực có **≥ 50 công bố/năm**.

Nguyên văn điều kiện 1 là "less than 50% year-to-year variation". Bài **không định nghĩa** cách đo "variation" (hiệu tuyệt đối theo điểm %, thay đổi tương đối, hay độ lệch chuẩn). Điều kiện 2 cũng không nói rõ là mọi năm hay trung bình. Phân tích hai cách hiểu và quyết định triển khai ở `CHECKPOINT_1_5_REVIEW.md` §2.3.

### 1.6 Hạn chế tác giả nêu

- Bỏ dữ liệu 2019–2021 vì bản ghi còn được cập nhật (độ trễ index).
- Đứt gãy do thay đổi cơ sở dữ liệu (WoS 1991, ESCI 2015) làm hỏng chuỗi.
- Lĩnh vực sớm (< ~50 bài/năm) có GGT dao động mạnh.
- GGT phụ thuộc tập tham chiếu, phải công bố tập tham chiếu.
- Nhạy với chuỗi truy vấn (tìm theo tiêu đề hay toàn văn).
- Nên trình bày **cùng** số liệu thô, không thay thế.

### 1.7 Quan hệ toán học với "thị phần" (dùng ở mục 03)

Gọi `g_S`, `g_O` là tốc độ tăng của chủ đề và của tham chiếu; thị phần `s_y = PS_y / PO_y`. Khi đó:

```
tốc độ tăng thị phần  r_y = s_y / s_{y−1} − 1 = (1 + g_S)/(1 + g_O) − 1
GGT_y                 = g_S − g_O = r_y × (1 + g_O)
```

→ **[SUY RA]** GGT và tốc độ tăng thị phần cùng dấu và gần bằng nhau khi `g_O` nhỏ (OpenAlex: vài %/năm). Đây là lý do một hệ thống đã dùng thị phần đã **khử được record inflation**; GGT bổ sung một **đơn vị đọc trực quan theo năm** và bộ ngưỡng diễn giải có trích dẫn.

---

## 2. Porter et al. (2019) — Emergence Scoring (EScore)

### 2.1 Mục đích

Tìm **thuật ngữ** (term) đang nổi lên trong một tập bản ghi có tóm tắt (abstract record set), sau đó dùng các term nổi lên để tìm **key players** (tác giả, tổ chức, quốc gia) ở tiền tuyến nghiên cứu. Thuật toán gốc được trình bày kỹ hơn ở Carley et al. (2018), *Scientometrics* 115:35–49 (doi:10.1007/s11192-018-2654-5) và được cài trong phần mềm VantagePoint.

### 2.2 Thuật toán — nguồn: bằng sáng chế US 10,803,124 B2 (cùng 4 tác giả) [VERIFIED (author source)]

**Cửa sổ thời gian:** ví dụ chuẩn 10 năm = **3 năm base** + **7 năm active**; người dùng chỉnh được.

**Điều kiện để một term được xét (tất cả phải thỏa):**
1. Xuất hiện trong **≥ 7 bản ghi**;
2. Xuất hiện trong bản ghi của **≥ 3 năm**;
3. Tỷ lệ bản ghi active : base **≥ 2 : 1**;
4. "The term did not appear in **15% or more** of the base period records" (term không phổ biến từ trước);
5. Có **> 1 tác giả** với tập bản ghi không trùng hoàn toàn (tránh một nhóm duy nhất);
6. Term đơn từ phải đạt điểm gấp đôi cụm nhiều từ, và điểm cuối bị chia 2.

**Thành phần xu hướng** (mỗi thành phần chuẩn hóa theo **căn bậc hai tổng số bản ghi của kỳ** để khử tăng trưởng của cả tập dữ liệu):
- **Active Period Trend** — so sánh 3 năm cuối với 3 năm đầu của kỳ active (trọng số 2);
- **Recent Trend** — 2 năm gần nhất so với 2 năm trước đó (hệ số 10);
- **Mid-Year to Last Year Slope** — độ dốc từ giữa kỳ active tới năm cuối (hệ số 10).

**Tổ hợp (ví dụ ESc5 trong bằng sáng chế):**
```
EScore = 2 × ActivePeriodTrend + (RecentTrend + MidYearToLastYearSlope)
```
Cách đặt ngoặc của công thức slope trong văn bản bằng sáng chế **không rõ ràng** → nếu triển khai phải coi là **[ĐIỀU CHỈNH]** và kiểm tra lại với bài gốc hoặc VantagePoint script.

**Ngưỡng:** term "emergent" khi EScore ≥ **√π ≈ 1.77** (chọn thực nghiệm, nằm giữa 1.5 và 2; có thể chỉnh).

**Chỉ báo cấp hai (key players):** cộng `√EScore` của các term vượt ngưỡng trên từng bản ghi ("Total EScore"), có thể chia cho √(số bản ghi) ("Normalized Total EScore"), rồi gộp theo tác giả/tổ chức/quốc gia.

### 2.3 Điều kiện dữ liệu và kiểm chứng

- Cần **văn bản** (title + abstract) để trích term (VantagePoint NLP), cần **tác giả/tổ chức** để lọc điều kiện 5 và để tính key players.
- Theo bài thứ cấp (arXiv:2211.01348): chính Porter et al. (2019) thừa nhận **EScore chủ yếu phản ánh tăng trưởng**, không đo trực tiếp novelty, persistence, community. Nhiều nghiên cứu sau phê bình EScore hay bắt **hot topics** hơn là **emerging topics**. → **SECONDARY**.
- Phần kiểm chứng thực nghiệm cụ thể của bài 2019 (bộ dữ liệu, chỉ số đánh giá): **UNVERIFIED**.

### 2.4 Khả năng áp dụng với OpenAlex

| Yêu cầu của EScore | OpenAlex qua `group_by` có không? |
|---|---|
| Đếm bản ghi chứa term theo năm | **Có**, nếu "term" = `keywords.id` (group_by `publication_year` với filter `keywords.id:X`), 1 request/term |
| Tổng số bản ghi theo năm (để chuẩn hóa √) | **Có** |
| % bản ghi base chứa term | **Có** (tỷ số hai count) |
| > 1 tác giả độc lập | **Gần đúng**: `group_by=authorships.author.id` trên filter term (1 request/term) |
| Trích term từ abstract theo kiểu VantagePoint | **Không** — OpenAlex Keywords là nhãn do mô hình sinh (xem 02 §5), không phải cụm từ trích từ văn bản. Dùng keywords thay term là **[ĐIỀU CHỈNH]** |

Kết luận: có thể cài một **biến thể** EScore trên OpenAlex Keywords, nhưng phải gọi tên là "EScore-style (adapted)" và ghi rõ khác biệt. Không được gọi là "Porter EScore".

---

## 3. Kleinberg (2002) — Burst Detection

### 3.1 Mô hình liên tục (§2, trang 6–8)

- Automaton vô hạn trạng thái `A*_{s,γ}`. Trạng thái `q_i` phát thông điệp với khoảng cách thời gian phân phối mũ `f_i(x) = α_i e^{−α_i x}`, `α_i = ĝ^{−1} s^i`, `ĝ = T/n`, `s > 1`.
- Chi phí chuyển trạng thái: `τ(i, j) = (j − i) γ ln n` khi `j > i`; bằng 0 khi `j < i` (đi xuống miễn phí).
- Mục tiêu: chuỗi trạng thái có chi phí nhỏ nhất
  `c(q | x) = Σ τ(i_t, i_{t+1}) + Σ −ln f_{i_t}(x_t)`, giải bằng quy hoạch động kiểu Viterbi.
- Các khoảng có trạng thái ≥ i tạo thành **burst lồng nhau** (cây phân cấp).

Mô hình này dùng **khoảng cách giữa các lần đến**, không áp dụng được cho dữ liệu đếm theo năm.

### 3.2 Mô hình theo lô (§4 "Enumerating Bursts", trang 14–16) — phù hợp với dữ liệu năm [GỐC]

- `n` lô; lô `t` có `r_t` tài liệu liên quan trên tổng `d_t`. `R = Σ r_t`, `D = Σ d_t`.
- Automaton `B*_{s,γ}`: trạng thái `q_i` có tỷ lệ kỳ vọng `p_i = p_0 s^i`, `p_0 = R/D`, chỉ định nghĩa khi `p_i ≤ 1`; bản `k` trạng thái là `B^k_{s,γ}`.
- Chi phí phát xạ (nhị thức):
  `σ(i, r_t, d_t) = −ln[ C(d_t, r_t) p_i^{r_t} (1 − p_i)^{d_t − r_t} ]`
- Chi phí chuyển như `τ` ở trên.
- **Burst intensity**: chỉ số trạng thái `i`. **Burst period**: khoảng `[t1, t2]` nằm ở trạng thái cao.
- **Burst weight** (với `B²_s`): `Σ_{t=t1}^{t2} (σ(0, r_t, d_t) − σ(1, r_t, d_t))` — mức giảm chi phí khi dùng trạng thái burst thay vì trạng thái nền. Luôn không âm trên chuỗi tối ưu. Xếp hạng burst theo weight.
- **Tham số mặc định [GỐC]:** "γ will often be set to a default value of 1" (§2, trang 9 bản tạp chí); ký hiệu `A*_s` nghĩa là `A*_{s,1}`, và `B²_s` dùng cùng quy ước (γ = 1).
- Ví dụ trong bài: tiêu đề SIGMOD/VLDB 1975–2001 và STOC/FOCS 1969–2001, `B²_2` (s = 2, γ = 1); bài State of the Union dùng `B²_8`, `B²_16`. Giá trị `s` được chọn theo từng dữ liệu, bài không đưa ra một `s` dùng chung.
- *Đính chính Checkpoint 1.5:* bản Checkpoint 1 viết "bài không đưa ra một giá trị γ mặc định" — sai; đã sửa thành γ = 1 theo trang 9.

### 3.3 Khả năng áp dụng cho dữ liệu năm của OpenAlex

- `r_t` = số bài của topic/keyword năm `t`, `d_t` = số bài của tập tham chiếu (field) năm `t` → khớp đúng với **thị phần** hệ thống đang dùng.
- **Rủi ro định lượng [PHÂN TÍCH]:**
  1. OpenAlex cho `d_t` cỡ 10⁵–10⁷. Khi `d_t` rất lớn, chi phí nhị thức `σ` lớn hơn rất nhiều so với `γ ln n` (với `n` ≈ 10 năm, `ln n ≈ 2.3`). Hầu như mọi dao động nhỏ của thị phần sẽ tạo ra burst. → Phải hiệu chỉnh `s`, `γ`, hoặc dùng `d_t` đã thu nhỏ / mô hình quá phân tán (đây sẽ là **[ĐIỀU CHỈNH]**, không có trong bài).
  2. Chỉ ~10 lô/năm: số burst có thể có rất ít, độ phân giải thời gian thô. Kleinberg thiết kế cho chuỗi dài (hàng chục lô trở lên).
  3. `p_0 = R/D` là thị phần trung bình **của cả cửa sổ**: khi đổi cửa sổ năm thì burst đổi theo. Phải hiển thị cửa sổ.
- Dữ liệu theo tháng: OpenAlex có `publication_date` nhưng nhiều bài chỉ có năm (ngày mặc định 01-01) → đếm theo tháng sẽ dồn vào tháng 1. Không khuyến nghị dùng tháng khi chưa kiểm tra chất lượng ngày.

---

## 4. Rotolo, Hicks & Martin (2015) — What is an emerging technology?

### 4.1 Định nghĩa [GỐC] (preprint, trang 13)

> Emerging technology là công nghệ **mới về căn bản** và **tăng trưởng tương đối nhanh**, có **mức độ gắn kết** nhất định **duy trì theo thời gian**, có **tiềm năng tác động lớn** lên kinh tế–xã hội; tác động nổi bật nhất nằm ở tương lai nên trong giai đoạn nổi lên vẫn **bất định và mơ hồ**. *(diễn giải, không trích nguyên văn)*

### 4.2 Năm thuộc tính và khả năng đo (preprint §4.1–§4.5)

| Thuộc tính | Lý thuyết | Cách đo trong khoa trắc lượng (retrospective) | Đo được bằng OpenAlex aggregate? |
|---|---|---|---|
| **Radical novelty** | Nguyên lý mới hoặc dùng sang miền mới | Citation analysis, co-word, overlay mapping; topic/cụm mới xuất hiện | **Một phần**: thời điểm keyword/topic xuất hiện lần đầu; base-period share (giống EScore điều kiện 4). OpenAlex Topics là danh sách cố định 4.516 → không phát hiện được topic mới thật sự |
| **Relatively fast growth** | Tăng nhanh **so với** công nghệ khác trong cùng miền (§4.2: "relatively fast growth rates compared to non-emerging technologies") | Đếm tài liệu theo năm, trend analysis, số tác giả tăng | **Có**: thị phần trong field, GGT, Mann–Kendall/Sen |
| **Coherence** | Có bản sắc, ổn định theo thời gian | Entropy, clustering, độ đặc mạng trích dẫn/term, sự bền vững của cụm | **Rất hạn chế**: topic do mô hình gán, không có cụm động; có thể đo gần đúng bằng độ tập trung keyword hoặc co-topic, nhưng chưa có căn cứ kiểm chứng |
| **Prominent impact** | Tác động kinh tế–xã hội tiềm năng | Trích dẫn, bằng sáng chế, tài trợ | **Một phần**: PP(top 10%), FWCI; có độ trễ trích dẫn |
| **Uncertainty & ambiguity** | Kết quả chưa rõ | Phân tích kỳ vọng, nội dung | **Không**. Bài nêu rõ: "Scientometrics is also of little use in the operationalisation of uncertainty and ambiguity" (preprint trang 30, mục kết luận) |

### 4.3 Vai trò đúng của Rotolo

Rotolo **không** đưa ra một thuật toán hay một điểm số. Đây là **khung khái niệm** để:
- giải thích một chủ đề "emerging" thỏa thuộc tính nào và chưa thỏa thuộc tính nào;
- tránh gọi một chủ đề là "emerging" chỉ vì nó tăng nhanh (chỉ là một trong năm thuộc tính);
- nhắc rằng các thuộc tính đổi theo pha (pre-emergence → emergence → post-emergence, Figure 2).

→ Trong sản phẩm, Rotolo nên xuất hiện ở **lớp giải thích** ("bằng chứng cho 2/5 thuộc tính, 3 thuộc tính chưa đo được"), không ở lớp tính điểm.

---

## 5. Các phương pháp hệ thống đang dùng (ngoài 4 bài trên)

Đã đối chiếu công thức trong code với nguồn được trích trong code; chi tiết ở `02` §3.

| Phương pháp | Nguồn | Nhận xét |
|---|---|---|
| Mann–Kendall (có hiệu chỉnh ties, continuity correction) | Mann (1945); Kendall (1975); Helsel et al. (2020) USGS TM 4-A3 | Công thức đúng. Giả định độc lập chuỗi; p xấp xỉ chuẩn |
| Sen's slope + CI95 (rank method) | Sen (1968); Gilbert (1987) §16.5; Helsel et al. (2020) | Công thức đúng |
| Benjamini–Hochberg | Benjamini & Hochberg (1995) | Công thức đúng |
| Log odds ratio 2×2 (Haldane + Woolf) | Woolf (1955); Haldane (1956) | Công thức đúng; vấn đề nằm ở **cách dùng** với N rất lớn (02 §3.6) |
| PP(top 10%) | Waltman & Schreiber (2013) | Đúng khái niệm; giá trị OpenAlex thay đổi khi đổi classifier (10/2026) |
| Thị phần công bố | NSF/NCSES Science & Engineering Indicators (theo spec nội bộ) | Spec nội bộ trích NSF; **chưa xác minh lại trong checkpoint này** → UNVERIFIED tại đây (không ảnh hưởng tính đúng của phép chia) |
| Tự tương quan làm phồng ý nghĩa MK | Hamed & Rao (1998), *J. Hydrology* 204:182–196; Yue et al. (2002), *Hydrol. Process.* 16:1807–1829 | Trích từ hiểu biết chung, **chưa mở bản gốc trong checkpoint này** → UNVERIFIED; chỉ dùng để nêu rủi ro, không dùng làm căn cứ triển khai |

---

## 6. So sánh và giới hạn kết luận

- Bốn phương pháp đo **những thứ khác nhau**: GGT = tăng trưởng tương đối từng năm; Kleinberg = giai đoạn tần suất cao bất thường; EScore = term mới tăng nhanh trong một kỳ; Rotolo = khung định nghĩa.
- **Không có** nghiên cứu nào trong bốn bài so sánh thực nghiệm các phương pháp này với nhau trên OpenAlex. Vì vậy tài liệu này **không kết luận phương pháp nào tốt hơn**. Mọi đề xuất kết hợp ở `03`–`05` là **[ĐỀ XUẤT]** và cần bước kiểm chứng (P5 trong `05`).

## 7. Danh mục tham khảo

1. Nelis, J. L. D., Rosas da Silva, G., Ortuño, J., Tsagkaris, A. S., Borremans, B., Haslova, J., Colgrave, M. L., & Elliott, C. T. (2022). The General Growth Tendency: A tool to improve publication trend reporting by removing record inflation bias and enabling quantitative trend analysis. *PLOS ONE*, 17(5), e0268433. https://doi.org/10.1371/journal.pone.0268433
2. Porter, A. L., Garner, J., Carley, S. F., & Newman, N. C. (2019). Emergence scoring to identify frontier R&D topics and key players. *Technological Forecasting and Social Change*, 146, 628–643. https://doi.org/10.1016/j.techfore.2018.04.016
3. Garner, J. G., Carley, S. F., Newman, N. C., & Porter, A. L. Technological emergence scoring and analysis platform. US Patent 10,803,124 B2. https://patents.google.com/patent/US10803124B2/en
4. Carley, S. F., Newman, N. C., Porter, A. L., & Garner, J. G. (2018). An indicator of technical emergence. *Scientometrics*, 115(1), 35–49. https://doi.org/10.1007/s11192-018-2654-5 (không đọc được toàn văn)
5. Kleinberg, J. (2002). Bursty and hierarchical structure in streams. *KDD '02*, 91–101. https://doi.org/10.1145/775047.775061 — bản mở rộng: *Data Mining and Knowledge Discovery*, 7, 373–397 (2003), https://doi.org/10.1023/A:1024940629314
6. Rotolo, D., Hicks, D., & Martin, B. R. (2015). What is an emerging technology? *Research Policy*, 44(10), 1827–1843. https://doi.org/10.1016/j.respol.2015.06.006 — preprint arXiv:1503.00673
7. Helsel, D. R., Hirsch, R. M., Ryberg, K. R., Archfield, S. A., & Gilroy, E. J. (2020). *Statistical Methods in Water Resources*. USGS TM 4-A3. https://doi.org/10.3133/tm4A3
8. Benjamini, Y., & Hochberg, Y. (1995). *JRSS B*, 57(1), 289–300. https://doi.org/10.1111/j.2517-6161.1995.tb02031.x
9. Waltman, L., & Schreiber, M. (2013). On the calculation of percentile-based bibliometric indicators. *JASIST*, 64(2), 372–379. https://doi.org/10.1002/asi.22775
10. Bài thứ cấp về EScore: arXiv:2211.01348, "Detecting Emerging Technologies in Artificial Intelligence Scientific Ecosystem".
