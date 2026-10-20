import { DOCS_SECTIONS as S } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { ReferencesSectionId } from "./index";

export const referencesEn: DocsModuleContent<ReferencesSectionId> = {
  groupHeading: "References",
  sections: {
    [S.references]: {
      heading: "References",
      summary: "Full list of sources, grouped by their role in the method, with document type and verification status.",
      body: [
        {
          kind: "paragraph",
          text: "Every DOI was checked against Crossref (authors, year, title, venue). Works without a DOI were checked on the publisher's official page or in a library catalogue. A source whose content could not be checked is marked **Not verified**.",
        },
        {
          kind: "bibliography",
          groups: [
            { role: "framework", heading: "Main framework", intro: "Two government publications: NSF defines the measure (the share), USGS provides the methods to detect and size a trend." },
            { role: "method-origin", heading: "Origins of the computations", intro: "Original papers and books behind each computation of the framework." },
            { role: "supplementary", heading: "Supplementary information and context", intro: "Methods for rising keywords, PP(top 10%) and the context of the growth of science. They do not affect the trend verdict." },
            { role: "data", heading: "Data source", intro: "Documentation of OpenAlex, the provider of the counts." },
          ],
        },
      ],
    },
  },
};
