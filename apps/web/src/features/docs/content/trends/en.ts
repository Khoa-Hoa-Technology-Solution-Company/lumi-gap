import { DOCS_SECTIONS as S, docsPath } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { TrendSectionId } from "./index";
import { TREND_DOC_CONSTANTS as C } from "./trend-doc-constants";

const link = (text: string, id: Parameters<typeof docsPath>[0], anchor?: string) => `[${text}](${docsPath(id, anchor)})`;

export const trendsEn: DocsModuleContent<TrendSectionId> = {
  groupHeading: "Research trends",
  sections: {
    [S.trendDefinition]: {
      heading: "Definition of a trend",
      summary: "A topic is rising (declining) when its share of its field's publications increases (decreases) monotonically and significantly.",
      body: [
        {
          kind: "callout",
          tone: "standard",
          heading: "Definition",
          text: `**A topic is a rising (declining) trend** when its **share** of the publications of its field shows a **statistically significant monotonic increase (decrease)** according to the ${link("Mann–Kendall", S.trendMannKendall)} test, over complete years of data.`,
        },
        { kind: "heading", id: "why-share", text: "Why a share and not a paper count" },
        {
          kind: "paragraph",
          text: "World scientific output grows almost every year: according to NSF, from about 2.0 million articles in 2010 to 3.3 million in 2022 [@nsf-sei-2024-publications]. Over the long run science grows by about 4.10% per year, doubling in about 17.3 years [@bornmann-2021]. Counted raw, almost every topic would \"rise\". NSF therefore measures research activity as a **share** of total output, and LumiGap does the same at topic level.",
        },
        { kind: "heading", id: "components", text: "Parts of the definition" },
        {
          kind: "table",
          columns: ["Part", "Meaning in LumiGap"],
          rows: [
            ["Unit of analysis", "One OpenAlex Topic, identified by the work's `primary_topic.id`."],
            ["Reference population", `All works of the topic's field (\`primary_topic.field.id\`) under the same scope filters. See ${link("Data and scope", S.trendData)}.`],
            ["Measure", `Share in year t: s_t = n_t / N_t × 100. See ${link("Share", S.trendShare)}.`],
            ["Test", `Two-sided Mann–Kendall on the series s_t, significance level α = ${C.alpha}.`],
            ["Magnitude", `${link("Sen's slope", S.trendSenSlope)} (percentage points per year) with a 95% confidence interval.`],
            ["Years used", `Complete years only, by default the last ${C.defaultWindowYears} years.`],
          ],
        },
        { kind: "heading", id: "verdicts", text: "The four possible verdicts" },
        {
          kind: "table",
          columns: ["Verdict", "Code", "When"],
          rows: [
            ["Rising", "`rising`", "The share increases monotonically and significantly."],
            ["Declining", "`declining`", "The share decreases monotonically and significantly."],
            ["Stable", "`stable`", "Enough data, but no significant trend was found."],
            ["Insufficient data", "`insufficient`", "Too few years, too few papers, or non-representative data."],
          ],
        },
        {
          kind: "paragraph",
          text: `The exact rule is in ${link("Verdict rules and confidence", S.trendVerdict)}.`,
        },
        {
          kind: "callout",
          tone: "convention",
          text: "NSF uses shares at the level of countries and fields of science. Applying the same concept to **a topic within its field** is a choice of this project.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "Raw paper counts n_t are still charted as **descriptive data**, but they do not decide the trend. Raw count indicators such as year-over-year growth (YoY), CAGR or \"momentum\" are no longer used for ranking or labelling.",
        },
        { kind: "sources", ids: ["nsf-sei-2024-publications", "usgs-helsel-2020", "bornmann-2021"] },
      ],
    },

    [S.trendData]: {
      heading: "Data and scope",
      summary: "Paper counts are computed by OpenAlex over its whole database; only complete years are used.",
      body: [
        { kind: "heading", id: "counts", text: "Two counts per year" },
        {
          kind: "formula",
          lines: [
            "n_t = works with primary_topic.id = T,          publication year = t, matching the scope",
            "N_t = works with primary_topic.field.id = F(T), publication year = t, matching the scope*",
          ],
          legend: [
            { symbol: "T", meaning: "The topic being analysed (an OpenAlex Topic)." },
            { symbol: "F(T)", meaning: "The field (OpenAlex Field) that contains topic T." },
            { symbol: "t", meaning: "Publication year." },
            { symbol: "scope", meaning: "Filters chosen by the user (work type, open access, language, source...)." },
            { symbol: "*", meaning: "For N_t the taxonomy clauses (domain/field/subfield/topic) of the scope are dropped, because the reference population sets its own field filter." },
          ],
        },
        {
          kind: "paragraph",
          text: "Both counts are computed by OpenAlex with `group_by` queries over its **whole** database, without downloading works [@openalex-group-by]. Each work counts only for its **primary topic** (`primary_topic`) [@openalex-works].",
        },
        { kind: "heading", id: "complete-years", text: "Complete years and analysis window" },
        {
          kind: "formula",
          lines: [
            "lastCompleteYear = min(yearTo, current year − 1)",
            "Years used = { t : yearFrom ≤ t ≤ lastCompleteYear  and  N_t > 0 }",
          ],
          legend: [
            { symbol: "yearFrom, yearTo", meaning: `Year range chosen by the user; by default the last ${C.defaultWindowYears} years.` },
            { symbol: "lastCompleteYear", meaning: "Last year included in the tests." },
          ],
        },
        {
          kind: "paragraph",
          text: "The current year is not over and works are often indexed months late, so the current year's count is always artificially low. Charts may show the current year, but **every test uses complete years only**. Years with N_t = 0 are dropped because no share can be computed.",
        },
        { kind: "heading", id: "local", text: "When OpenAlex is unavailable" },
        {
          kind: "paragraph",
          text: "The system falls back to the works synchronised to the LumiGap server (the local corpus). Those numbers reflect what was synchronised, not science itself, so the verdict is always **Insufficient data** (`LOCAL_CORPUS`). Charts are still shown for reference.",
        },
        {
          kind: "callout",
          tone: "convention",
          items: [
            `Default window of ${C.defaultWindowYears} years.`,
            "The reference population is the topic's field, not the whole of OpenAlex or the subfield.",
          ],
        },
        { kind: "sources", ids: ["openalex-group-by", "openalex-works", "openalex-topics", "nsf-sei-2024-technical-appendix"] },
      ],
    },

    [S.trendShare]: {
      heading: "Share",
      summary: "Percentage of the field's papers that belong to the topic in a year.",
      body: [
        {
          kind: "formula",
          lines: ["s_t = n_t / N_t × 100   (%)"],
          legend: [
            { symbol: "s_t", meaning: "Share of the topic in year t, in percent." },
            { symbol: "n_t", meaning: "Works whose primary topic is this topic, year t." },
            { symbol: "N_t", meaning: "Works of the whole field containing the topic, year t." },
          ],
        },
        {
          kind: "example",
          heading: "Example",
          blocks: [
            { kind: "paragraph", text: "In 2020 the field has N = 12,000 works, of which n = 150 belong to the topic. Share s = 150 / 12,000 × 100 = **1.25%**." },
          ],
        },
        { kind: "heading", id: "percentage-points", text: "Percentage points versus percent" },
        {
          kind: "paragraph",
          text: "Changes of a share are measured in **percentage points** (pp). A share going from 1.20% to 1.50% rises by **0.30 percentage points**, which is a **25%** increase relative to the starting level (0.30 / 1.20). The two statements differ; LumiGap always states the unit.",
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Measuring as a share of total publication output is how NSF reports research output in *Science and Engineering Indicators* [@nsf-sei-2024-publications].",
        },
        { kind: "sources", ids: ["nsf-sei-2024-publications", "nsf-sei-2024-technical-appendix"] },
      ],
    },

    [S.trendMannKendall]: {
      heading: "Mann–Kendall test",
      summary: "A non-parametric test: do later years tend to have a larger (or smaller) share than earlier years?",
      body: [
        {
          kind: "paragraph",
          text: "Idea: compare **every pair of years**. For each pair, add 1 if the later year is larger, subtract 1 if smaller, add 0 if equal. Without a trend, increases and decreases are about as frequent, so the sum S is near 0. The test does not assume normally distributed data and is unaffected by monotonic transformations such as logarithms [@usgs-helsel-2020].",
        },
        { kind: "heading", id: "hypotheses", text: "Hypotheses" },
        {
          kind: "formula",
          lines: [
            "H0:  P(s_j > s_i) = 0.5   for every t_j > t_i   (no monotonic trend)",
            "H1:  P(s_j > s_i) ≠ 0.5                         (a trend, two-sided test)",
          ],
        },
        { kind: "heading", id: "formula", text: "Formula" },
        {
          kind: "formula",
          lines: [
            "S      = Σ_{i<j} sgn(s_j − s_i)",
            "sgn(x) = +1 if x > 0;   0 if x = 0;   −1 if x < 0",
            "Var(S) = [ n(n−1)(2n+5) − Σ_p t_p(t_p−1)(2t_p+5) ] / 18",
            "Z      = (S − 1) / √Var(S)   if S > 0",
            "         0                   if S = 0",
            "         (S + 1) / √Var(S)   if S < 0",
            "p      = 2 · [1 − Φ(|Z|)]",
            "τ      = S / [n(n−1)/2]",
          ],
          legend: [
            { symbol: "n", meaning: "Number of years used (length of the series)." },
            { symbol: "i, j", meaning: "Year indices in time order; i < j means year i comes before year j." },
            { symbol: "s_i, s_j", meaning: `Shares in years i and j (see ${link("Share", S.trendShare)}).` },
            { symbol: "S", meaning: "Increasing pairs minus decreasing pairs. S > 0 leans up; S < 0 leans down." },
            { symbol: "t_p", meaning: "Number of years in the p-th group of tied values (years with exactly the same share). Without ties this sum is 0." },
            { symbol: "Var(S)", meaning: "Variance of S when H0 is true." },
            { symbol: "± 1", meaning: "Continuity correction: S only takes integer values, so it is moved one unit towards 0 before comparison with the continuous normal distribution." },
            { symbol: "Z", meaning: "Standardised S; approximately standard normal when H0 is true." },
            { symbol: "Φ", meaning: "Cumulative distribution function of the standard normal distribution." },
            { symbol: "p", meaning: "Two-sided p-value." },
            { symbol: "τ", meaning: "Kendall's tau between share and time, from −1 (always decreasing) to +1 (always increasing)." },
          ],
        },
        { kind: "heading", id: "ties", text: "Correction for ties" },
        {
          kind: "paragraph",
          text: "Two years with exactly the same share give sgn = 0, so S varies less. Without a correction Var(S) is overestimated and Z underestimated [@usgs-helsel-2020]. The correction subtracts t_p(t_p−1)(2t_p+5) for every tie group [@kendall-1975]. Example: one tied pair of years (t_p = 2) subtracts 2·1·9 = 18 from the numerator, so Var(S) drops by 1.",
        },
        { kind: "heading", id: "reading-p", text: "How to read the p-value" },
        {
          kind: "list",
          items: [
            "**p** is the probability, *if there really is no trend*, of observing an S at least this far from 0.",
            `p < α = ${C.alpha}: reject H0 and conclude there is a trend; its direction is the sign of S.`,
            "p is **not** the probability that the trend is real, and it says nothing about the size of the trend (see Sen's slope).",
            "A large p **does not prove** there is no trend; the data just do not provide enough evidence.",
          ],
        },
        { kind: "heading", id: "min-years", text: "Why at least 5 years" },
        {
          kind: "callout",
          tone: "derived",
          text: `With n = 4 the largest S is 6, Var(S) = 4·3·13/18 ≈ 8.67, Z = 5/√8.67 ≈ 1.70, p ≈ 0.089 > ${C.alpha}: never significant. With n = 5 the largest S is 10, Var(S) ≈ 16.67, Z = 9/√16.67 ≈ 2.20, p ≈ 0.027. Hence n ≥ ${C.minYears} is necessary. The conclusion also holds for the exact p-value: with n = 4 the smallest exact p is 2/4! = 2/24 ≈ 0.083.`,
        },
        {
          kind: "callout",
          tone: "limitation",
          text: "USGS recommends tables of exact p-values when n ≤ 10 and the normal approximation only when n > 10 [@usgs-helsel-2020]. LumiGap uses the normal approximation with continuity correction for every n (the default window is 10 years), so p is **approximate**. Example with n = 5, S = 10: exact p = 2/120 ≈ 0.017, normal approximation ≈ 0.027. With ties only the approximation exists.",
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Two-sided Mann–Kendall test as in Helsel et al. (2020), section 12.2.1; Z with continuity correction as in equation 8.7; tie correction as in section 8.4.3.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "mann-1945", "kendall-1975"] },
      ],
    },

    [S.trendSenSlope]: {
      heading: "Sen's slope and 95% confidence interval",
      summary: "Size of the trend: the median of all slopes between two years, in percentage points per year.",
      body: [
        {
          kind: "paragraph",
          text: "Mann–Kendall says **whether** there is a trend; Sen's slope says **how large** it is. Sen's slope has the same sign as S [@usgs-helsel-2020]. Because it is a median, one unusual year barely moves it.",
        },
        { kind: "heading", id: "slope", text: "Slope" },
        {
          kind: "formula",
          lines: [
            "d_ij = (s_j − s_i) / (t_j − t_i)     for every pair i < j",
            "b    = median of all d_ij             (pp per year)",
          ],
          legend: [
            { symbol: "s_i, s_j", meaning: "Shares in years i and j (%)." },
            { symbol: "t_i, t_j", meaning: "Years i and j; t_j − t_i is how many years apart they are." },
            { symbol: "d_ij", meaning: "Slope between two years: how many percentage points the share changes per year." },
            { symbol: "b", meaning: "Sen's slope. b = 0.05 means the typical share rises by 0.05 percentage points per year." },
          ],
        },
        { kind: "heading", id: "ci95", text: "95% confidence interval (rank method)" },
        {
          kind: "formula",
          lines: [
            "N'   = number of pairwise slopes = n(n−1)/2, sorted: d_(1) ≤ d_(2) ≤ … ≤ d_(N')",
            "C    = z_{0.975} · √Var(S)            z_{0.975} ≈ 1.96",
            "M1   = (N' − C) / 2",
            "M2   = (N' + C) / 2",
            "CI95 = [ d_(M1) ;  d_(M2 + 1) ]",
          ],
          legend: [
            { symbol: "N'", meaning: "Number of pairs of years (when all years differ)." },
            { symbol: "d_(k)", meaning: "The k-th smallest slope (counting from 1). When k is not an integer, linear interpolation between d_(⌊k⌋) and d_(⌊k⌋+1)." },
            { symbol: "Var(S)", meaning: `Variance of S from ${link("Mann–Kendall", S.trendMannKendall, "formula")}, tie-corrected.` },
            { symbol: "z_{0.975}", meaning: "97.5% quantile of the standard normal distribution, for a two-sided 95% interval." },
            { symbol: "M1, M2 + 1", meaning: "Ranks of the lower and upper limits." },
          ],
        },
        {
          kind: "paragraph",
          text: "This is the large-sample formula of Helsel et al. (2020), equations 10.6–10.7: the lower limit is the ((N' − C)/2)-th slope and the upper limit the ((N' + C)/2 + 1)-th slope [@usgs-helsel-2020]. The same procedure is presented in [@gilbert-1987].",
        },
        { kind: "heading", id: "reading-ci", text: "Reading the interval" },
        {
          kind: "list",
          items: [
            "Narrow interval: the size of the trend is estimated precisely.",
            "Interval containing 0: the data are also consistent with no change; this usually goes with a non-significant Mann–Kendall p.",
            "The interval can be asymmetric around b; this reflects the shape of the data.",
            "For very short series (e.g. n = 4) M1 < 1 and no interval can be computed; LumiGap then shows no CI.",
          ],
        },
        {
          kind: "callout",
          tone: "convention",
          text: "When the rank M1 or M2 + 1 is not an integer, LumiGap **interpolates linearly** between the two neighbouring slopes. The USGS manual's example rounds to the nearest integer rank; the two give very similar results.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "sen-1968", "gilbert-1987"] },
      ],
    },

    [S.trendRelativeChange]: {
      heading: "Relative change",
      summary: "Sen's slope relative to the topic's typical share, so large and small topics can be compared.",
      body: [
        {
          kind: "formula",
          lines: ["r = b / median(s_t) × 100     (% per year)"],
          legend: [
            { symbol: "r", meaning: "Relative change per year." },
            { symbol: "b", meaning: `${link("Sen's slope", S.trendSenSlope)}, pp per year.` },
            { symbol: "median(s_t)", meaning: "Median share over the years used: the topic's \"typical\" share." },
          ],
        },
        {
          kind: "example",
          heading: "Example",
          blocks: [
            { kind: "paragraph", text: "b = 0.05 pp per year, median share 1.30%: r = 0.05 / 1.30 × 100 ≈ **3.8% per year**. The share grows each year by about 3.8% of its typical level." },
          ],
        },
        {
          kind: "paragraph",
          text: "The same b = 0.05 pp per year is a big change for a topic holding 0.5% of its field but a small one for a topic holding 10%. r puts both on one scale, so it is used to **order** rising (declining) topics on the overview.",
        },
        {
          kind: "callout",
          tone: "convention",
          text: "r is a **presentation convention** of the project, not a test, and does not affect the verdict. For topics with a very small share r can be large while the absolute change is small; always read it with b and its interval.",
        },
      ],
    },

    [S.trendMultipleTesting]: {
      heading: "Multiple-testing correction (Benjamini–Hochberg)",
      summary: "When many topics are tested at once, some look \"significant\" by chance. BH controls the false discovery rate.",
      body: [
        {
          kind: "paragraph",
          text: `The overview tests ${C.overviewCandidatesMin} to ${C.overviewCandidatesMax} topics at once. If no topic really trended and the threshold stayed at p < ${C.alpha}, about 5 in every 100 topics would be labelled wrongly. The Benjamini–Hochberg (BH) procedure turns p-values into **q-values** so that the expected proportion of false discoveries (FDR) among the labelled topics stays at most α [@benjamini-hochberg-1995].`,
        },
        {
          kind: "formula",
          lines: [
            "Sort the p-values:  p_(1) ≤ p_(2) ≤ … ≤ p_(m)",
            "q_(i) = min_{j ≥ i} ( m · p_(j) / j ),   capped at 1",
            `Topic is significant  ⇔  q < α = ${C.alpha}`,
          ],
          legend: [
            { symbol: "m", meaning: "Number of topics tested together (with a p-value)." },
            { symbol: "p_(i)", meaning: "The i-th smallest Mann–Kendall p-value." },
            { symbol: "q_(i)", meaning: "q-value of the topic with p_(i): its p-value adjusted for m tests." },
            { symbol: "min_{j ≥ i}", meaning: "Smallest value from position i onward, so q never decreases as p increases." },
          ],
        },
        {
          kind: "example",
          heading: "Example with 5 topics",
          blocks: [
            {
              kind: "table",
              columns: ["Topic", "p", "Rank j", "m·p/j", "q", "Significant?"],
              rows: [
                ["A", "0.001", "1", "0.005", "0.005", "Yes"],
                ["B", "0.010", "2", "0.025", "0.025", "Yes"],
                ["C", "0.020", "3", "0.033", "0.033", "Yes"],
                ["D", "0.045", "4", "0.056", "0.056", "No"],
                ["E", "0.300", "5", "0.300", "0.300", "No"],
              ],
            },
            { kind: "paragraph", text: "Topic D has p = 0.045 < 0.05 on its own, but after the correction q ≈ 0.056 ≥ 0.05, so it is not labelled as a trend." },
          ],
        },
        {
          kind: "list",
          items: [
            "**Overview** (many topics): the verdict uses q.",
            "**Topic detail page** (one hypothesis): the verdict uses p, no correction is needed.",
            `BH is also applied to the list of ${link("rising keywords", S.trendSupplementary, "keywords")}.`,
          ],
        },
        {
          kind: "callout",
          tone: "standard",
          text: "Benjamini & Hochberg (1995) prove that the procedure controls the FDR at level α when the tests are independent. Topics of the same field may be dependent; keep this assumption in mind.",
        },
        { kind: "sources", ids: ["benjamini-hochberg-1995"] },
      ],
    },

    [S.trendVerdict]: {
      heading: "Verdict rules and confidence",
      summary: "The exact decision table used by the system, and the basis of each threshold.",
      body: [
        {
          kind: "paragraph",
          text: `Let **p\\*** be the q-value when available (overview), otherwise the Mann–Kendall p-value (topic detail). Threshold α = ${C.alpha}. Conditions are checked **in order**; the first one that holds decides the verdict.`,
        },
        { kind: "heading", id: "rules", text: "Decision table" },
        {
          kind: "table",
          columns: ["#", "Condition", "Verdict", "Reason code"],
          rows: [
            ["1", "Data source is the local corpus (`source = \"local\"`)", "Insufficient data", "`LOCAL_CORPUS`"],
            ["2", `n < ${C.minYears} years`, "Insufficient data", "`TOO_FEW_YEARS`"],
            ["3", `Total papers < ${C.minPapers}`, "Insufficient data", "`TOO_FEW_PAPERS`"],
            ["4", `p* < ${C.alpha} and S > 0`, "Rising", "`SIGNIFICANT_INCREASE`"],
            ["5", `p* < ${C.alpha} and S < 0`, "Declining", "`SIGNIFICANT_DECREASE`"],
            ["6", "Otherwise", "Stable", "`NO_SIGNIFICANT_TREND`"],
          ],
        },
        {
          kind: "paragraph",
          text: "When the verdict is Insufficient data, every failed condition among 1–3 is listed, so users know what is missing. The statistics are still computed and shown.",
        },
        { kind: "heading", id: "confidence", text: "Confidence" },
        {
          kind: "table",
          columns: ["Confidence", "Condition (Rising / Declining only)"],
          rows: [
            ["High (`high`)", `p* < ${C.highConfidenceP} **and** n ≥ ${C.highConfidenceMinYears} years`],
            ["Medium (`medium`)", "All other rising / declining cases"],
          ],
        },
        { kind: "heading", id: "thresholds", text: "Basis of the thresholds" },
        {
          kind: "table",
          columns: ["Threshold", "Basis", "Type"],
          rows: [
            [`α = ${C.alpha}`, "Conventional significance level in the USGS manual and in statistics generally [@usgs-helsel-2020].", "Published standard"],
            [`n ≥ ${C.minYears}`, `With n = 4, Mann–Kendall cannot reach p < ${C.alpha}: max S = 6, Var = 8.67, Z = 1.70, p ≈ 0.089. With n = 5: Z = 2.20, p ≈ 0.027. See ${link("details", S.trendMannKendall, "min-years")}.`, "Mathematical consequence"],
            [`Total papers ≥ ${C.minPapers}`, "Avoids a share built on a handful of papers, where one paper more or less changes the share a lot.", "Project convention"],
            [`High: p* < ${C.highConfidenceP} and n ≥ ${C.highConfidenceMinYears}`, "Stronger evidence than the 0.05 level and a series long enough not to hinge on its first or last years.", "Project convention"],
          ],
        },
        {
          kind: "callout",
          tone: "convention",
          items: [
            `The ${C.minPapers}-paper threshold.`,
            `The high-confidence threshold (p* < ${C.highConfidenceP} and n ≥ ${C.highConfidenceMinYears}).`,
            "Using q instead of p on the overview.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "All constants are declared in one place in the backend (`trend.verdict.ts`); this page shows exactly those values.",
        },
        { kind: "sources", ids: ["usgs-helsel-2020", "benjamini-hochberg-1995"] },
      ],
    },

    [S.trendSupplementary]: {
      heading: "Supplementary information",
      summary: "Rising keywords and the share of highly cited papers help understand a topic but do not affect the trend verdict.",
      body: [
        { kind: "heading", id: "keywords", text: "Rising keywords inside the topic" },
        {
          kind: "paragraph",
          text: "The years used are split into two halves: period A (first half) and period B (second half). For each frequent keyword (the 50 most frequent of each period) the system tests whether the proportion of the topic's papers carrying it changed between A and B. At least 4 complete years are needed.",
        },
        {
          kind: "formula",
          lines: [
            "a = papers of period B with the keyword,   b = n_B − a",
            "c = papers of period A with the keyword,   d = n_A − c",
            "log OR = ln[ (a+½)(d+½) / ((b+½)(c+½)) ]",
            "SE     = √( 1/(a+½) + 1/(b+½) + 1/(c+½) + 1/(d+½) )",
            "z      = log OR / SE,   two-sided p from the normal distribution,   then BH",
          ],
          legend: [
            { symbol: "n_A, n_B", meaning: "Papers of the topic in periods A and B." },
            { symbol: "log OR", meaning: "Log odds ratio: > 0 means the keyword became more common in period B." },
            { symbol: "+½", meaning: "Haldane–Anscombe correction: keeps log OR finite when a cell is 0 (e.g. a brand-new keyword)." },
            { symbol: "SE", meaning: "Standard error of log OR (Woolf)." },
          ],
        },
        {
          kind: "paragraph",
          text: `Standard error after [@woolf-1955]; the ½ correction after [@haldane-1956]. Keyword p-values are adjusted with ${link("Benjamini–Hochberg", S.trendMultipleTesting)}; keywords with q ≥ α are shown in grey.`,
        },
        { kind: "heading", id: "pp-top10", text: "Share of highly cited papers, PP(top 10%)" },
        {
          kind: "formula",
          lines: ["PP(top 10%)_t = papers in the top 10% most cited / papers of the topic in year t × 100"],
          legend: [
            { symbol: "top 10%", meaning: "OpenAlex sets `citation_normalized_percentile.is_in_top_10_percent` when a work is among the 10% most cited works **of the same type, year and subfield**." },
            { symbol: "Reference level", meaning: "The world average is 10%. Above 10%: the topic has more influential papers than usual." },
          ],
        },
        {
          kind: "paragraph",
          text: "Because each year is compared only with works of the same year, recent works (with little time to be cited) and older ones can be compared. The indicator follows [@waltman-schreiber-2013]; the normalisation is computed by OpenAlex [@openalex-works].",
        },
        {
          kind: "callout",
          tone: "note",
          text: "These two indicators are **descriptive**. They do not change the trend verdict.",
        },
        { kind: "sources", ids: ["woolf-1955", "haldane-1956", "benjamini-hochberg-1995", "waltman-schreiber-2013", "openalex-works"] },
      ],
    },

    [S.trendLimitations]: {
      heading: "Limitations",
      summary: "What the method cannot do. Read this before using the results.",
      body: [
        {
          kind: "callout",
          tone: "limitation",
          heading: "1. Autocorrelation",
          text: "Mann–Kendall assumes the years are independent (after removing the trend) [@usgs-helsel-2020]. A year's share is usually close to the previous year's, so p can be smaller than it should be, making a trend easier to declare. USGS notes that serial correlation and long-term persistence inflate the variance of the test statistic and raise the type I error rate. With a 10-year window the project does not correct for it.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "2. Local data are not representative",
          text: "When OpenAlex is unavailable, N_t is the number of works synchronised to LumiGap. It reflects synchronisation, not science, so the verdict is always Insufficient data.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "3. Candidate list favours large topics",
          text: `The overview only considers the ${C.overviewCandidatesMin}–${C.overviewCandidatesMax} largest topics in scope (the first OpenAlex \`group_by\` page). Small emerging topics may not appear; search for such a topic directly to open its detail page.`,
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "4. OpenAlex topic classification",
          text: "Topics are assigned automatically by a machine-learning model [@openalex-topics] and can be wrong. A work counts only for its primary topic (`primary_topic`), even when it relates to several topics.",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "5. A trend describes the past",
          text: "Results describe past years; they are not forecasts. USGS also cautions that an observed trend can be long-term persistence rather than a lasting change [@usgs-helsel-2020].",
        },
        {
          kind: "callout",
          tone: "limitation",
          heading: "6. p is approximate for short series",
          text: `For n ≤ 10 USGS recommends exact p-values; LumiGap uses the normal approximation. See ${link("Mann–Kendall", S.trendMannKendall, "min-years")}.`,
        },
      ],
    },

    [S.trendWorkedExample]: {
      heading: "Worked example",
      summary: "The whole computation on a 6-year series, checkable with a pocket calculator.",
      body: [
        { kind: "heading", id: "data", text: "Step 1. Data and shares" },
        {
          kind: "table",
          columns: ["Year t", "n_t (topic papers)", "N_t (field papers)", "s_t = n_t / N_t × 100"],
          rows: [
            ["2019", "120", "10,000", "1.20%"],
            ["2020", "150", "12,000", "1.25%"],
            ["2021", "155", "12,500", "1.24%"],
            ["2022", "189", "14,000", "1.35%"],
            ["2023", "210", "15,000", "1.40%"],
            ["2024", "240", "16,000", "1.50%"],
          ],
        },
        {
          kind: "paragraph",
          text: "The raw count doubles (120 → 240, +100%), but mostly because the whole field grew. The share only goes from 1.20% to 1.50% (+0.30 percentage points, +25%). n = 6 years, total papers = 1,064.",
        },
        { kind: "heading", id: "s", text: "Step 2. The S statistic" },
        {
          kind: "table",
          columns: ["Base year", "Compared with later years", "Up", "Down", "Contribution"],
          rows: [
            ["2019 (1.20)", "1.25  1.24  1.35  1.40  1.50", "5", "0", "+5"],
            ["2020 (1.25)", "1.24  1.35  1.40  1.50", "3", "1", "+2"],
            ["2021 (1.24)", "1.35  1.40  1.50", "3", "0", "+3"],
            ["2022 (1.35)", "1.40  1.50", "2", "0", "+2"],
            ["2023 (1.40)", "1.50", "1", "0", "+1"],
          ],
        },
        { kind: "paragraph", text: "S = 5 + 2 + 3 + 2 + 1 = **13** (14 pairs up, 1 pair down, 15 pairs). τ = 13 / 15 ≈ 0.867. There are no ties." },
        { kind: "heading", id: "p", text: "Step 3. Variance, Z and p" },
        {
          kind: "formula",
          lines: [
            "Var(S) = 6·5·17 / 18 = 510 / 18 ≈ 28.33       √Var(S) ≈ 5.323",
            "Z      = (13 − 1) / 5.323 ≈ 2.254",
            "p      = 2 · [1 − Φ(2.254)] ≈ 2 · 0.0121 ≈ 0.024",
          ],
        },
        { kind: "paragraph", text: "p ≈ 0.024 < 0.05 and S > 0: the share rises significantly." },
        { kind: "heading", id: "sen", text: "Step 4. Sen's slope and its interval" },
        {
          kind: "paragraph",
          text: "15 pairwise slopes d_ij = (s_j − s_i)/(t_j − t_i), e.g. 2019→2024: (1.50 − 1.20)/5 = 0.060; 2020→2021: (1.24 − 1.25)/1 = −0.010. Sorted:",
        },
        {
          kind: "formula",
          lines: [
            "rank:    1      2      3–8         9      10      11     12     13      14     15",
            "d_(k):  −0.010  0.020  0.050 (×6)  0.060  0.0625  0.075  0.080  0.0867  0.100  0.110",
          ],
        },
        {
          kind: "formula",
          lines: [
            "b      = d_(8) = 0.050 pp per year              (median of 15 values)",
            "C      = 1.96 × 5.323 ≈ 10.43",
            "M1     = (15 − 10.43) / 2 ≈ 2.284",
            "M2 + 1 = (15 + 10.43) / 2 + 1 ≈ 13.716",
            "Lower  = d_(2) + 0.284 × (d_(3) − d_(2))     = 0.020 + 0.284 × 0.030    ≈ 0.029",
            "Upper  = d_(13) + 0.716 × (d_(14) − d_(13))  = 0.0867 + 0.716 × 0.0133  ≈ 0.096",
          ],
        },
        { kind: "paragraph", text: "Sen's slope = **0.050 pp per year**, CI95 ≈ **[0.029; 0.096]**. The interval does not contain 0, consistent with the Mann–Kendall result." },
        { kind: "heading", id: "r", text: "Step 5. Relative change" },
        {
          kind: "paragraph",
          text: "Shares sorted: 1.20; 1.24; 1.25; 1.35; 1.40; 1.50. Median = (1.25 + 1.35)/2 = 1.30. r = 0.050 / 1.30 × 100 ≈ **3.8% per year**.",
        },
        { kind: "heading", id: "verdict", text: "Step 6. Verdict" },
        {
          kind: "table",
          columns: ["Check", "Result"],
          rows: [
            ["Source is OpenAlex", "Pass"],
            [`n = 6 ≥ ${C.minYears}`, "Pass"],
            [`Total papers 1,064 ≥ ${C.minPapers}`, "Pass"],
            [`p = 0.024 < ${C.alpha}, S = 13 > 0`, "**Rising**"],
            [`p ≥ ${C.highConfidenceP} and n = 6 < ${C.highConfidenceMinYears}`, "**Medium** confidence"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "This is a topic detail page (one hypothesis), so p is used. On the overview this p is replaced by the q-value after the Benjamini–Hochberg correction with the other topics.",
        },
      ],
    },
  },
};
