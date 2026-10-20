/**
 * Bibliography shared by every documentation section. One entry per work;
 * sections cite them with `[@id]` in text or a `sources` block.
 *
 * Verification (2026-10-16):
 * - Every DOI was resolved with https://api.crossref.org/works/<DOI> and the
 *   authors, year, title and venue below follow the Crossref record.
 * - USGS TM 4-A3: Crossref record plus the report PDF (pubs.usgs.gov/tm/04/a03/tm4a3.pdf):
 *   §8.4 Kendall's τ and ties, §10.1.4 CI of the Theil–Sen slope, §12.2.1 Mann–Kendall test.
 * - NSF/NCSES: suggested citation copied from ncses.nsf.gov/pubs/nsb202333.
 * - Books without DOI: checked against the USGS reference list and Open Library.
 * Change an entry only after checking it again, and keep `verification` honest.
 */

export type DocsSourceId =
  | "nsf-sei-2024-publications"
  | "nsf-sei-2024-technical-appendix"
  | "usgs-helsel-2020"
  | "mann-1945"
  | "kendall-1975"
  | "sen-1968"
  | "gilbert-1987"
  | "benjamini-hochberg-1995"
  | "woolf-1955"
  | "haldane-1956"
  | "waltman-schreiber-2013"
  | "bornmann-2021"
  | "openalex-works"
  | "openalex-topics"
  | "openalex-group-by";

/** Where the source sits in the method. Drives the bibliography groups. */
export type DocsSourceRole = "framework" | "method-origin" | "supplementary" | "data";

/** What kind of document it is; tells the reader how much weight it carries. */
export type DocsSourceKind =
  | "government-report"
  | "government-manual"
  | "peer-reviewed"
  | "textbook"
  | "data-provider-docs";

export interface DocsLocalizedText {
  vi: string;
  en: string;
}

export interface DocsSourceVerification {
  status: "verified" | "unverified";
  /** How it was checked, e.g. "Crossref". */
  method: string;
  checkedOn: string;
  note?: DocsLocalizedText;
}

export interface DocsSource {
  id: DocsSourceId;
  /** Short in-text form without parentheses, e.g. "Mann, 1945". */
  shortCite: string;
  authors: string;
  year: number | null;
  /** Title of the work (named `work` so the i18n scanner ignores it). */
  work: string;
  venue: string;
  doi?: string;
  url: string;
  role: DocsSourceRole;
  kind: DocsSourceKind;
  /** What the project takes from this source. */
  roleNote: DocsLocalizedText;
  /** Extra reliability remark shown next to the kind. */
  reliabilityNote?: DocsLocalizedText;
  verification: DocsSourceVerification;
}

const CHECKED_ON = "2026-10-16";

export const DOCS_SOURCES: Record<DocsSourceId, DocsSource> = {
  "nsf-sei-2024-publications": {
    id: "nsf-sei-2024-publications",
    shortCite: "NSB/NCSES, 2023",
    authors: "National Science Board, National Science Foundation",
    year: 2023,
    work: "Publications Output: U.S. Trends and International Comparisons",
    venue: "Science and Engineering Indicators 2024, NSB-2023-33. Alexandria, VA",
    url: "https://ncses.nsf.gov/pubs/nsb202333/",
    role: "framework",
    kind: "government-report",
    roleNote: {
      vi: "Khung định nghĩa: đo hoạt động khoa học bằng thị phần trong tổng số công bố (ví dụ phần trăm của sản lượng toàn cầu), vì tổng số công bố tăng liên tục.",
      en: "Defining framework: research activity is measured as a share of total publication output (e.g. percent of global output), because total output keeps growing.",
    },
    reliabilityNote: {
      vi: "Báo cáo thống kê chính thức của chính phủ Mỹ (NCSES là cơ quan thống kê liên bang). Dữ liệu gốc của NSF là Scopus; dự án áp dụng cùng khái niệm thị phần trên dữ liệu OpenAlex.",
      en: "Official U.S. government statistical report (NCSES is a federal statistical agency). NSF uses Scopus data; the project applies the same share concept to OpenAlex data.",
    },
    verification: { status: "verified", method: "ncses.nsf.gov (suggested citation)", checkedOn: CHECKED_ON },
  },
  "nsf-sei-2024-technical-appendix": {
    id: "nsf-sei-2024-technical-appendix",
    shortCite: "NSB/NCSES, 2023, Technical Appendix",
    authors: "National Science Board, National Science Foundation",
    year: 2023,
    work: "Publications Output: U.S. Trends and International Comparisons. Technical Appendix",
    venue: "Science and Engineering Indicators 2024, NSB-2023-33. Alexandria, VA",
    url: "https://ncses.nsf.gov/pubs/nsb202333/technical-appendix",
    role: "framework",
    kind: "government-report",
    roleNote: {
      vi: "Mô tả cách đếm công bố (bài báo và bài hội nghị, đếm phân số theo quốc gia), cách lọc dữ liệu và các sai lệch có thể có của cơ sở dữ liệu.",
      en: "Describes how publications are counted (articles and conference papers, fractional counting by country), how the data are filtered and the possible biases of the database.",
    },
    verification: { status: "verified", method: "ncses.nsf.gov", checkedOn: CHECKED_ON },
  },
  "usgs-helsel-2020": {
    id: "usgs-helsel-2020",
    shortCite: "Helsel et al., 2020",
    authors: "Helsel, D. R., Hirsch, R. M., Ryberg, K. R., Archfield, S. A., & Gilroy, E. J.",
    year: 2020,
    work: "Statistical Methods in Water Resources",
    venue: "U.S. Geological Survey Techniques and Methods, book 4, chap. A3 (458 p.)",
    doi: "10.3133/tm4a3",
    url: "https://doi.org/10.3133/tm4a3",
    role: "framework",
    kind: "government-manual",
    roleNote: {
      vi: "Khung phát hiện và đo xu hướng: §12.2.1 kiểm định Mann–Kendall; §8.4 Kendall's τ, xấp xỉ chuẩn có hiệu chỉnh liên tục và hiệu chỉnh khi có giá trị trùng; §10.1 độ dốc Theil–Sen (Sen's slope) và §10.1.4 khoảng tin cậy của nó.",
      en: "Framework for detecting and sizing a trend: §12.2.1 Mann–Kendall test; §8.4 Kendall's τ, the normal approximation with continuity correction and the tie adjustment; §10.1 the Theil–Sen (Sen's) slope and §10.1.4 its confidence interval.",
    },
    reliabilityNote: {
      vi: "Sổ tay kỹ thuật của Cục Khảo sát Địa chất Hoa Kỳ (USGS), có bình duyệt nội bộ, thay thế bản TWRI 4-A3 trước đó. Ví dụ là thuỷ văn nhưng phương pháp là thống kê tổng quát.",
      en: "Technical manual of the U.S. Geological Survey, reviewed internally, superseding the earlier TWRI 4-A3. The examples are hydrological but the methods are general statistics.",
    },
    verification: { status: "verified", method: "Crossref + USGS PDF", checkedOn: CHECKED_ON },
  },
  "mann-1945": {
    id: "mann-1945",
    shortCite: "Mann, 1945",
    authors: "Mann, H. B.",
    year: 1945,
    work: "Nonparametric Tests Against Trend",
    venue: "Econometrica, 13(3), 245–259",
    doi: "10.2307/1907187",
    url: "https://doi.org/10.2307/1907187",
    role: "method-origin",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Bài gốc đề xuất dùng Kendall's τ giữa giá trị và thời gian để kiểm định xu hướng.",
      en: "Original paper proposing Kendall's τ between values and time as a test for trend.",
    },
    verification: {
      status: "verified",
      method: "Crossref",
      checkedOn: CHECKED_ON,
      note: { vi: "Crossref chỉ ghi trang đầu (245); trang cuối 259 theo danh mục tham khảo của USGS.", en: "Crossref lists only the first page (245); the last page 259 follows the USGS reference list." },
    },
  },
  "kendall-1975": {
    id: "kendall-1975",
    shortCite: "Kendall, 1975",
    authors: "Kendall, M. G.",
    year: 1975,
    work: "Rank Correlation Methods",
    venue: "London: Charles Griffin (202 p.)",
    url: "https://openlibrary.org/works/OL1202736W",
    role: "method-origin",
    kind: "textbook",
    roleNote: {
      vi: "Phân phối của S và cách hiệu chỉnh phương sai khi có giá trị trùng nhau.",
      en: "Distribution of S and the variance adjustment for tied values.",
    },
    reliabilityNote: {
      vi: "Sách chuyên khảo kinh điển, không có DOI.",
      en: "Classic monograph, no DOI.",
    },
    verification: {
      status: "verified",
      method: "USGS reference list + Open Library",
      checkedOn: CHECKED_ON,
      note: { vi: "Không có DOI; thông tin xuất bản lấy theo danh mục tham khảo của Helsel et al. (2020).", en: "No DOI; publication details follow the reference list of Helsel et al. (2020)." },
    },
  },
  "sen-1968": {
    id: "sen-1968",
    shortCite: "Sen, 1968",
    authors: "Sen, P. K.",
    year: 1968,
    work: "Estimates of the Regression Coefficient Based on Kendall's Tau",
    venue: "Journal of the American Statistical Association, 63(324), 1379–1389",
    doi: "10.1080/01621459.1968.10480934",
    url: "https://doi.org/10.1080/01621459.1968.10480934",
    role: "method-origin",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Ước lượng độ dốc bằng trung vị các độ dốc cặp, khoảng tin cậy và hiệu chỉnh khi có giá trị trùng.",
      en: "Slope estimate as the median of pairwise slopes, its confidence interval and the tie adjustment.",
    },
    verification: { status: "verified", method: "Crossref", checkedOn: CHECKED_ON },
  },
  "gilbert-1987": {
    id: "gilbert-1987",
    shortCite: "Gilbert, 1987",
    authors: "Gilbert, R. O.",
    year: 1987,
    work: "Statistical Methods for Environmental Pollution Monitoring",
    venue: "New York: Van Nostrand Reinhold (ISBN 0-442-23050-8)",
    url: "https://openlibrary.org/works/OL5274145W",
    role: "method-origin",
    kind: "textbook",
    roleNote: {
      vi: "Trình bày thủ tục tính tay khoảng tin cậy của Sen's slope theo thứ hạng (M1, M2 + 1) được dùng rộng rãi trong giám sát môi trường.",
      en: "Presents the hand procedure for the rank-based confidence interval of Sen's slope (M1, M2 + 1) widely used in environmental monitoring.",
    },
    reliabilityNote: {
      vi: "Giáo trình, không có DOI.",
      en: "Textbook, no DOI.",
    },
    verification: {
      status: "unverified",
      method: "Open Library",
      checkedOn: CHECKED_ON,
      note: {
        vi: "Chưa xác minh nội dung: thông tin xuất bản đã khớp Open Library, nhưng chưa mở được chương tương ứng của sách. Công thức khoảng tin cậy trên trang này được đối chiếu với Helsel et al. (2020) §10.1.4.",
        en: "Content not verified: the publication details match Open Library, but the relevant chapter could not be opened. The interval formula on this page is checked against Helsel et al. (2020) §10.1.4.",
      },
    },
  },
  "benjamini-hochberg-1995": {
    id: "benjamini-hochberg-1995",
    shortCite: "Benjamini & Hochberg, 1995",
    authors: "Benjamini, Y., & Hochberg, Y.",
    year: 1995,
    work: "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing",
    venue: "Journal of the Royal Statistical Society Series B: Statistical Methodology, 57(1), 289–300",
    doi: "10.1111/j.2517-6161.1995.tb02031.x",
    url: "https://doi.org/10.1111/j.2517-6161.1995.tb02031.x",
    role: "method-origin",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Thủ tục kiểm soát tỉ lệ phát hiện sai (FDR) khi kiểm định nhiều chủ đề hoặc nhiều từ khoá cùng lúc.",
      en: "Procedure that controls the false discovery rate (FDR) when many topics or keywords are tested at once.",
    },
    verification: { status: "verified", method: "Crossref", checkedOn: CHECKED_ON },
  },
  "woolf-1955": {
    id: "woolf-1955",
    shortCite: "Woolf, 1955",
    authors: "Woolf, B.",
    year: 1955,
    work: "On Estimating the Relation Between Blood Group and Disease",
    venue: "Annals of Human Genetics, 19(4), 251–253",
    doi: "10.1111/j.1469-1809.1955.tb01348.x",
    url: "https://doi.org/10.1111/j.1469-1809.1955.tb01348.x",
    role: "supplementary",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Sai số chuẩn của logarit tỉ số chênh (log odds ratio), dùng cho từ khoá nổi lên.",
      en: "Standard error of the log odds ratio, used for rising keywords.",
    },
    verification: { status: "verified", method: "Crossref", checkedOn: CHECKED_ON },
  },
  "haldane-1956": {
    id: "haldane-1956",
    shortCite: "Haldane, 1956",
    authors: "Haldane, J. B. S.",
    year: 1956,
    work: "The Estimation and Significance of the Logarithm of a Ratio of Frequencies",
    venue: "Annals of Human Genetics, 20(4), 309–311",
    doi: "10.1111/j.1469-1809.1955.tb01285.x",
    url: "https://doi.org/10.1111/j.1469-1809.1955.tb01285.x",
    role: "supplementary",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Cộng ½ vào mỗi ô của bảng 2×2 để log odds ratio luôn hữu hạn.",
      en: "Adding ½ to every cell of the 2×2 table keeps the log odds ratio finite.",
    },
    verification: { status: "verified", method: "Crossref", checkedOn: CHECKED_ON },
  },
  "waltman-schreiber-2013": {
    id: "waltman-schreiber-2013",
    shortCite: "Waltman & Schreiber, 2013",
    authors: "Waltman, L., & Schreiber, M.",
    year: 2013,
    work: "On the calculation of percentile-based bibliometric indicators",
    venue: "Journal of the American Society for Information Science and Technology, 64(2), 372–379",
    doi: "10.1002/asi.22775",
    url: "https://doi.org/10.1002/asi.22775",
    role: "supplementary",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Cơ sở của chỉ số PP(top 10%): tỉ lệ bài thuộc nhóm 10% được trích dẫn nhiều nhất.",
      en: "Basis of the PP(top 10%) indicator: the proportion of papers among the 10% most cited.",
    },
    verification: {
      status: "verified",
      method: "Crossref",
      checkedOn: CHECKED_ON,
      note: { vi: "Bản trực tuyến 14/12/2012, số in 64(2) tháng 2/2013.", en: "Online 14 Dec 2012, print issue 64(2) February 2013." },
    },
  },
  "bornmann-2021": {
    id: "bornmann-2021",
    shortCite: "Bornmann et al., 2021",
    authors: "Bornmann, L., Haunschild, R., & Mutz, R.",
    year: 2021,
    work: "Growth rates of modern science: a latent piecewise growth curve approach to model publication numbers from established and new literature databases",
    venue: "Humanities and Social Sciences Communications, 8(1), 224",
    doi: "10.1057/s41599-021-00903-w",
    url: "https://doi.org/10.1057/s41599-021-00903-w",
    role: "supplementary",
    kind: "peer-reviewed",
    roleNote: {
      vi: "Bối cảnh: khoa học tăng trưởng khoảng 4,10%/năm (thời gian nhân đôi 17,3 năm), nên đếm số bài thô gần như luôn \"tăng\".",
      en: "Context: science grows by about 4.10% per year (doubling time 17.3 years), so raw paper counts almost always \"rise\".",
    },
    verification: { status: "verified", method: "Crossref (abstract)", checkedOn: CHECKED_ON },
  },
  "openalex-works": {
    id: "openalex-works",
    shortCite: "OpenAlex: Works",
    authors: "OpenAlex (OurResearch)",
    year: null,
    work: "Works: attributes (primary_topic, fwci, citation_normalized_percentile)",
    venue: "OpenAlex documentation",
    url: "https://help.openalex.org/data/works/attributes/",
    role: "data",
    kind: "data-provider-docs",
    roleNote: {
      vi: "Định nghĩa primary_topic (chủ đề chính, kèm subfield và field) và citation_normalized_percentile.is_in_top_10_percent (so với bài cùng loại, cùng năm, cùng subfield).",
      en: "Defines primary_topic (with its subfield and field) and citation_normalized_percentile.is_in_top_10_percent (compared with works of the same type, year and subfield).",
    },
    reliabilityNote: {
      vi: "Tài liệu của nhà cung cấp dữ liệu, có thể thay đổi theo phiên bản; không phải nguồn bình duyệt.",
      en: "Data provider documentation; may change between versions and is not peer reviewed.",
    },
    verification: { status: "verified", method: "URL opened", checkedOn: CHECKED_ON },
  },
  "openalex-topics": {
    id: "openalex-topics",
    shortCite: "OpenAlex: Topics",
    authors: "OpenAlex (OurResearch)",
    year: null,
    work: "Topics",
    venue: "OpenAlex documentation",
    url: "https://help.openalex.org/data/topics/",
    role: "data",
    kind: "data-provider-docs",
    roleNote: {
      vi: "Cách OpenAlex gán chủ đề tự động cho bài báo và xếp chủ đề vào subfield, field, domain.",
      en: "How OpenAlex assigns topics to works automatically and maps each topic to a subfield, field and domain.",
    },
    reliabilityNote: {
      vi: "Tài liệu của nhà cung cấp dữ liệu; phân loại được tạo bằng mô hình máy học.",
      en: "Data provider documentation; the classification is produced by a machine-learning model.",
    },
    verification: { status: "verified", method: "URL opened", checkedOn: CHECKED_ON },
  },
  "openalex-group-by": {
    id: "openalex-group-by",
    shortCite: "OpenAlex: group_by",
    authors: "OpenAlex (OurResearch)",
    year: null,
    work: "Group works (group_by)",
    venue: "OpenAlex API documentation",
    url: "https://help.openalex.org/api/grouping/",
    role: "data",
    kind: "data-provider-docs",
    roleNote: {
      vi: "Số bài theo năm (n_t, N_t) được OpenAlex đếm trên toàn bộ cơ sở dữ liệu bằng group_by, không cần tải từng bài.",
      en: "Yearly paper counts (n_t, N_t) are computed by OpenAlex over its whole database with group_by, without downloading works.",
    },
    reliabilityNote: {
      vi: "Tài liệu của nhà cung cấp dữ liệu.",
      en: "Data provider documentation.",
    },
    verification: { status: "verified", method: "URL opened", checkedOn: CHECKED_ON },
  },
};

export const DOCS_SOURCE_ROLES: readonly DocsSourceRole[] = ["framework", "method-origin", "supplementary", "data"];

export function isDocsSourceId(value: string): value is DocsSourceId {
  return Object.prototype.hasOwnProperty.call(DOCS_SOURCES, value);
}

/** Reference-list form: Authors (Year). Work. Venue. DOI/URL. */
export function formatDocsCitation(source: DocsSource): string {
  const year = source.year === null ? "n.d." : String(source.year);
  const link = source.doi ? `https://doi.org/${source.doi}` : source.url;
  return `${source.authors} (${year}). ${source.work}. ${source.venue}. ${link}`;
}
