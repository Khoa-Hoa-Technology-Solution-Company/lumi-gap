// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { ResearchGapItem } from "@trend/shared-types";
import { ProjectGapResults } from "../components/project-gap-results";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, args?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(args?.[name] ?? name)) }) }));
vi.mock("../components/research-gap-evaluation", () => ({ assessmentLabels: { PROPOSED: "Proposed candidate" } }));
const gap: ResearchGapItem = {
  id: "g1", title: "Replication across institutions", topic: "Learning", normalizedTopic: "learning", description: "A bounded research opportunity.",
  rationale: "One institution [1]", suggestedResearchQuestion: "Do outcomes replicate across institutions?", observedLimitation: "Single institution in the available source [1].",
  supportingPaperIds: ["p1"], supportingPapers: [{ id: "p1", title: "Original study" }], evidencePaperIds: ["p1"], evidencePapers: [{ id: "p1", title: "Original study" }],
  confidence: 0, evidenceStatus: "weak", source: "standalone", userId: "actor", status: "active", createdAt: "2026-10-19T00:00:00Z", origin: "AI_ASSISTED", assessmentStatus: "PROPOSED",
};
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); vi.unstubAllGlobals(); });
async function render(value = gap) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), open = vi.fn();
  await act(async () => root.render(<MemoryRouter><ProjectGapResults projectId="project" gaps={[value]} onOpen={open} /></MemoryRouter>));
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  return { host, open };
}
it("shows an actionable question, its source limitation and actual supporting papers", async () => {
  const { host, open } = await render();
  expect(host.textContent).toContain(gap.suggestedResearchQuestion); expect(host.textContent).toContain(gap.observedLimitation);
  expect(host.textContent).toContain("1 supporting papers"); expect(host.querySelector('a[href="/projects/project?tab=papers&source=p1"]')).not.toBeNull();
  expect(host.textContent).not.toContain("99%"); expect(host.textContent).not.toContain("v1");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Review evidence"))!.click());
  expect(open).toHaveBeenCalledWith(gap);
});
it("preserves earlier candidates and explains that reanalysis is needed for the new format", async () => {
  const { host } = await render({ ...gap, suggestedResearchQuestion: undefined });
  expect(host.textContent).toContain("These earlier results are saved"); expect(host.textContent).toContain(gap.description);
});
