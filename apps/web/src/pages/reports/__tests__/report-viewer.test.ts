import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("ReportViewerPage bookmark integration", () => {
  it("wires report bookmarks into the report viewer", () => {
    const source = readFileSync(fileURLToPath(new URL("../report-viewer.tsx", import.meta.url)), "utf8");

    expect(source).toContain("useBookmarkStatus(\"report\", id");
    expect(source).toContain("useCreateBookmark()");
    expect(source).toContain("useDeleteBookmark()");
    expect(source).toContain("targetKind: \"report\"");
    expect(source).toContain("linkReportCitations(report.markdown");
    expect(source).toContain("report.groundingPapers ?? []");
    expect(source).toContain("isGroundingCitationLink(href, title)");
  });
});
