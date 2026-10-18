# Trend Methodology Design — Định nghĩa, công thức và độ tin cậy của "xu hướng" (bản rút gọn)

> Spec cho implementation plan. Cập nhật: 2026-10-16 (bản 2, rút gọn theo khung NSF + USGS).
> Branch: `tori-21-adjust-research-topic-trends`.
> Phạm vi: `apps/backend/src/modules/trends/`, `packages/shared-types/src/trend.ts`, `apps/web/src/features/trends/`, `apps/web/src/features/docs/` (mới), `apps/web/src/pages/`.

---

## 1. Vấn đề và quyết định

Chức năng Xu hướng phải trả lời ba câu hỏi: **xu hướng là gì**, **tính bằng công thức gì**, **có đáng tin không**.

**Hiện trạng (2026-10-16):**

- Backend có 6 phương pháp: quasi-Poisson, Mann–Kendall, Sen's slope, Benjamini–Hochberg, log odds ratio, PP(top 10%).
  - Từng phương pháp đều có nguồn tốt.
  - Nhưng **tổ hợp** này do dự án tự ghép. Không tổ chức nào công bố hay kiểm chứng tổ hợp đó.
- Xếp hạng và nhãn trên UI lại dùng các chỉ số đếm thô chưa kiểm định: `momentum`, YoY, CAGR.
- Hệ thống không đưa ra kết luận cuối cùng nào.

**Quyết định:** dựa trên **hai tài liệu của hai tổ chức chính phủ**, mỗi tài liệu lo một phần, thay cho việc tự ghép nhiều bài báo.

| Phần | Tổ chức | Tài liệu |
|---|---|---|
| Định nghĩa và đại lượng đo (thị phần công bố) | National Science Foundation (NSF / NCSES), Mỹ | *Science & Engineering Indicators*, báo cáo "Publications Output" và Technical Appendix |
| Phát hiện xu hướng, độ lớn, độ tin cậy | U.S. Geological Survey (USGS) | Helsel, D. R., Hirsch, R. M., Ryberg, K. R., Archfield, S. A., & Gilroy, E. J. (2020). *Statistical Methods in Water Resources*. USGS Techniques and Methods 4-A3. doi:10.3133/tm4A3. Chương phân tích xu hướng: Mann–Kendall và Sen's slope, có khoảng tin cậy. |

Bổ sung **một** phương pháp chuẩn, bắt buộc khi kiểm định nhiều chủ đề cùng lúc: Benjamini & Hochberg (1995).

**Bỏ khỏi kết luận:** quasi-Poisson, luật "hai kiểm định đồng thuận" của bản spec 1, `momentum`, YoY, CAGR.

---

## 2. Định nghĩa

> **Một chủ đề là xu hướng tăng (giảm)** khi **thị phần** công bố của nó trong lĩnh vực của nó có xu hướng **tăng (giảm) đơn điệu, có ý nghĩa thống kê** theo kiểm định Mann–Kendall, trên các năm đã hoàn chỉnh dữ liệu.

- Thị phần, thay vì số bài thô: NSF đo năng lực khoa học bằng thị phần công bố, vì tổng số công bố toàn cầu luôn tăng. Đếm thô sẽ khiến gần như mọi chủ đề đều "tăng".
- **Đơn vị:** OpenAlex Topic (`primary_topic.id`).
- **Quần thể tham chiếu** `N_t`: số bài cùng `primary_topic.field.id`, cùng bộ lọc phạm vi trừ các mệnh đề taxonomy. Đây là cách code hiện tại đang làm.
- **Năm sử dụng:** từ `yearFrom` đến `lastCompleteYear = min(yearTo, năm hiện tại − 1)`, bỏ các năm có `N_t = 0`. Cửa sổ mặc định 10 năm.

---

## 3. Công thức

| Bước | Công thức | Nguồn |
|---|---|---|
| 1. Thị phần | `s_t = n_t / N_t × 100` (%) | NSF |
| 2. Kiểm định Mann–Kendall | `S = Σ_{i<j} sgn(s_j − s_i)`; `Var(S) = [n(n−1)(2n+5) − Σ t_p(t_p−1)(2t_p+5)] / 18`; `Z = (S−1)/√Var(S)` nếu S>0, `0` nếu S=0, `(S+1)/√Var(S)` nếu S<0; p hai phía từ phân phối chuẩn | USGS (Helsel et al. 2020); gốc: Mann 1945, Kendall 1975 |
| 3. Độ lớn: Sen's slope | `b = median_{i<j} (s_j − s_i)/(t_j − t_i)`, đơn vị điểm %/năm | USGS; gốc: Sen 1968 |
| 4. CI95 của Sen's slope | Sắp N' độ dốc cặp tăng dần. `C = z_{0.975}·√Var(S)`, `M1 = (N' − C)/2`, `M2 = (N' + C)/2`. Cận dưới là độ dốc thứ `M1`, cận trên là độ dốc thứ `M2 + 1` (đánh số từ 1, nội suy khi không nguyên) | USGS; Gilbert (1987) |
| 5. Mức thay đổi tương đối (chỉ để dễ đọc) | `r = b / median(s_t) × 100` (%/năm so với mức thị phần điển hình) | Quy ước trình bày của dự án, không phải kiểm định |
| 6. Hiệu chỉnh nhiều kiểm định (chỉ ở danh sách overview) | Benjamini–Hochberg: `q_(i) = min_{j≥i}(m·p_(j)/j)` trên p của Mann–Kendall | Benjamini & Hochberg (1995) |

Chuỗi số bài thô `n_t` vẫn được vẽ biểu đồ như **dữ liệu mô tả**.

---

## 4. Kết luận và độ tin cậy

### 4.1 Hàm `classifyTrend` (backend, `trend.verdict.ts`)

```ts
type TrendVerdict = "rising" | "declining" | "stable" | "insufficient";
type TrendConfidence = "high" | "medium";
type TrendReasonCode =
  | "LOCAL_CORPUS" | "TOO_FEW_YEARS" | "TOO_FEW_PAPERS"
  | "SIGNIFICANT_INCREASE" | "SIGNIFICANT_DECREASE" | "NO_SIGNIFICANT_TREND";

interface TrendClassification {
  verdict: TrendVerdict;
  confidence: TrendConfidence | null;     // chỉ có khi rising/declining
  yearsUsed: number;                       // n
  totalPapers: number;
  mannKendall: { s: number; z: number; tau: number; pValue: number } | null;
  qValue: number | null;                   // chỉ ở overview
  senSlope: number | null;                 // điểm %/năm
  senSlopeCi95: [number, number] | null;
  relativeChangePct: number | null;        // r
  reasons: TrendReasonCode[];
}
```

Gọi `p*` là `qValue` khi có (overview), ngược lại là `pValue` (trang chi tiết, chỉ một giả thuyết). Ngưỡng `α = 0.05`.

| # | Điều kiện (xét theo thứ tự) | Verdict |
|---|---|---|
| 1 | `source = "local"` | `insufficient` (`LOCAL_CORPUS`) |
| 2 | `n < 5` | `insufficient` (`TOO_FEW_YEARS`) |
| 3 | `totalPapers < 30` | `insufficient` (`TOO_FEW_PAPERS`) |
| 4 | `p* < α` và `S > 0` | `rising` |
| 5 | `p* < α` và `S < 0` | `declining` |
| 6 | Còn lại | `stable` (`NO_SIGNIFICANT_TREND`) |

**Độ tin cậy** (chỉ cho `rising` / `declining`):

- `high` khi `p* < 0.01` **và** `n ≥ 8`.
- `medium` cho các trường hợp còn lại.

### 4.2 Căn cứ của các ngưỡng

| Ngưỡng | Căn cứ | Loại |
|---|---|---|
| `α = 0.05` | Mức ý nghĩa quy ước trong USGS và thống kê nói chung | Chuẩn |
| `n ≥ 5` | Với `n = 4`, Mann–Kendall không thể đạt p < 0.05: S tối đa = 6, Var = 8.67, Z = 1.70, p ≈ 0.089. Với `n = 5`: Z = 2.20, p ≈ 0.027 | Suy ra toán học |
| `totalPapers ≥ 30` | Tránh để thị phần dựa trên vài bài lẻ | **Quy ước dự án** |
| `high`: `p* < 0.01` và `n ≥ 8` | Bằng chứng mạnh hơn mức 0.05 và chuỗi đủ dài | **Quy ước dự án** |

Mọi hằng số khai báo một chỗ (export từ `trend.verdict.ts`). Trang Tài liệu hiển thị đúng các giá trị này và ghi rõ "quy ước dự án" cho ngưỡng nào là quy ước.

### 4.3 Hạn chế (bắt buộc ghi trên trang Tài liệu)

1. **Tự tương quan.** Mann–Kendall giả định các năm độc lập. Thị phần năm sau thường gần năm trước, nên p có thể nhỏ hơn thực tế. USGS nêu hạn chế này. Với cửa sổ 10 năm, dự án không hiệu chỉnh.
2. **Dữ liệu local không đại diện.** Khi OpenAlex không khả dụng, `N_t` là số bài đã sync. Con số này phản ánh việc sync, không phản ánh khoa học thực tế, nên verdict luôn là `insufficient`.
3. **Ứng viên thiên về chủ đề lớn.** Overview chỉ xét 30–200 chủ đề lớn nhất trong phạm vi (trang `group_by` đầu tiên của OpenAlex). Chủ đề nhỏ mới nổi có thể không xuất hiện.
4. **Phân loại chủ đề của OpenAlex** được gán tự động. Một bài chỉ tính vào chủ đề chính (`primary_topic`).
5. **Xu hướng là mô tả quá khứ**, không phải dự báo.
6. **p xấp xỉ chuẩn.** USGS khuyến nghị p chính xác khi n ≤ 10; dự án dùng xấp xỉ chuẩn cho mọi n nên p là gần đúng (n = 5, S = 10: chính xác 0.017, xấp xỉ 0.027). Quy tắc n ≥ 5 vẫn đúng với p chính xác.

---

## 5. Xếp hạng (overview)

- `sortBy: "trend" | "total"`, mặc định `"trend"`. Giá trị cũ `momentum` / `growth` được map sang `"trend"`.
- Thứ tự `trend`:
  1. Nhóm theo verdict: `rising` → `stable` → `declining` → `insufficient`.
  2. Trong `rising`, sắp `relativeChangePct` giảm dần.
  3. Trong `declining`, sắp `relativeChangePct` tăng dần.
  4. Trong `stable` và `insufficient`, sắp `totalPapers` giảm dần.
- `recommendedComparisons`: tối đa 3 chủ đề `rising` đầu tiên.

---

## 6. Phạm vi thay đổi code

### 6.1 Backend và shared types

- **Thêm:**
  - `senSlopeCi95` trong `trend.statistics.ts`.
  - `trend.verdict.ts` (hằng số + `classifyTrend` + hàm sort).
  - Unit test.
- `TrendingTopic` và topic detail có `classification: TrendClassification`.
- **Bỏ** `shareTest` / `poisson` khỏi response và types. Đánh dấu `momentum`, `growthRatePct`, `cagr3yPct` là `@deprecated`, không dùng để sort hay gắn nhãn.
  - `poissonTrend` và các test của nó có thể xoá. Nếu còn nơi khác dùng thì để nguyên nhưng không gọi trong luồng trend.
- **Giữ (thông tin bổ sung, không ảnh hưởng verdict):**
  - Từ khoá nổi lên (log odds + BH).
  - PP(top 10%).
- Không đổi Prisma schema.

### 6.2 Web: trang Xu hướng

- Badge verdict, confidence, `relativeChangePct` và Sen's slope (CI95) trên thẻ, danh sách và trang chi tiết.
- Bỏ các thẻ Fastest / Highest growth / Most established và mọi nhãn "papers/year", YoY, CAGR.
- Mỗi kết luận có link "Cách tính" trỏ tới mục tương ứng trên trang Tài liệu.

### 6.3 Web: trang Tài liệu (`/docs`)

Trang tài liệu phân mục, có thể mở rộng cho các chức năng khác sau này.

- **Registry dạng dữ liệu:** mỗi mục là `{ id, group, title, body }`.
  - Thêm một chức năng mới chỉ cần thêm một file nội dung và đăng ký vào registry.
- **Bố cục:**
  - Sidebar mục lục theo nhóm.
  - Nội dung bên phải.
  - Anchor URL `/docs/:sectionId` để link sâu.
  - Responsive: trên mobile, sidebar thành menu chọn.
- **Nhóm mục ban đầu:**
  1. **Giới thiệu:** cách đọc tài liệu, nguyên tắc minh bạch phương pháp.
  2. **Xu hướng nghiên cứu:**
     - định nghĩa;
     - dữ liệu và phạm vi;
     - thị phần;
     - Mann–Kendall;
     - Sen's slope và CI95;
     - mức thay đổi tương đối;
     - Benjamini–Hochberg;
     - quy tắc kết luận và độ tin cậy (bảng §4.1, §4.2);
     - thông tin bổ sung (từ khoá nổi lên, PP(top 10%));
     - hạn chế (§4.3);
     - ví dụ tính tay nhỏ.
  3. **Thuật ngữ:** giải thích cho người mới, ví dụ thị phần, p-value, mức ý nghĩa, khoảng tin cậy, kiểm định phi tham số, trung vị, đa kiểm định / FDR, OpenAlex Topic/Field, năm hoàn chỉnh, trích dẫn chuẩn hoá, ...
  4. **Tài liệu tham khảo:** danh mục đầy đủ, mỗi mục ghi tổ chức hoặc tác giả, năm, DOI hoặc URL và vai trò trong phương pháp.
- **Nội dung tiếng Việt** là chính, có bản tiếng Anh. Công thức hiển thị dạng khối monospace, không thêm thư viện mới.
- Thêm link "Tài liệu" vào navigation chính.

---

## 7. Tiêu chí chấp nhận

1. `classifyTrend` và `senSlopeCi95` có unit test cho:
   - từng dòng §4.1;
   - `n = 4` → `insufficient`;
   - local → `insufficient`;
   - một chuỗi đối chiếu với kết quả tính tay.
2. Không còn nơi nào trên UI sort hay gắn nhãn theo `momentum`, YoY, CAGR.
3. Trang Tài liệu hiển thị đúng các hằng số của backend và ghi rõ ngưỡng nào là quy ước dự án.
4. Mọi DOI trên trang Tài liệu đã được kiểm qua Crossref. Tài liệu không có DOI có URL chính thức đã mở được.
5. `pnpm typecheck` và `pnpm test` xanh. Docker build thành công.

---

## 8. Tài liệu tham khảo

**Khung chính:**

- National Science Board / NCSES. *Science & Engineering Indicators*: Publications Output: U.S. Trends and International Comparisons, kèm Technical Appendix.
- Helsel, D. R., Hirsch, R. M., Ryberg, K. R., Archfield, S. A., & Gilroy, E. J. (2020). *Statistical Methods in Water Resources*. USGS Techniques and Methods, book 4, chap. A3. doi:10.3133/tm4A3

**Nguồn gốc các phép tính** (đã có trong `trend-methodology.ts`, DOI đã kiểm):

- Mann (1945)
- Kendall (1975)
- Sen (1968)
- Benjamini & Hochberg (1995)
- Gilbert, R. O. (1987). *Statistical Methods for Environmental Pollution Monitoring*. Van Nostrand Reinhold. (Không có DOI.)

**Thông tin bổ sung:**

- Woolf (1955), Haldane (1956): từ khoá nổi lên.
- Waltman & Schreiber (2013) và tài liệu OpenAlex: PP(top 10%).
