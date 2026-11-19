import { describe, expect, it } from "vitest";
import { MANUSCRIPT_DOCUMENT_TYPES, MANUSCRIPT_TEMPLATE_REGISTRY, MANUSCRIPT_TEMPLATES, MANUSCRIPT_TYPES, compatibleManuscriptTemplates, isManuscriptTemplateCompatible, type ManuscriptTemplate } from "@trend/shared-types";
import { createManuscriptSchema } from "../dto/manuscript.schema.js";
import { manuscriptPath, manuscriptTemplate } from "../manuscript-source.js";

const input = { title: "Research document", description: "", clientKey: crypto.randomUUID() };
describe("canonical manuscript template registry", () => {
  it.each(MANUSCRIPT_TYPES)("offers only compatible templates with a default and blank option for %s", type => {
    const items = compatibleManuscriptTemplates(type);
    expect(items[0]?.id).toBe(MANUSCRIPT_DOCUMENT_TYPES[type].defaultTemplate);
    expect(items.some(item => item.id === "BLANK")).toBe(true);
    for (const template of MANUSCRIPT_TEMPLATES) {
      expect(createManuscriptSchema.safeParse({ ...input, documentType: type, template }).success).toBe(isManuscriptTemplateCompatible(type, template));
    }
  });
  it.each(MANUSCRIPT_TEMPLATES)("initializes valid, distinct %s source from its documented class", template => {
    const definition = MANUSCRIPT_TEMPLATE_REGISTRY[template];
    const sources = manuscriptTemplate("Nghiên cứu & evidence", template);
    const main = sources.find(file => file.path === definition.mainTexFile)!;
    expect(main.text).toContain(`{${definition.documentClass}}`);
    expect(main.text).toContain("\\begin{document}");
    expect(main.text).toContain("\\end{document}");
    for (const source of sources) expect(manuscriptPath(source.path, "TEXT")).toBe(source.path);
    for (const match of main.text.matchAll(/\\input\{([^}]+)\}/g)) expect(sources.some(file => file.path === match[1])).toBe(true);
    expect(new Set(sources.map(file => file.path)).size).toBe(sources.length);
    expect(definition.sourceUrl).toMatch(/^https:\/\//);
    expect(definition.previewAsset).toMatch(/^\/manuscript-templates\/v2\//);
  });
  it("uses chapters for research reports and keeps a real abstract for basic articles", () => {
    expect(manuscriptTemplate("Report", "REPORT")[1]!.text).toContain("\\chapter{Introduction}");
    expect(manuscriptTemplate("Paper", "ARTICLE")[0]!.text).toContain("\\begin{abstract}");
    expect(manuscriptTemplate("Blank", "BLANK")).toHaveLength(1);
  });
  it("normalizes titles, restricts custom names and rejects unknown IDs and template path injection", () => {
    expect(createManuscriptSchema.parse({ ...input, title: "  My  \n study ", documentType: "OTHER", documentTypeLabel: " Poster ", template: "BLANK" })).toMatchObject({ title: "My study", documentTypeLabel: "Poster" });
    for (const values of [{ title: "  " }, { template: "../ARTICLE" }, { template: "UNKNOWN" }, { documentTypeLabel: "x".repeat(81) }]) expect(createManuscriptSchema.safeParse({ ...input, documentType: "OTHER", template: "BLANK", ...values }).success).toBe(false);
    expect(createManuscriptSchema.safeParse({ ...input, documentType: "THESIS", template: "THESIS", documentTypeLabel: "Poster" }).success).toBe(false);
    expect(() => manuscriptTemplate("Paper", "../../evil" as ManuscriptTemplate)).toThrow();
    expect(manuscriptTemplate("\\input{private}% &", "ARTICLE")[0]!.text).toContain("\\textbackslash{}input\\{private\\}\\% \\&");
  });
});
