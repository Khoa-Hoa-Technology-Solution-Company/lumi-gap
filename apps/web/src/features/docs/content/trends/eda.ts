import { DOCS_SECTIONS as S, docsPath } from "../../docs-section-ids";
import type { DocsBlock, DocsSectionContent } from "../../docs.types";
import { TREND_DOC_CONSTANTS as C, TREND_DOC_SCOPE, formatDocNumber } from "./trend-doc-constants";

/**
 * Documentation added with the exploratory-analysis method (spec
 * docs/superpowers/specs/2026-11-14-trend-eda-lifecycle-design.md): the EDA
 * section, the IT scope and the saturated / past-peak rules. vi.ts and en.ts
 * place these blocks inside their sections.
 */

const vi = (value: number) => formatDocNumber(value, "vi");
const link = (text: string, id: Parameters<typeof docsPath>[0], anchor?: string) => `[${text}](${docsPath(id, anchor)})`;
const scopeRows = (core: string, related: string) => TREND_DOC_SCOPE.map((row) => [`\`${row.id}\``, row.name, row.layer === "core" ? core : related]);

// ---------------------------------------------------------------------------
// Section: exploratory analysis
// ---------------------------------------------------------------------------

export const trendEdaVi: DocsSectionContent = {
  heading: "Phân tích khám phá dữ liệu (EDA)",
  summary: "Trước khi kết luận, chuỗi thị phần được kiểm tra, mô tả bằng công thức, vẽ thành biểu đồ và soát năm bất thường.",
  body: [
    {
      kind: "paragraph",
      text: `Trang chi tiết của một chủ đề đi theo năm bước, đúng thứ tự: (1) hiểu và kiểm tra dữ liệu, (2) thống kê mô tả, (3) trực quan hoá, (4) tìm năm bất thường, (5) kết luận. Bốn bước đầu **mô tả** chuỗi thị phần; chỉ bước 5 **kết luận**, bằng kiểm định ${link("Mann–Kendall", S.trendMannKendall)} và ${link("quy tắc kết luận", S.trendVerdict)}.`,
    },
    { kind: "heading", id: "data-check", text: "Bước 1. Hiểu và kiểm tra dữ liệu" },
    {
      kind: "list",
      items: [
        "Số năm hoàn chỉnh được dùng và tổng số bài trong các năm đó.",
        `Tập tham chiếu N_t và phiên bản phạm vi (xem ${link("Dữ liệu và phạm vi", S.trendData, "it-scope")}).`,
        "Năm bị loại: năm chưa kết thúc, hoặc năm tập tham chiếu không có bài (N_t = 0).",
        "Năm chủ đề không có bài nào (n_t = 0): vẫn được dùng, thị phần bằng 0.",
      ],
    },
    { kind: "heading", id: "describe", text: "Bước 2. Thống kê mô tả" },
    {
      kind: "paragraph",
      text: "Các chỉ số dưới đây được tính cho hai chuỗi: thị phần s_t (%) và số bài n_t. Ký hiệu chung là x_1, …, x_n.",
    },
    {
      kind: "formula",
      lines: [
        "Trung bình          x̄   = (1/n) · Σ x_i",
        "Trung vị, Q1, Q3    phân vị 50%, 25%, 75%: vị trí h = (n − 1)·p, nội suy tuyến tính",
        "Phương sai          s²  = Σ (x_i − x̄)² / (n − 1)",
        "Độ lệch chuẩn       s   = √s²",
        "Khoảng biến thiên   R   = max − min",
        "Hệ số biến thiên    CV  = s / x̄",
        "Mô-men trung tâm    m_k = (1/n) · Σ (x_i − x̄)^k",
        "Độ lệch (skewness)  G1  = [ m_3 / m_2^(3/2) ] · √(n(n−1)) / (n − 2)",
        "Độ nhọn (kurtosis)  G2  = (n−1) / ((n−2)(n−3)) · [ (n+1)·(m_4 / m_2² − 3) + 6 ]",
      ],
      legend: [
        { symbol: "n", meaning: "Số năm hoàn chỉnh được dùng." },
        { symbol: "Q1, Q3", meaning: "Tứ phân vị thứ nhất và thứ ba; cách nội suy là định nghĩa số 7 trong [@hyndman-fan-1996], mặc định của R và NumPy." },
        { symbol: "CV", meaning: "Độ phân tán so với mức trung bình, không có đơn vị, nên so sánh được giữa chủ đề lớn và nhỏ." },
        { symbol: "G1", meaning: "Độ lệch đã hiệu chỉnh cho mẫu nhỏ [@joanes-gill-1998]. G1 > 0: đuôi dài về phía giá trị lớn; G1 < 0: về phía giá trị nhỏ. Cần n ≥ 3." },
        { symbol: "G2", meaning: "Độ nhọn **vượt** (excess) đã hiệu chỉnh cho mẫu nhỏ [@joanes-gill-1998]: 0 với phân phối chuẩn, > 0 là nhọn hơn và đuôi nặng hơn. Cần n ≥ 4." },
      ],
    },
    {
      kind: "callout",
      tone: "limitation",
      text: `Với chuỗi chỉ khoảng ${C.defaultWindowYears} điểm, độ lệch và độ nhọn dao động mạnh giữa các mẫu. Chúng được hiển thị **chỉ để mô tả** và không tham gia vào kết luận. Lưu ý: nhiều tài liệu dùng độ nhọn với mốc 3 cho phân phối chuẩn; LumiGap hiển thị độ nhọn vượt, mốc là 0.`,
    },
    { kind: "heading", id: "trend-line", text: "Bước 3. Đường xu hướng, phần dư và biểu đồ" },
    {
      kind: "formula",
      lines: [
        "ŝ_t = a + b · t",
        "b   = Sen's slope  (trung vị của mọi độ dốc cặp)",
        "a   = trung vị của ( s_i − b · t_i )",
        "e_t = s_t − ŝ_t",
      ],
      legend: [
        { symbol: "ŝ_t", meaning: "Giá trị của đường xu hướng Theil–Sen tại năm t." },
        { symbol: "b", meaning: `${link("Sen's slope", S.trendSenSlope)}, điểm %/năm.` },
        { symbol: "a", meaning: "Hệ số chặn: trung vị của phần còn lại sau khi trừ đi độ dốc." },
        { symbol: "e_t", meaning: "Phần dư: thị phần thật cao hơn (dương) hay thấp hơn (âm) đường xu hướng bao nhiêu điểm phần trăm." },
      ],
    },
    {
      kind: "table",
      columns: ["Biểu đồ", "Cho thấy điều gì"],
      rows: [
        ["Thị phần theo năm và đường xu hướng", `Hình dạng của chuỗi. Vùng tô là ${C.recentWindowYears} năm gần nhất, dùng để xét bão hoà. Chấm đỏ là năm bất thường.`],
        ["Phần dư", "Năm nào lệch khỏi đường xu hướng và lệch về phía nào."],
        ["Boxplot của thị phần", "Phân phối của thị phần: hộp là Q1, trung vị, Q3; râu là giá trị nhỏ nhất và lớn nhất."],
        ["Số bài theo năm", "Dữ liệu mô tả; không dùng để kết luận."],
      ],
    },
    {
      kind: "callout",
      tone: "note",
      text: "Chuỗi thị phần **không** được làm trơn (ví dụ trung bình trượt) trước khi kiểm định: làm trơn tạo ra tự tương quan và làm kiểm định dễ báo có xu hướng hơn thực tế.",
    },
    { kind: "heading", id: "anomalies", text: "Bước 4. Năm bất thường" },
    {
      kind: "formula",
      lines: [
        "M   = trung vị của e_t",
        `MAD = ${vi(C.madScale)} · trung vị của | e_t − M |`,
        `Năm t là bất thường  ⇔  | e_t − M | / MAD > ${vi(C.madCutoff)}`,
      ],
      legend: [
        { symbol: "MAD", meaning: "Độ lệch tuyệt đối trung vị: thước đo độ phân tán không bị chính các giá trị bất thường kéo lệch, khác với độ lệch chuẩn." },
        { symbol: vi(C.madScale), meaning: "Hằng số đưa MAD về cùng thang với độ lệch chuẩn khi dữ liệu có phân phối chuẩn." },
        { symbol: vi(C.madCutoff), meaning: "Ngưỡng do [@leys-2013] đề xuất." },
      ],
    },
    {
      kind: "list",
      items: [
        "Năm bất thường được tô đỏ trên biểu đồ và nêu thành **lưu ý** ở phần kết luận.",
        "Năm bất thường **không bao giờ làm đổi kết luận**: Mann–Kendall và Sen's slope dựa trên thứ hạng và trung vị nên vốn ít bị một năm lệch chi phối.",
        "Khi hơn nửa số phần dư bằng nhau thì MAD = 0 và không năm nào được đánh dấu.",
        "Cần ít nhất 3 năm.",
      ],
    },
    {
      kind: "callout",
      tone: "convention",
      items: [
        "Áp dụng quy tắc MAD cho **phần dư quanh đường Theil–Sen**, thay vì cho giá trị gốc, là lựa chọn của dự án: một chuỗi tăng đều không có năm nào bất thường.",
        "Các bước 1–4 không tham gia vào kết luận.",
      ],
    },
    { kind: "sources", ids: ["joanes-gill-1998", "hyndman-fan-1996", "leys-2013", "sen-1968", "usgs-helsel-2020"] },
  ],
};

export const trendEdaEn: DocsSectionContent = {
  heading: "Exploratory data analysis (EDA)",
  summary: "Before concluding, the share series is checked, described with formulas, drawn and screened for anomalous years.",
  body: [
    {
      kind: "paragraph",
      text: `A topic's detail page follows five steps, in this order: (1) understand and check the data, (2) descriptive statistics, (3) visualisation, (4) anomalous years, (5) conclusion. The first four **describe** the share series; only step 5 **concludes**, with the ${link("Mann–Kendall", S.trendMannKendall)} test and the ${link("decision rules", S.trendVerdict)}.`,
    },
    { kind: "heading", id: "data-check", text: "Step 1. Understand and check the data" },
    {
      kind: "list",
      items: [
        "The complete years used and the total number of papers in them.",
        `The reference population N_t and the scope version (see ${link("Data and scope", S.trendData, "it-scope")}).`,
        "Years left out: the year still running, or a year in which the reference population has no paper (N_t = 0).",
        "Years in which the topic has no paper (n_t = 0): they are still used, with a share of 0.",
      ],
    },
    { kind: "heading", id: "describe", text: "Step 2. Descriptive statistics" },
    {
      kind: "paragraph",
      text: "The statistics below are computed for two series: the share s_t (%) and the paper count n_t. The common notation is x_1, …, x_n.",
    },
    {
      kind: "formula",
      lines: [
        "Mean                 x̄   = (1/n) · Σ x_i",
        "Median, Q1, Q3       50%, 25%, 75% quantiles: position h = (n − 1)·p, linear interpolation",
        "Variance             s²  = Σ (x_i − x̄)² / (n − 1)",
        "Standard deviation   s   = √s²",
        "Range                R   = max − min",
        "Coeff. of variation  CV  = s / x̄",
        "Central moment       m_k = (1/n) · Σ (x_i − x̄)^k",
        "Skewness             G1  = [ m_3 / m_2^(3/2) ] · √(n(n−1)) / (n − 2)",
        "Kurtosis             G2  = (n−1) / ((n−2)(n−3)) · [ (n+1)·(m_4 / m_2² − 3) + 6 ]",
      ],
      legend: [
        { symbol: "n", meaning: "Number of complete years used." },
        { symbol: "Q1, Q3", meaning: "First and third quartile; the interpolation is definition 7 of [@hyndman-fan-1996], the default of R and NumPy." },
        { symbol: "CV", meaning: "Spread relative to the mean, without a unit, so large and small topics can be compared." },
        { symbol: "G1", meaning: "Skewness adjusted for small samples [@joanes-gill-1998]. G1 > 0: a long tail towards large values; G1 < 0: towards small values. Needs n ≥ 3." },
        { symbol: "G2", meaning: "**Excess** kurtosis adjusted for small samples [@joanes-gill-1998]: 0 for a normal distribution, > 0 means more peaked with heavier tails. Needs n ≥ 4." },
      ],
    },
    {
      kind: "callout",
      tone: "limitation",
      text: `On a series of only about ${C.defaultWindowYears} points, skewness and kurtosis vary a lot from sample to sample. They are shown **for description only** and take no part in the conclusion. Note: many texts report kurtosis with 3 as the value of a normal distribution; LumiGap shows excess kurtosis, where that value is 0.`,
    },
    { kind: "heading", id: "trend-line", text: "Step 3. Trend line, residuals and charts" },
    {
      kind: "formula",
      lines: [
        "ŝ_t = a + b · t",
        "b   = Sen's slope  (median of all pairwise slopes)",
        "a   = median of ( s_i − b · t_i )",
        "e_t = s_t − ŝ_t",
      ],
      legend: [
        { symbol: "ŝ_t", meaning: "Value of the Theil–Sen trend line in year t." },
        { symbol: "b", meaning: `${link("Sen's slope", S.trendSenSlope)}, percentage points per year.` },
        { symbol: "a", meaning: "Intercept: the median of what is left after removing the slope." },
        { symbol: "e_t", meaning: "Residual: by how many percentage points the actual share is above (positive) or below (negative) the trend line." },
      ],
    },
    {
      kind: "table",
      columns: ["Chart", "What it shows"],
      rows: [
        ["Share over time with its trend line", `The shape of the series. The shaded area is the last ${C.recentWindowYears} years, used by the plateau check. Red dots are anomalous years.`],
        ["Residuals", "Which years leave the trend line, and in which direction."],
        ["Box plot of the share", "The distribution of the share: the box is Q1, median, Q3; the whiskers are the minimum and the maximum."],
        ["Papers per year", "Descriptive data; not used to conclude."],
      ],
    },
    {
      kind: "callout",
      tone: "note",
      text: "The share series is **not** smoothed (for example with a moving average) before the test: smoothing creates autocorrelation and makes the test declare a trend more easily than it should.",
    },
    { kind: "heading", id: "anomalies", text: "Step 4. Anomalous years" },
    {
      kind: "formula",
      lines: [
        "M   = median of e_t",
        `MAD = ${C.madScale} · median of | e_t − M |`,
        `Year t is anomalous  ⇔  | e_t − M | / MAD > ${C.madCutoff}`,
      ],
      legend: [
        { symbol: "MAD", meaning: "Median absolute deviation: a measure of spread that the anomalous values themselves do not distort, unlike the standard deviation." },
        { symbol: String(C.madScale), meaning: "Constant that puts the MAD on the scale of a standard deviation when the data are normal." },
        { symbol: String(C.madCutoff), meaning: "Threshold proposed by [@leys-2013]." },
      ],
    },
    {
      kind: "list",
      items: [
        "Anomalous years are drawn in red and listed as a **caution** next to the conclusion.",
        "Anomalous years **never change the conclusion**: Mann–Kendall and Sen's slope rest on ranks and medians, so a single odd year hardly moves them.",
        "When more than half of the residuals are equal, MAD = 0 and no year is flagged.",
        "At least 3 years are needed.",
      ],
    },
    {
      kind: "callout",
      tone: "convention",
      items: [
        "Applying the MAD rule to the **residuals around the Theil–Sen line**, rather than to the raw values, is a choice of this project: a steadily rising series has no anomalous year.",
        "Steps 1–4 take no part in the conclusion.",
      ],
    },
    { kind: "sources", ids: ["joanes-gill-1998", "hyndman-fan-1996", "leys-2013", "sen-1968", "usgs-helsel-2020"] },
  ],
};

// ---------------------------------------------------------------------------
// Blocks placed inside "Data and scope": the IT scope
// ---------------------------------------------------------------------------

export const trendScopeBlocksVi: DocsBlock[] = [
  { kind: "heading", id: "it-scope", text: "Phạm vi: nhóm ngành Công nghệ thông tin" },
  {
    kind: "paragraph",
    text: `LumiGap chỉ phân tích xu hướng **bên trong nhóm ngành Công nghệ thông tin**. Phạm vi gồm ${TREND_DOC_SCOPE.length} lĩnh vực con (subfield) của OpenAlex, với ${C.scopeTopics} chủ đề tại thời điểm định nghĩa. **Mọi** chủ đề của phạm vi đều được kiểm định, không chọn theo quy mô, nên chủ đề nhỏ đang tăng mạnh không bị bỏ sót. Mọi chủ đề dùng chung một mẫu số N_t, nên thị phần của chúng so sánh được với nhau.`,
  },
  {
    kind: "table",
    columns: ["Mã subfield", "Tên trong OpenAlex", "Lớp"],
    rows: scopeRows("Lõi (thuộc lĩnh vực Computer Science)", "Liên quan"),
  },
  {
    kind: "callout",
    tone: "convention",
    items: [
      `Danh sách phạm vi do dự án định nghĩa, phiên bản \`${C.scopeVersion}\`. Đổi danh sách là đổi mẫu số của mọi chủ đề, nên phiên bản tăng theo; kết luận của hai phiên bản không so sánh được với nhau.`,
      "Lĩnh vực con Electrical and Electronic Engineering không nằm trong phạm vi: nó rất lớn và phần lớn không phải CNTT, nên sẽ lấn át mẫu số.",
      "Trang tổng quan lọc được theo lĩnh vực con hoặc chủ đề bên trong phạm vi. Bộ lọc này chỉ thu hẹp danh sách hiển thị; mẫu số vẫn là cả phạm vi.",
      "Một chủ đề nằm ngoài phạm vi vẫn mở được trang chi tiết; khi đó mẫu số là lĩnh vực (Field) của nó và trang ghi rõ điều này.",
    ],
  },
];

export const trendScopeBlocksEn: DocsBlock[] = [
  { kind: "heading", id: "it-scope", text: "Scope: the Information Technology disciplines" },
  {
    kind: "paragraph",
    text: `LumiGap analyses trends **inside the Information Technology disciplines** only. The scope is ${TREND_DOC_SCOPE.length} OpenAlex subfields, holding ${C.scopeTopics} topics when it was defined. **Every** topic of the scope is tested, with no selection by size, so a small topic that rises fast is not missed. All topics share one denominator N_t, so their shares can be compared with each other.`,
  },
  {
    kind: "table",
    columns: ["Subfield id", "Name in OpenAlex", "Layer"],
    rows: scopeRows("Core (in the field Computer Science)", "Related"),
  },
  {
    kind: "callout",
    tone: "convention",
    items: [
      `The scope list is defined by the project, version \`${C.scopeVersion}\`. Changing the list changes the denominator of every topic, so the version changes with it; verdicts of two versions cannot be compared.`,
      "The subfield Electrical and Electronic Engineering is left out: it is very large and mostly not IT, so it would dominate the denominator.",
      "The overview can be filtered by a subfield or a topic inside the scope. The filter only narrows the list shown; the denominator stays the whole scope.",
      "A topic outside the scope still has a detail page; its denominator is then its field, and the page says so.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Blocks placed inside "Decision rules": saturated and past its peak
// ---------------------------------------------------------------------------

export const trendLifecycleBlocksVi: DocsBlock[] = [
  { kind: "heading", id: "lifecycle", text: "Bão hoà và qua đỉnh" },
  {
    kind: "paragraph",
    text: "Mann–Kendall kiểm định xu hướng đơn điệu trên **cả** cửa sổ. Một chủ đề đã tăng mạnh rồi đi ngang, hoặc tăng rồi tụt lại, vẫn cho kết quả \"tăng có ý nghĩa\". Hai đại lượng dưới đây tách các trường hợp đó ra; chúng chỉ **đổi nhãn** của một xu hướng tăng có ý nghĩa, không tạo ra kết luận mới từ dữ liệu không có ý nghĩa.",
  },
  {
    kind: "formula",
    lines: [
      `R         = ${C.recentWindowYears} năm hoàn chỉnh cuối của cửa sổ`,
      "r_R       = b_R / median(s_t trên R) × 100          (%/năm)",
      `peakRatio = median(s_t của ${C.peakTailYears} năm cuối) / max(s_t trên cả cửa sổ)`,
    ],
    legend: [
      { symbol: "b_R", meaning: "Sen's slope tính riêng trên R." },
      { symbol: "r_R", meaning: "Mức thay đổi tương đối gần đây. Gần 0 nghĩa là thị phần đang đi ngang." },
      { symbol: "peakRatio", meaning: "Thị phần gần đây bằng bao nhiêu phần của mức đỉnh, từ 0 đến 1. Gần 1 nghĩa là vẫn ở quanh đỉnh." },
    ],
  },
  {
    kind: "table",
    columns: ["Ngưỡng", "Căn cứ", "Loại"],
    rows: [
      [`|r_R| < ${vi(C.flatPct)}%/năm`, "Thị phần gần như không đổi trong những năm gần đây.", "Quy ước dự án"],
      [`peakRatio ≥ ${vi(C.nearPeak)}`, "Đi ngang ở gần mức đỉnh, chứ không phải đi ngang sau khi đã tụt.", "Quy ước dự án"],
      [`peakRatio < ${vi(C.pastPeak)}`, "Thị phần cuối kỳ còn dưới một nửa mức đỉnh.", "Quy ước dự án"],
      [`n ≥ ${C.lifecycleMinYears}`, "Cửa sổ phải đủ dài để chứa cả giai đoạn tăng lẫn phần diễn ra sau đó.", "Quy ước dự án"],
    ],
  },
  {
    kind: "callout",
    tone: "convention",
    text: `Các ngưỡng trên **không có nguồn công bố**. Chúng được chọn ngày 2026-11-14 sau khi chạy trên toàn bộ ${C.scopeTopics} chủ đề của phạm vi (cửa sổ 2011–2025) và đối chiếu danh sách với các chủ đề quen thuộc: 71 chủ đề tăng, 12 bão hoà, 4 qua đỉnh (trong đó có ba chủ đề về COVID-19), 169 giảm, 53 ổn định. Ngưỡng peakRatio ≥ ${vi(C.nearPeak)} gần như không ảnh hưởng (từ 0,7 đến 0,9 chỉ đổi 13 thành 11 chủ đề bão hoà); ngưỡng |r_R| mới là ngưỡng quyết định (${vi(C.flatPct)} cho 12 chủ đề, 3 cho 20 chủ đề).`,
  },
];

export const trendLifecycleBlocksEn: DocsBlock[] = [
  { kind: "heading", id: "lifecycle", text: "Saturated and past its peak" },
  {
    kind: "paragraph",
    text: "Mann–Kendall tests a monotonic trend over the **whole** window. A topic that rose sharply and then levelled off, or rose and then fell back, still tests as a \"significant increase\". The two quantities below tell these cases apart; they only **relabel** a significant increase and never create a conclusion from data that is not significant.",
  },
  {
    kind: "formula",
    lines: [
      `R         = the last ${C.recentWindowYears} complete years of the window`,
      "r_R       = b_R / median(s_t over R) × 100          (% per year)",
      `peakRatio = median(s_t of the last ${C.peakTailYears} years) / max(s_t over the whole window)`,
    ],
    legend: [
      { symbol: "b_R", meaning: "Sen's slope computed on R alone." },
      { symbol: "r_R", meaning: "Recent relative change. Close to 0 means the share is flat." },
      { symbol: "peakRatio", meaning: "The recent share as a fraction of the peak, from 0 to 1. Close to 1 means it is still near its peak." },
    ],
  },
  {
    kind: "table",
    columns: ["Threshold", "Basis", "Kind"],
    rows: [
      [`|r_R| < ${C.flatPct}% per year`, "The share has barely changed in recent years.", "Project convention"],
      [`peakRatio ≥ ${C.nearPeak}`, "Flat near the peak, not flat after having fallen.", "Project convention"],
      [`peakRatio < ${C.pastPeak}`, "The share ends under half of its peak.", "Project convention"],
      [`n ≥ ${C.lifecycleMinYears}`, "The window must be long enough to hold both the rise and what came after it.", "Project convention"],
    ],
  },
  {
    kind: "callout",
    tone: "convention",
    text: `These thresholds have **no published source**. They were chosen on 2026-11-14 after a run over all ${C.scopeTopics} topics of the scope (window 2011–2025), comparing the lists with well-known topics: 71 rising, 12 saturated, 4 past their peak (three of them about COVID-19), 169 declining, 53 stable. The threshold peakRatio ≥ ${C.nearPeak} hardly matters (from 0.7 to 0.9 it only moves 13 saturated topics to 11); |r_R| is the deciding one (${C.flatPct} gives 12 topics, 3 gives 20).`,
  },
];
