import { expect, it } from "vitest";
import { projectSections, resolveProjectTab } from "../components/project-section-nav";

it("replaces the redundant project report workflow with manuscripts", () => {
  expect(projectSections.map(section => section.key)).not.toContain("reports");
  expect(resolveProjectTab("reports")).toBe("manuscripts");
  expect(resolveProjectTab("manuscripts")).toBe("manuscripts");
  expect(resolveProjectTab("gaps")).toBe("gaps");
  expect(resolveProjectTab("plan")).toBe("plan");
  expect(resolveProjectTab("unknown")).toBe("overview");
  expect(resolveProjectTab(null)).toBe("overview");
});
