import { DOCS_SECTIONS as S, docsPath } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { TrendSectionId } from "./index";
import { TREND_DOC_CONSTANTS as C, formatDocNumber } from "./trend-doc-constants";

const n = (value: number) => formatDocNumber(value, "vi");
const link = (text: string, id: Parameters<typeof docsPath>[0], anchor?: string) => `[${text}](${docsPath(id, anchor)})`;

export const trendsVi: DocsModuleContent<TrendSectionId> = {
  groupHeading: "Xu hướng nghiên cứu",
  sections: {
    [S.trendDefinition]: {
      heading: "Định nghĩa xu hướng",
      summary: "Một chủ đề là xu hướng tăng (giảm) khi thị phần công bố của nó trong lĩnh vực tăng (giảm) đơn điệu, có ý nghĩa thống kê.",
      body: [
        {
          kind: "callout",
          tone: "standard",
          heading: "Định nghĩa",
          text: `**Một chủ đề là xu hướng tăng (giảm)** khi **thị phần** công bố của nó trong lĩnh vực của nó có xu hướng **tăng (giảm) đơn điệu, có ý nghĩa thống kê** theo kiểm định ${link("Mann–Kendall", S.trendMannKendall)}, trên các năm đã hoàn chỉnh dữ liệu.`,
        },
        { kind: "heading", id: "why-share", text: "Vì sao dùng thị phần, không dùng số bài" },
        {
          kind: "paragraph",
          text: "Tổng số công bố khoa học trên thế giới tăng gần như mỗi năm: theo NSF, từ khoảng 2,0 triệu bài năm 2010 lên 3,3 triệu bài năm 2022 [@nsf-sei-2024-publications]. Về dài hạn, khoa học tăng trưởng khoảng 4,10%/năm, nhân đôi sau khoảng 17,3 năm [@bornmann-2021]. Nếu đếm số bài thô, gần như chủ đề nào cũng \"tăng\". Vì vậy NSF đo hoạt động khoa học bằng **thị phần** trong tổng sản lượng, và LumiGap làm tương tự ở cấp chủ đề.",
        },
        { kind: "heading", id: "components", text: "Các thành phần của định nghĩa" },
        {
          kind: "table",
          columns: ["Thành phần", "Ý nghĩa trong LumiGap"],
          rows: [
            ["Đơn vị phân tích", "Một OpenAlex Topic, xác định bằng `primary_topic.id` của bài báo."],
            ["Quần thể tham chiếu", `Mọi bài có cùng lĩnh vực (\`primary_topic.field.id\`) với chủ đề, cùng bộ lọc phạm vi. Xem ${link("Dữ liệu và phạm vi", S.trendData)}.`],
            ["Đại lượng đo", `Thị phần năm t: s_t = n_t / N_t × 100. Xem ${link("Thị phần", S.trendShare)}.`],
            ["Kiểm định", `Mann–Kendall hai phía trên chuỗi s_t, mức ý nghĩa α = ${n(C.alpha)}.`],
            ["Độ lớn", `${link("Sen's slope", S.trendSenSlope)} (điểm phần trăm/năm) kèm khoảng tin cậy 95%.`],
            ["Năm sử dụng", `Chỉ các năm đã hoàn chỉnh dữ liệu, mặc định ${C.defaultWindowYears} năm gần nhất.`],
          ],
        },
        { kind: "heading", id: "verdicts", text: "Bốn kết luận có thể có" },
        {
          kind: "table",
          columns: ["Kết luận", "Mã", "Khi nào"],
          rows: [
            ["Xu hướng tăng", "`rising`", "Thị phần tăng đơn điệu, có ý nghĩa thống kê."],
            ["Xu hướng giảm", "`declining`", "Thị phần giảm đơn điệu, có ý nghĩa thống kê."],
            ["Ổn định", "`stable`", "Đủ dữ liệu nhưng không phát hiện xu hướng có ý nghĩa."],
            ["Chưa đủ dữ liệu", "`insufficient`", "Quá ít năm, quá ít bài, hoặc dữ liệu không đại diện."],
          ],
        },
        {
          kind: "paragraph",
          text: `Quy tắc chính xác nằm ở ${link("Quy tắc kết luận và độ tin cậy", S.trendVerdict)}.`,
        },
        {
          kind: "callout",
          tone: "convention",
          text: "NSF dùng thị phần ở cấp quốc gia và lĩnh vực khoa học. Áp dụng cùng khái niệm cho **chủ đề trong lĩnh vực của nó** là lựa chọn của dự án.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "Số bài thô n_t vẫn được vẽ trên biểu đồ như **dữ liệu mô tả**, nhưng không dùng để kết luận xu hướng. Các chỉ số đếm thô như tăng trưởng năm (YoY), CAGR hay \"momentum\" không còn dùng để xếp hạng hay gắn nhãn.",
        },
        { kind: "sources", ids: ["nsf-sei-2024-publications", "usgs-helsel-2020", "bornmann-2021"] },
      ],
    },

    [S.trendData]: {
      heading: "Dữ liệu và phạm vi",
      summary: "Số bài được OpenAlex đếm trên toàn bộ cơ sở dữ liệu; chỉ dùng các năm đã hoàn chỉnh.",
      body: [
        { kind: "heading", id: "counts", text: "Hai con số đếm mỗi năm" },
        {
          kind: "formula",
          lines: [
            "n_t = số bài có primary_topic.id = T,        năm xuất bản = t, khớp phạm vi",
            "N_t = số bài có primary_topic.field.id = F(T), năm xuất bản = t, khớp phạm vi*",
          ],
          legend: [
            { symbol: "T", meaning: "Chủ đề đang phân tích (một OpenAlex Topic)." },
            { symbol: "F(T)", meaning: "Lĩnh vực (OpenAlex Field) chứa chủ đề T." },
            { symbol: "t", meaning: "Năm xuất bản." },
            { symbol: "phạm vi", meaning: "Bộ lọc người dùng chọn (loại bài, truy cập mở, ngôn ngữ, nguồn...)." },
            { symbol: "*", meaning: "Với N_t, các mệnh đề phân loại (domain/field/subfield/topic) của phạm vi được bỏ đi, vì quần thể tham chiếu tự đặt bộ lọc lĩnh vực của nó." },
          ],
        },
        {
          kind: "paragraph",
          text: "Cả hai con số được OpenAlex tính bằng truy vấn `group_by` trên **toàn bộ** cơ sở dữ liệu của họ, không tải từng bài về [@openalex-group-by]. Mỗi bài chỉ được tính cho **chủ đề chính** (`primary_topic`) của nó [@openalex-works].",
        },
        { kind: "heading", id: "complete-years", text: "Năm hoàn chỉnh và cửa sổ phân tích" },
        {
          kind: "formula",
          lines: [
            "lastCompleteYear = min(yearTo, năm hiện tại − 1)",
            "Năm dùng = { t : yearFrom ≤ t ≤ lastCompleteYear  và  N_t > 0 }",
          ],
          legend: [
            { symbol: "yearFrom, yearTo", meaning: `Khoảng năm người dùng chọn; mặc định ${C.defaultWindowYears} năm gần nhất.` },
            { symbol: "lastCompleteYear", meaning: "Năm cuối cùng được đưa vào kiểm định." },
          ],
        },
        {
          kind: "paragraph",
          text: "Năm hiện tại chưa kết thúc, và bài báo thường được lập chỉ mục chậm vài tháng, nên số bài năm hiện tại luôn thấp giả tạo. Biểu đồ có thể hiển thị năm hiện tại, nhưng **mọi kiểm định chỉ dùng năm hoàn chỉnh**. Năm có N_t = 0 bị bỏ vì không tính được thị phần.",
        },
        { kind: "heading", id: "local", text: "Khi OpenAlex không khả dụng" },
        {
          kind: "paragraph",
          text: "Hệ thống chuyển sang kho bài đã đồng bộ về máy chủ LumiGap (corpus nội bộ). Con số này phản ánh việc đồng bộ, không phản ánh khoa học thực tế, nên kết luận luôn là **Chưa đủ dữ liệu** (`LOCAL_CORPUS`). Biểu đồ vẫn hiển thị để tham khảo.",
        },
        {
          kind: "callout",
          tone: "convention",
          items: [
            `Cửa sổ mặc định ${C.defaultWindowYears} năm.`,
            "Quần thể tham chiếu là lĩnh vực (Field) của chủ đề, không phải toàn bộ OpenAlex hay subfield.",
          ],
        },
        { kind: "sources", ids: ["openalex-group-by", "openalex-works", "openalex-topics", "nsf-sei-2024-technical-appendix"] },
      ],
    },

    [S.trendShare]: {
      heading: "Thị phần",
      summary: "Phần trăm số bài của lĩnh vực thuộc về chủ đề trong một năm.",
      body: [
        {
          kind: "formula",
          lines: ["s_t = n_t / N_t × 100   (%)"],
          legend: [
            { symbol: "s_t", meaning: "Thị phần của chủ đề trong năm t, đơn vị phần trăm." },
            { symbol: "n_t", meaning: "Số bài có chủ đề chính là chủ đề đang xét, năm t." },
            { symbol: "N_t", meaning: "Số bài của cả lĩnh vực chứa chủ đề, năm t." },
          ],
        },
        {
          kind: "example",
          heading: "Ví dụ",
          blocks: [
            { kind: "paragraph", text: "Năm 2020 lĩnh vực có N = 12 000 bài, trong đó n = 150 bài thuộc chủ đề. Thị phần s = 150 / 12 000 × 100 = **1,25%**." },
          ],
        },
        { kind: "heading", id: "percentage-points", text: "Điểm phần trăm và phần trăm" },
        {
          kind: "paragraph",
          text: "Thay đổi của thị phần được đo bằng **điểm phần trăm** (đ.p.t.). Thị phần đi từ 1,20% lên 1,50% là tăng **0,30 điểm phần trăm**, tương đương tăng **25%** so với mức ban đầu (0,30 / 1,20). Hai cách nói khác nhau; LumiGap ghi rõ đơn vị mỗi lần.",
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Đo bằng thị phần trong tổng sản lượng công bố là cách NSF báo cáo sản lượng khoa học trong *Science and Engineering Indicators* [@nsf-sei-2024-publications].",
        },
        { kind: "sources", ids: ["nsf-sei-2024-publications", "nsf-sei-2024-technical-appendix"] },
      ],
    },

    [S.trendMannKendall]: {
      heading: "Kiểm định Mann–Kendall",
      summary: "Kiểm định phi tham số: các năm sau có xu hướng có thị phần lớn hơn (hoặc nhỏ hơn) các năm trước không?",
      body: [
        {
          kind: "paragraph",
          text: "Ý tưởng: so sánh **mọi cặp năm**. Với mỗi cặp, năm sau lớn hơn năm trước thì cộng 1, nhỏ hơn thì trừ 1, bằng nhau thì 0. Nếu không có xu hướng, số cặp tăng và giảm gần bằng nhau, nên tổng S gần 0. Kiểm định không giả định dữ liệu có phân phối chuẩn và không bị ảnh hưởng bởi phép biến đổi đơn điệu như lấy logarit [@usgs-helsel-2020].",
        },
        { kind: "heading", id: "hypotheses", text: "Giả thuyết" },
        {
          kind: "formula",
          lines: [
            "H0:  P(s_j > s_i) = 0,5   với mọi t_j > t_i   (không có xu hướng đơn điệu)",
            "H1:  P(s_j > s_i) ≠ 0,5                       (có xu hướng, kiểm định hai phía)",
          ],
        },
        { kind: "heading", id: "formula", text: "Công thức" },
        {
          kind: "formula",
          lines: [
            "S      = Σ_{i<j} sgn(s_j − s_i)",
            "sgn(x) = +1 nếu x > 0;   0 nếu x = 0;   −1 nếu x < 0",
            "Var(S) = [ n(n−1)(2n+5) − Σ_p t_p(t_p−1)(2t_p+5) ] / 18",
            "Z      = (S − 1) / √Var(S)   nếu S > 0",
            "         0                   nếu S = 0",
            "         (S + 1) / √Var(S)   nếu S < 0",
            "p      = 2 · [1 − Φ(|Z|)]",
            "τ      = S / [n(n−1)/2]",
          ],
          legend: [
            { symbol: "n", meaning: "Số năm được dùng (số phần tử của chuỗi)." },
            { symbol: "i, j", meaning: "Chỉ số năm theo thứ tự thời gian; i < j nghĩa là năm i trước năm j." },
            { symbol: "s_i, s_j", meaning: `Thị phần năm i và năm j (xem ${link("Thị phần", S.trendShare)}).` },
            { symbol: "S", meaning: "Số cặp tăng trừ số cặp giảm. S > 0: thiên về tăng; S < 0: thiên về giảm." },
            { symbol: "t_p", meaning: "Số năm trong nhóm trùng giá trị thứ p (các năm có thị phần bằng hệt nhau). Không có giá trị trùng thì tổng này bằng 0." },
            { symbol: "Var(S)", meaning: "Phương sai của S khi H0 đúng." },
            { symbol: "± 1", meaning: "Hiệu chỉnh liên tục: S chỉ nhận giá trị nguyên nên dịch 1 đơn vị về phía 0 trước khi so với phân phối chuẩn liên tục." },
            { symbol: "Z", meaning: "S đã chuẩn hoá; xấp xỉ phân phối chuẩn tắc khi H0 đúng." },
            { symbol: "Φ", meaning: "Hàm phân phối tích luỹ của phân phối chuẩn tắc." },
            { symbol: "p", meaning: "p-value hai phía." },
            { symbol: "τ", meaning: "Kendall's tau giữa thị phần và thời gian, từ −1 (giảm hoàn toàn) đến +1 (tăng hoàn toàn)." },
          ],
        },
        { kind: "heading", id: "ties", text: "Hiệu chỉnh khi có giá trị trùng" },
        {
          kind: "paragraph",
          text: "Hai năm có thị phần bằng hệt nhau cho sgn = 0, làm S ít biến động hơn. Nếu không hiệu chỉnh, Var(S) bị ước lượng quá lớn và Z quá nhỏ [@usgs-helsel-2020]. Hiệu chỉnh trừ đi t_p(t_p−1)(2t_p+5) cho mỗi nhóm trùng [@kendall-1975]. Ví dụ: một cặp năm trùng (t_p = 2) trừ 2·1·9 = 18 ở tử số, tức Var(S) giảm 1.",
        },
        { kind: "heading", id: "reading-p", text: "Đọc p-value thế nào" },
        {
          kind: "list",
          items: [
            "**p** là xác suất, *nếu thật sự không có xu hướng*, quan sát được một S lệch khỏi 0 ít nhất như vậy.",
            `p < α = ${n(C.alpha)}: bác bỏ H0, kết luận có xu hướng; chiều xu hướng theo dấu của S.`,
            "p **không** phải xác suất xu hướng là thật, và không nói gì về độ lớn của xu hướng (xem Sen's slope).",
            "p lớn **không chứng minh** không có xu hướng; chỉ là dữ liệu chưa đủ bằng chứng.",
          ],
        },
        { kind: "heading", id: "min-years", text: "Vì sao cần ít nhất 5 năm" },
        {
          kind: "callout",
          tone: "derived",
          text: `Với n = 4, S lớn nhất là 6, Var(S) = 4·3·13/18 ≈ 8,67, Z = 5/√8,67 ≈ 1,70, p ≈ 0,089 > ${n(C.alpha)}: không bao giờ có ý nghĩa. Với n = 5, S lớn nhất là 10, Var(S) ≈ 16,67, Z = 9/√16,67 ≈ 2,20, p ≈ 0,027. Vì vậy n ≥ ${C.minYears} là điều kiện cần. Kết luận này cũng đúng với p chính xác: với n = 4, p chính xác nhỏ nhất là 2/4! = 2/24 ≈ 0,083.`,
        },
        {
          kind: "callout",
          tone: "limitation",
          text: "USGS khuyến nghị dùng p chính xác khi n ≤ 10 và chỉ dùng xấp xỉ chuẩn khi n > 10 [@usgs-helsel-2020]. LumiGap làm đúng như vậy: với n ≤ 10 năm và không có năm trùng giá trị, p là **chính xác**, tính từ phân phối chính xác của S (số cách sắp xếp n năm cho mỗi giá trị S, chia cho n!). Khi n > 10 hoặc có hai năm cùng thị phần, p dùng xấp xỉ chuẩn có hiệu chỉnh liên tục. Ví dụ với n = 5, S = 10: p chính xác = 2/120 ≈ 0,017, xấp xỉ chuẩn ≈ 0,027.",
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Kiểm định Mann–Kendall hai phía theo Helsel et al. (2020), chương 12.2.1; công thức Z có hiệu chỉnh liên tục theo phương trình 8.7; hiệu chỉnh giá trị trùng theo §8.4.3.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "mann-1945", "kendall-1975"] },
      ],
    },

    [S.trendSenSlope]: {
      heading: "Sen's slope và khoảng tin cậy 95%",
      summary: "Độ lớn của xu hướng: trung vị của mọi độ dốc giữa hai năm, đơn vị điểm phần trăm mỗi năm.",
      body: [
        {
          kind: "paragraph",
          text: "Mann–Kendall cho biết **có** xu hướng hay không; Sen's slope cho biết xu hướng **lớn bao nhiêu**. Dấu của Sen's slope cùng dấu với S [@usgs-helsel-2020]. Vì lấy trung vị, một năm bất thường gần như không làm lệch kết quả.",
        },
        { kind: "heading", id: "slope", text: "Độ dốc" },
        {
          kind: "formula",
          lines: [
            "d_ij = (s_j − s_i) / (t_j − t_i)     với mọi cặp i < j",
            "b    = trung vị của mọi d_ij          (điểm %/năm)",
          ],
          legend: [
            { symbol: "s_i, s_j", meaning: "Thị phần năm i và năm j (%)." },
            { symbol: "t_i, t_j", meaning: "Năm i và năm j; t_j − t_i là số năm cách nhau." },
            { symbol: "d_ij", meaning: "Độ dốc giữa hai năm: thị phần thay đổi bao nhiêu điểm phần trăm mỗi năm." },
            { symbol: "b", meaning: "Sen's slope. b = 0,05 nghĩa là thị phần điển hình tăng 0,05 điểm phần trăm mỗi năm." },
          ],
        },
        { kind: "heading", id: "ci95", text: "Khoảng tin cậy 95% (phương pháp thứ hạng)" },
        {
          kind: "formula",
          lines: [
            "N'   = số độ dốc cặp = n(n−1)/2,  sắp tăng dần: d_(1) ≤ d_(2) ≤ … ≤ d_(N')",
            "C    = z_{0,975} · √Var(S)            z_{0,975} ≈ 1,96",
            "M1   = (N' − C) / 2",
            "M2   = (N' + C) / 2",
            "CI95 = [ d_(M1) ;  d_(M2 + 1) ]",
          ],
          legend: [
            { symbol: "N'", meaning: "Số cặp năm (khi các năm khác nhau)." },
            { symbol: "d_(k)", meaning: "Độ dốc nhỏ thứ k (đánh số từ 1). Khi k không nguyên, nội suy tuyến tính giữa d_(⌊k⌋) và d_(⌊k⌋+1)." },
            { symbol: "Var(S)", meaning: `Phương sai của S từ ${link("Mann–Kendall", S.trendMannKendall, "formula")}, đã hiệu chỉnh giá trị trùng.` },
            { symbol: "z_{0,975}", meaning: "Phân vị 97,5% của phân phối chuẩn tắc, cho khoảng tin cậy hai phía 95%." },
            { symbol: "M1, M2 + 1", meaning: "Thứ hạng của cận dưới và cận trên." },
          ],
        },
        {
          kind: "paragraph",
          text: "Đây là công thức xấp xỉ mẫu lớn trong Helsel et al. (2020), phương trình 10.6–10.7: cận dưới là độ dốc thứ (N' − C)/2, cận trên là độ dốc thứ (N' + C)/2 + 1 [@usgs-helsel-2020]. Thủ tục tương tự được trình bày trong [@gilbert-1987].",
        },
        { kind: "heading", id: "reading-ci", text: "Đọc khoảng tin cậy" },
        {
          kind: "list",
          items: [
            "Khoảng hẹp: độ lớn xu hướng được ước lượng chính xác.",
            "Khoảng chứa 0: dữ liệu phù hợp với cả việc không thay đổi; thường đi cùng p của Mann–Kendall không có ý nghĩa.",
            "Khoảng có thể lệch về một phía so với b; điều này phản ánh hình dạng của dữ liệu.",
            "Với chuỗi rất ngắn (ví dụ n = 4), M1 < 1 nên không tính được khoảng; LumiGap khi đó không hiển thị CI.",
          ],
        },
        {
          kind: "callout",
          tone: "convention",
          text: "Khi thứ hạng M1 hoặc M2 + 1 không nguyên, LumiGap **nội suy tuyến tính** giữa hai độ dốc kề nhau. Ví dụ trong sổ tay USGS làm tròn đến thứ hạng nguyên gần nhất; hai cách chỉ khác nhau ít.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "sen-1968", "gilbert-1987"] },
      ],
    },

    [S.trendRelativeChange]: {
      heading: "Mức thay đổi tương đối",
      summary: "Sen's slope so với mức thị phần điển hình, để dễ so sánh chủ đề lớn và nhỏ.",
      body: [
        {
          kind: "formula",
          lines: ["r = b / median(s_t) × 100     (%/năm)"],
          legend: [
            { symbol: "r", meaning: "Mức thay đổi tương đối mỗi năm." },
            { symbol: "b", meaning: `${link("Sen's slope", S.trendSenSlope)}, điểm %/năm.` },
            { symbol: "median(s_t)", meaning: "Trung vị thị phần qua các năm được dùng: mức thị phần \"điển hình\" của chủ đề." },
          ],
        },
        {
          kind: "example",
          heading: "Ví dụ",
          blocks: [
            { kind: "paragraph", text: "b = 0,05 điểm %/năm, trung vị thị phần 1,30%: r = 0,05 / 1,30 × 100 ≈ **3,8%/năm**. Thị phần tăng mỗi năm khoảng 3,8% so với mức điển hình của nó." },
          ],
        },
        {
          kind: "paragraph",
          text: "Cùng b = 0,05 điểm %/năm là thay đổi lớn với chủ đề chiếm 0,5% lĩnh vực nhưng nhỏ với chủ đề chiếm 10%. r đưa hai trường hợp về cùng thang đo, nên được dùng để **sắp xếp** các chủ đề tăng (giảm) trên trang tổng quan.",
        },
        {
          kind: "callout",
          tone: "convention",
          text: "r là **quy ước trình bày** của dự án, không phải kiểm định và không ảnh hưởng đến kết luận. Với chủ đề có thị phần rất nhỏ, r có thể lớn dù thay đổi tuyệt đối nhỏ; luôn đọc kèm b và khoảng tin cậy.",
        },
      ],
    },

    [S.trendMultipleTesting]: {
      heading: "Hiệu chỉnh nhiều kiểm định (Benjamini–Hochberg)",
      summary: "Khi kiểm định nhiều chủ đề cùng lúc, một số sẽ \"có ý nghĩa\" chỉ do ngẫu nhiên. BH kiểm soát tỉ lệ phát hiện sai.",
      body: [
        {
          kind: "paragraph",
          text: `Trang tổng quan kiểm định từ ${C.overviewCandidatesMin} đến ${C.overviewCandidatesMax} chủ đề cùng lúc. Nếu không chủ đề nào có xu hướng thật mà vẫn dùng ngưỡng p < ${n(C.alpha)}, trung bình cứ 100 chủ đề sẽ có khoảng 5 chủ đề bị gắn nhãn sai. Thủ tục Benjamini–Hochberg (BH) điều chỉnh p thành **q-value** để tỉ lệ phát hiện sai kỳ vọng (FDR) trong số các chủ đề được gắn nhãn không vượt quá α [@benjamini-hochberg-1995].`,
        },
        {
          kind: "formula",
          lines: [
            "Sắp p tăng dần:  p_(1) ≤ p_(2) ≤ … ≤ p_(m)",
            "q_(i) = min_{j ≥ i} ( m · p_(j) / j ),   tối đa bằng 1",
            `Chủ đề có ý nghĩa  ⇔  q < α = ${n(C.alpha)}`,
          ],
          legend: [
            { symbol: "m", meaning: "Số chủ đề được kiểm định cùng lúc (có p-value)." },
            { symbol: "p_(i)", meaning: "p-value Mann–Kendall nhỏ thứ i." },
            { symbol: "q_(i)", meaning: "q-value của chủ đề có p_(i): p đã hiệu chỉnh cho m kiểm định." },
            { symbol: "min_{j ≥ i}", meaning: "Lấy nhỏ nhất từ vị trí i trở đi, để q không giảm khi p tăng." },
          ],
        },
        {
          kind: "example",
          heading: "Ví dụ với 5 chủ đề",
          blocks: [
            {
              kind: "table",
              columns: ["Chủ đề", "p", "Thứ hạng j", "m·p/j", "q", "Có ý nghĩa?"],
              rows: [
                ["A", "0,001", "1", "0,005", "0,005", "Có"],
                ["B", "0,010", "2", "0,025", "0,025", "Có"],
                ["C", "0,020", "3", "0,033", "0,033", "Có"],
                ["D", "0,045", "4", "0,056", "0,056", "Không"],
                ["E", "0,300", "5", "0,300", "0,300", "Không"],
              ],
            },
            { kind: "paragraph", text: "Chủ đề D có p = 0,045 < 0,05 nếu xét riêng, nhưng sau hiệu chỉnh q ≈ 0,056 ≥ 0,05 nên không được gắn nhãn xu hướng." },
          ],
        },
        {
          kind: "list",
          items: [
            "**Trang tổng quan** (nhiều chủ đề): kết luận dùng q.",
            "**Trang chi tiết một chủ đề** (một giả thuyết): kết luận dùng p, không cần hiệu chỉnh.",
            `BH cũng được dùng cho danh sách ${link("từ khoá nổi lên", S.trendSupplementary, "keywords")}.`,
          ],
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Benjamini & Hochberg (1995) chứng minh thủ tục kiểm soát FDR ở mức α khi các kiểm định độc lập. Các chủ đề cùng lĩnh vực có thể phụ thuộc nhau; đây là một giả định cần lưu ý.",
        },
        { kind: "sources", ids: ["benjamini-hochberg-1995"] },
      ],
    },

    [S.trendVerdict]: {
      heading: "Quy tắc kết luận và độ tin cậy",
      summary: "Bảng quyết định chính xác mà hệ thống dùng, và căn cứ của từng ngưỡng.",
      body: [
        {
          kind: "paragraph",
          text: `Gọi **p\\*** là q-value khi có (trang tổng quan), ngược lại là p-value Mann–Kendall (trang chi tiết). Ngưỡng α = ${n(C.alpha)}. Các điều kiện được xét **theo thứ tự**; điều kiện đầu tiên đúng quyết định kết luận.`,
        },
        { kind: "heading", id: "rules", text: "Bảng quyết định" },
        {
          kind: "table",
          columns: ["#", "Điều kiện", "Kết luận", "Mã lý do"],
          rows: [
            ["1", "Nguồn dữ liệu là corpus nội bộ (`source = \"local\"`)", "Chưa đủ dữ liệu", "`LOCAL_CORPUS`"],
            ["2", `n < ${C.minYears} năm`, "Chưa đủ dữ liệu", "`TOO_FEW_YEARS`"],
            ["3", `Tổng số bài < ${C.minPapers}`, "Chưa đủ dữ liệu", "`TOO_FEW_PAPERS`"],
            ["4", `p* < ${n(C.alpha)} và S > 0`, "Xu hướng tăng", "`SIGNIFICANT_INCREASE`"],
            ["5", `p* < ${n(C.alpha)} và S < 0`, "Xu hướng giảm", "`SIGNIFICANT_DECREASE`"],
            ["6", "Còn lại", "Ổn định", "`NO_SIGNIFICANT_TREND`"],
          ],
        },
        {
          kind: "paragraph",
          text: "Khi kết luận là Chưa đủ dữ liệu, mọi điều kiện 1–3 không đạt đều được liệt kê, để người dùng biết cần thêm gì. Các con số thống kê vẫn được tính và hiển thị.",
        },
        { kind: "heading", id: "confidence", text: "Độ tin cậy" },
        {
          kind: "table",
          columns: ["Độ tin cậy", "Điều kiện (chỉ cho Xu hướng tăng / giảm)"],
          rows: [
            ["Cao (`high`)", `p* < ${n(C.highConfidenceP)} **và** n ≥ ${C.highConfidenceMinYears} năm`],
            ["Trung bình (`medium`)", "Các trường hợp tăng / giảm còn lại"],
          ],
        },
        { kind: "heading", id: "thresholds", text: "Căn cứ của các ngưỡng" },
        {
          kind: "table",
          columns: ["Ngưỡng", "Căn cứ", "Loại"],
          rows: [
            [`α = ${n(C.alpha)}`, "Mức ý nghĩa quy ước trong sổ tay USGS và thống kê nói chung [@usgs-helsel-2020].", "Chuẩn đã công bố"],
            [`n ≥ ${C.minYears}`, `Với n = 4, Mann–Kendall không thể đạt p < ${n(C.alpha)}: S tối đa = 6, Var = 8,67, Z = 1,70, p ≈ 0,089. Với n = 5: Z = 2,20, p ≈ 0,027. Xem ${link("chi tiết", S.trendMannKendall, "min-years")}.`, "Suy ra toán học"],
            [`Tổng số bài ≥ ${C.minPapers}`, "Tránh để thị phần dựa trên vài bài lẻ, khi một bài thêm hay bớt đã làm thị phần đổi mạnh.", "Quy ước dự án"],
            [`Cao: p* < ${n(C.highConfidenceP)} và n ≥ ${C.highConfidenceMinYears}`, "Bằng chứng mạnh hơn mức 0,05 và chuỗi đủ dài để ít phụ thuộc vào vài năm đầu hoặc cuối.", "Quy ước dự án"],
          ],
        },
        {
          kind: "callout",
          tone: "convention",
          items: [
            `Ngưỡng ${C.minPapers} bài.`,
            `Ngưỡng độ tin cậy cao (p* < ${n(C.highConfidenceP)} và n ≥ ${C.highConfidenceMinYears}).`,
            "Dùng q thay cho p ở trang tổng quan.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Mọi hằng số khai báo ở một chỗ trong backend (`trend.verdict.ts`); trang này hiển thị đúng các giá trị đó.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "benjamini-hochberg-1995"] },
      ],
    },

    [S.trendSupplementary]: {
      heading: "Thông tin bổ sung",
      summary: "Từ khoá nổi lên và tỉ lệ bài được trích dẫn nhiều giúp hiểu chủ đề, nhưng không ảnh hưởng đến kết luận xu hướng.",
      body: [
        { kind: "heading", id: "keywords", text: "Từ khoá nổi lên trong chủ đề" },
        {
          kind: "paragraph",
          text: "Các năm được dùng chia làm hai nửa: giai đoạn A (nửa đầu) và giai đoạn B (nửa sau). Với mỗi từ khoá thường gặp (50 từ khoá phổ biến nhất của mỗi giai đoạn), hệ thống kiểm tra tỉ lệ bài của chủ đề mang từ khoá đó có thay đổi giữa A và B không. Cần ít nhất 4 năm hoàn chỉnh.",
        },
        {
          kind: "formula",
          lines: [
            "a = số bài giai đoạn B có từ khoá,   b = n_B − a",
            "c = số bài giai đoạn A có từ khoá,   d = n_A − c",
            "log OR = ln[ (a+½)(d+½) / ((b+½)(c+½)) ]",
            "SE     = √( 1/(a+½) + 1/(b+½) + 1/(c+½) + 1/(d+½) )",
            "z      = log OR / SE,   p hai phía từ phân phối chuẩn,   rồi hiệu chỉnh BH",
          ],
          legend: [
            { symbol: "n_A, n_B", meaning: "Số bài của chủ đề trong giai đoạn A và B." },
            { symbol: "log OR", meaning: "Logarit tỉ số chênh: > 0 nghĩa là từ khoá phổ biến hơn ở giai đoạn B." },
            { symbol: "+½", meaning: "Hiệu chỉnh Haldane–Anscombe: giữ log OR hữu hạn khi một ô bằng 0 (ví dụ từ khoá mới hoàn toàn)." },
            { symbol: "SE", meaning: "Sai số chuẩn của log OR (Woolf)." },
          ],
        },
        {
          kind: "paragraph",
          text: `Sai số chuẩn theo [@woolf-1955]; cộng ½ theo [@haldane-1956]. p-value của các từ khoá được hiệu chỉnh bằng ${link("Benjamini–Hochberg", S.trendMultipleTesting)}; từ khoá có q ≥ α hiển thị màu xám.`,
        },
        { kind: "heading", id: "pp-top10", text: "Tỉ lệ bài được trích dẫn nhiều, PP(top 10%)" },
        {
          kind: "formula",
          lines: ["PP(top 10%)_t = số bài thuộc top 10% được trích dẫn nhiều nhất / số bài của chủ đề năm t × 100"],
          legend: [
            { symbol: "top 10%", meaning: "OpenAlex đánh dấu `citation_normalized_percentile.is_in_top_10_percent` khi bài nằm trong 10% bài được trích dẫn nhiều nhất **cùng loại, cùng năm, cùng subfield**." },
            { symbol: "Mức chuẩn", meaning: "Trung bình thế giới là 10%. Trên 10%: chủ đề có nhiều bài ảnh hưởng hơn mức thông thường." },
          ],
        },
        {
          kind: "paragraph",
          text: "Vì mỗi năm chỉ so với bài cùng năm, bài mới (ít thời gian được trích dẫn) và bài cũ có thể so sánh được. Chỉ số dựa trên [@waltman-schreiber-2013]; phép chuẩn hoá do OpenAlex tính [@openalex-works].",
        },
        {
          kind: "callout",
          tone: "note",
          text: "Hai chỉ số này là **thông tin mô tả**. Chúng không thay đổi kết luận xu hướng.",
        },
        { kind: "sources", ids: ["woolf-1955", "haldane-1956", "benjamini-hochberg-1995", "waltman-schreiber-2013", "openalex-works"] },
      ],
    },

    [S.trendLimitations]: {
      heading: "Hạn chế",
      summary: "Những điều phương pháp không làm được. Đọc trước khi dùng kết quả.",
      body: [
        {
          kind: "callout",
          tone: "limitation",
          heading: "1. Tự tương quan",
          text: "Mann–Kendall giả định các năm độc lập (sau khi bỏ xu hướng) [@usgs-helsel-2020]. Thị phần năm sau thường gần năm trước, nên p có thể nhỏ hơn thực tế, tức dễ kết luận có xu hướng hơn. USGS nêu rằng tương quan chuỗi và tính bền vững dài hạn làm tăng phương sai của thống kê kiểm định và tăng xác suất sai lầm loại I. Với cửa sổ 10 năm, dự án không hiệu chỉnh.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "2. Dữ liệu nội bộ không đại diện",
          text: "Khi OpenAlex không khả dụng, N_t là số bài đã đồng bộ về LumiGap. Con số này phản ánh việc đồng bộ, không phản ánh khoa học thực tế, nên kết luận luôn là Chưa đủ dữ liệu.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "3. Danh sách ứng viên thiên về chủ đề lớn",
          text: `Trang tổng quan chỉ xét ${C.overviewCandidatesMin}–${C.overviewCandidatesMax} chủ đề lớn nhất trong phạm vi (trang \`group_by\` đầu tiên của OpenAlex). Chủ đề nhỏ mới nổi có thể không xuất hiện; hãy tìm trực tiếp chủ đề đó để xem trang chi tiết.`,
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "4. Phân loại chủ đề của OpenAlex",
          text: "Chủ đề được gán tự động bằng mô hình máy học [@openalex-topics] và có thể sai. Một bài chỉ được tính vào chủ đề chính (`primary_topic`), dù có thể liên quan đến nhiều chủ đề.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "5. Xu hướng là mô tả quá khứ",
          text: "Kết quả mô tả các năm đã qua, không phải dự báo. USGS cũng lưu ý rằng một xu hướng quan sát được có thể là dao động dài hạn chứ không phải thay đổi bền vững [@usgs-helsel-2020].",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "6. p chỉ là xấp xỉ với chuỗi dài hoặc có năm trùng",
          text: `Với n ≤ 10 năm không có năm trùng, p là chính xác như USGS khuyến nghị. Khi n > 10 hoặc có năm trùng giá trị, p dùng xấp xỉ chuẩn. Xem ${link("Mann–Kendall", S.trendMannKendall, "min-years")}.`,
        },
      ],
    },

    [S.trendWorkedExample]: {
      heading: "Ví dụ tính tay",
      summary: "Toàn bộ phép tính trên một chuỗi 6 năm, có thể kiểm tra bằng máy tính bỏ túi.",
      body: [
        { kind: "heading", id: "data", text: "Bước 1. Dữ liệu và thị phần" },
        {
          kind: "table",
          columns: ["Năm t", "n_t (bài của chủ đề)", "N_t (bài của lĩnh vực)", "s_t = n_t / N_t × 100"],
          rows: [
            ["2019", "120", "10 000", "1,20%"],
            ["2020", "150", "12 000", "1,25%"],
            ["2021", "155", "12 500", "1,24%"],
            ["2022", "189", "14 000", "1,35%"],
            ["2023", "210", "15 000", "1,40%"],
            ["2024", "240", "16 000", "1,50%"],
          ],
        },
        {
          kind: "paragraph",
          text: "Số bài thô tăng gấp đôi (120 → 240, +100%), nhưng phần lớn là do cả lĩnh vực lớn lên. Thị phần chỉ tăng từ 1,20% lên 1,50% (+0,30 điểm phần trăm, +25%). n = 6 năm, tổng số bài = 1 064.",
        },
        { kind: "heading", id: "s", text: "Bước 2. Thống kê S" },
        {
          kind: "table",
          columns: ["Năm gốc", "So với các năm sau", "Tăng", "Giảm", "Đóng góp"],
          rows: [
            ["2019 (1,20)", "1,25  1,24  1,35  1,40  1,50", "5", "0", "+5"],
            ["2020 (1,25)", "1,24  1,35  1,40  1,50", "3", "1", "+2"],
            ["2021 (1,24)", "1,35  1,40  1,50", "3", "0", "+3"],
            ["2022 (1,35)", "1,40  1,50", "2", "0", "+2"],
            ["2023 (1,40)", "1,50", "1", "0", "+1"],
          ],
        },
        { kind: "paragraph", text: "S = 5 + 2 + 3 + 2 + 1 = **13** (14 cặp tăng, 1 cặp giảm, 15 cặp). τ = 13 / 15 ≈ 0,867. Không có giá trị trùng." },
        { kind: "heading", id: "p", text: "Bước 3. Phương sai, Z và p" },
        {
          kind: "formula",
          lines: [
            "Var(S) = 6·5·17 / 18 = 510 / 18 ≈ 28,33       √Var(S) ≈ 5,323",
            "Z      = (13 − 1) / 5,323 ≈ 2,254",
            "p      = 2 · [1 − Φ(2,254)] ≈ 2 · 0,0121 ≈ 0,024",
          ],
        },
        { kind: "paragraph", text: "p ≈ 0,024 < 0,05 và S > 0: thị phần tăng có ý nghĩa thống kê." },
        { kind: "heading", id: "sen", text: "Bước 4. Sen's slope và khoảng tin cậy" },
        {
          kind: "paragraph",
          text: "15 độ dốc cặp d_ij = (s_j − s_i)/(t_j − t_i), ví dụ 2019→2024: (1,50 − 1,20)/5 = 0,060; 2020→2021: (1,24 − 1,25)/1 = −0,010. Sắp tăng dần:",
        },
        {
          kind: "formula",
          lines: [
            "thứ hạng:  1      2     3–8          9     10      11     12     13      14     15",
            "d_(k):    −0,010  0,020  0,050 (×6)  0,060  0,0625  0,075  0,080  0,0867  0,100  0,110",
          ],
        },
        {
          kind: "formula",
          lines: [
            "b      = d_(8) = 0,050 điểm %/năm             (trung vị của 15 giá trị)",
            "C      = 1,96 × 5,323 ≈ 10,43",
            "M1     = (15 − 10,43) / 2 ≈ 2,284",
            "M2 + 1 = (15 + 10,43) / 2 + 1 ≈ 13,716",
            "Cận dưới = d_(2) + 0,284 × (d_(3) − d_(2))   = 0,020 + 0,284 × 0,030    ≈ 0,029",
            "Cận trên = d_(13) + 0,716 × (d_(14) − d_(13)) = 0,0867 + 0,716 × 0,0133 ≈ 0,096",
          ],
        },
        { kind: "paragraph", text: "Sen's slope = **0,050 điểm %/năm**, CI95 ≈ **[0,029; 0,096]**. Khoảng không chứa 0, nhất quán với kết quả Mann–Kendall." },
        { kind: "heading", id: "r", text: "Bước 5. Mức thay đổi tương đối" },
        {
          kind: "paragraph",
          text: "Thị phần sắp tăng dần: 1,20; 1,24; 1,25; 1,35; 1,40; 1,50. Trung vị = (1,25 + 1,35)/2 = 1,30. r = 0,050 / 1,30 × 100 ≈ **3,8%/năm**.",
        },
        { kind: "heading", id: "verdict", text: "Bước 6. Kết luận" },
        {
          kind: "table",
          columns: ["Kiểm tra", "Kết quả"],
          rows: [
            ["Nguồn là OpenAlex", "Đạt"],
            [`n = 6 ≥ ${C.minYears}`, "Đạt"],
            [`Tổng số bài 1 064 ≥ ${C.minPapers}`, "Đạt"],
            [`p = 0,024 < ${n(C.alpha)}, S = 13 > 0`, "**Xu hướng tăng**"],
            [`p ≥ ${n(C.highConfidenceP)} và n = 6 < ${C.highConfidenceMinYears}`, "Độ tin cậy **trung bình**"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Đây là trang chi tiết (một giả thuyết) nên dùng p. Trên trang tổng quan, p này được thay bằng q-value sau hiệu chỉnh Benjamini–Hochberg cùng các chủ đề khác.",
        },
      ],
    },
  },
};
