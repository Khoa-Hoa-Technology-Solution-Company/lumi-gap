import { expect, it } from "vitest";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";

it("keeps mentor project, invitations, resources and notification links in the shell", () => {
  expect(mentorWorkspaceDestination("/notifications")).toBe("/mentor-workspace?view=notifications");
  expect(mentorWorkspaceDestination("/academic-support?view=incoming&requestId=request")).toBe("/mentor-workspace?view=incoming&requestId=request");
  expect(mentorWorkspaceDestination("/academic-support?view=discover")).toBe("/mentor-workspace?view=discover");
  const project = new URL(mentorWorkspaceDestination("/projects/a%2Fb?tab=chat&channel=mentors&workItem=TASK%3Aitem"), "http://localhost");
  expect(project.pathname).toBe("/mentor-workspace");
  expect(Object.fromEntries(project.searchParams)).toEqual({ view: "project", projectId: "a/b", tab: "chat", channel: "mentors", workItem: "TASK:item" });
  const resources = new URL(mentorWorkspaceDestination("/academic-support/projects/project?view=resources"), "http://localhost");
  expect(Object.fromEntries(resources.searchParams)).toEqual({ view: "project", projectId: "project", section: "resources" });
});

it.each(["/profile", "/projects/project/manuscripts/draft", "https://example.test/projects/project", "//example.test/projects/project", "/projects/%zz", "/reviews/%zz"])("preserves unrelated destinations without inventing access: %s", path => {
  expect(mentorWorkspaceDestination(path)).toBe(path);
});

it.each([
  ["/reviews", "/mentor-workspace?view=reviews"],
  ["/review-templates", "/mentor-workspace?view=templates"],
  ["/review-templates/new", "/mentor-workspace?view=template-builder"],
  ["/review-templates/rubric/edit", "/mentor-workspace?view=template-builder&templateId=rubric"],
  ["/reviews/assignment", "/mentor-workspace?view=review&assignmentId=assignment"],
  ["/review-requests/request", "/mentor-workspace?view=review-request&requestId=request"],
  ["/reviews/mentor-entry/submission", "/mentor-workspace?view=review-entry&submissionId=submission"],
])("keeps the exact review/template selector for %s", (path, expected) => {
  expect(mentorWorkspaceDestination(path)).toBe(expected);
});
