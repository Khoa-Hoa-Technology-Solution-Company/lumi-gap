import { DOCS_SECTIONS as S, docsPath } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { IntroSectionId } from "./index";

export const introEn: DocsModuleContent<IntroSectionId> = {
  groupHeading: "Introduction",
  sections: {
    [S.introReading]: {
      heading: "How to read these docs",
      summary: "These docs explain how every number in LumiGap is computed, which sources it relies on and how far it can be trusted.",
      body: [
        {
          kind: "paragraph",
          text: "Each analysis feature has its own group in the contents on the left. Each section answers three questions: **what is this quantity**, **which formula computes it** and **can it be trusted**.",
        },
        { kind: "heading", id: "structure", text: "Structure of a section" },
        {
          kind: "list",
          items: [
            "A short **definition** in words.",
            "The **formula** in a monospace block, with a *Where:* list explaining every symbol.",
            "**Status labels** (see [Labels used in the docs](" + docsPath(S.introLabels) + ")) tell whether a rule is a published standard, a mathematical consequence or a project convention.",
            "**Sources** are listed at the end of the section; follow a source name to its full citation in [References](" + docsPath(S.references) + ").",
          ],
        },
        { kind: "heading", id: "beginners", text: "If you are new to research" },
        {
          kind: "paragraph",
          text: "Start with the [Glossary](" + docsPath(S.glossary) + "). It explains in plain words ideas such as p-value, confidence interval, median and share. Then read the [Worked example](" + docsPath(S.trendWorkedExample) + ") to see every step on a 6-year series.",
        },
        { kind: "heading", id: "citing", text: "Citing these docs" },
        {
          kind: "paragraph",
          text: "Each section has its own address `/docs/<section-id>` and each subheading an anchor `#<id>`. Use the copy-link button next to a heading to cite it precisely. When you describe the method in your own writing, cite the **original sources** (e.g. [@usgs-helsel-2020]), not only this page.",
        },
      ],
    },
    [S.introTransparency]: {
      heading: "Transparency principle",
      summary: "No conclusion in LumiGap is one that users cannot check for themselves.",
      body: [
        {
          kind: "list",
          ordered: true,
          items: [
            "**Every conclusion has a formula.** A label such as \"rising trend\" is decided by a rule written on this page, not by an AI model's judgement.",
            "**Every formula has a source.** Government publications and peer-reviewed articles come first; DOIs are checked against Crossref.",
            "**Standards are kept apart from conventions.** Every threshold the project chose itself is marked *Project convention* with its reason.",
            "**Limitations are stated.** Each method has a limitations section; when data are insufficient the system says \"insufficient data\" instead of guessing.",
            "**Numbers are reproducible.** Counts come from OpenAlex, an open database; anyone can run the same query again.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "AI (a language model) is used only to explain results in words when a user asks for it. It does not decide trend labels and does not change any statistic.",
        },
      ],
    },
    [S.introLabels]: {
      heading: "Labels used in the docs",
      summary: "The coloured boxes tell where a rule comes from.",
      body: [
        {
          kind: "callout",
          tone: "standard",
          text: "A method or threshold used exactly as in a published document (government manual, peer-reviewed article, textbook). Examples: the Mann–Kendall test, the significance level α = 0.05.",
        },
        {
          kind: "callout",
          tone: "derived",
          text: "Not chosen by anyone but implied by the mathematics of the method. Example: with 4 years, Mann–Kendall cannot give p < 0.05.",
        },
        {
          kind: "callout",
          tone: "convention",
          text: "A choice of the LumiGap project, with a reason but not published by any organisation. Example: at least 30 papers are required. You may disagree with a convention; that is why each one is marked.",
        },
        {
          kind: "callout",
          tone: "limitation",
          text: "What the method cannot do or an assumption that may not hold. Read these before using a result for an important decision.",
        },
        {
          kind: "paragraph",
          text: "Each source in [References](" + docsPath(S.references) + ") also shows its document type (government statistical report, technical manual, peer-reviewed article, textbook, data provider documentation) and its verification status.",
        },
      ],
    },
  },
};
