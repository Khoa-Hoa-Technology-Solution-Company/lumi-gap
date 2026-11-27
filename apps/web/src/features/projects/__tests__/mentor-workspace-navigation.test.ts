import { expect, it } from "vitest";
import { legacyAcademicSupportDestination, mentorWorkspaceDestination, researchProjectDirectoryDestination, safeMentorWorkReturn, withMentorWorkReturn } from "../utils/mentor-workspace-navigation";

it.each([
  ["/projects", ""],
  ["/projects/?q=education&scope=OWNED&status=ACTIVE&sort=NAME&create=1#list", ""],
  ["/projects?view=trash", "trash"],
  ["/projects?view=invitations", "invitations"],
])("leaves personal project directory links in the research workspace: %s", (path) => {
  expect(mentorWorkspaceDestination(path)).toBe(path);
});

it.each([
  ["view=research-projects", "/projects"],
  ["view=research-projects&directory=trash", "/projects?view=trash"],
  ["view=research-projects&directory=invitations", "/projects?view=invitations"],
  ["view=research-projects&q=study&scope=OWNED&create=1&projectId=wrong", "/projects?q=study&scope=OWNED&create=1"],
])("moves an old embedded directory link outside without retaining mentor selectors: %s", (query, target) => {
  expect(researchProjectDirectoryDestination(new URLSearchParams(query), "#list")).toBe(`${target}#list`);
});

it("keeps mentor project, invitations, resources and notification links in the shell", () => {
  expect(mentorWorkspaceDestination("/notifications")).toBe("/mentor-workspace?view=notifications");
  expect(mentorWorkspaceDestination("/academic-support?view=incoming&requestId=request")).toBe("/mentor-workspace?view=incoming&requestId=request");
  expect(mentorWorkspaceDestination("/academic-support?view=discover")).toBe("/mentor-workspace?view=discover");
  expect(mentorWorkspaceDestination("/academic-support?view=active")).toBe("/mentor-workspace?view=projects");
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
it("preserves reader, historical review and safe work context without accepting an external return URL", () => {
  const back = "/mentor-workspace?view=work&workPage=2&workStatus=WAITING&workQ=method&workKind=REVIEW&workGroup=status";
  const result = new URL(withMentorWorkReturn(mentorWorkspaceDestination("/review-requests/request?reader=1&reviewId=round-one&revisionId=v1"), back), "http://localhost");
  expect(Object.fromEntries(result.searchParams)).toMatchObject({ view: "review-request", requestId: "request", reader: "1", reviewId: "round-one", revisionId: "v1" });
  expect(result.searchParams.get("returnTo")).toBe(safeMentorWorkReturn(back));
  expect(result.searchParams.get("returnTo")).toContain("workGroup=status");
  for (const unsafe of ["https://evil.example/mentor-workspace?view=work", "//evil.example/mentor-workspace?view=work", "/mentor-workspace?view=review&assignmentId=other", "/mentor-workspace?view=project&projectId=../private", "/mentor-workspace?view=work#unexpected"]) expect(safeMentorWorkReturn(unsafe)).toBeUndefined();
});

it.each([
  ["view=history", true, "/mentor-workspace?view=history"],
  ["view=active", true, "/mentor-workspace?view=projects"],
  ["view=discover", true, "/mentor-workspace?view=discover"],
  ["view=outgoing", true, "/mentor-workspace?view=outgoing"],
  ["view=https://example.test", true, "/mentor-workspace?view=incoming"],
  ["view=history", false, "/projects"],
  ["projectId=project", false, "/projects/project?tab=support&view=requests"],
  ["invitationProjectId=project&requestId=request", false, "/projects/project?tab=support&view=requests&requestId=request"],
  ["projectId=project&section=gaps", true, "/mentor-workspace?view=project&projectId=project&section=gaps"],
  ["view=incoming&invitationProjectId=project&requestId=request", true, "/mentor-workspace?view=incoming&invitationProjectId=project&requestId=request"],
] as const)("retires standalone support links without losing their actor or context: %s", (query, lecturer, target) => {
  expect(legacyAcademicSupportDestination(new URLSearchParams(query), lecturer)).toBe(target);
});
it("keeps the mentor preferences shortcut while refusing arbitrary redirect parameters", () => {
  expect(legacyAcademicSupportDestination(new URLSearchParams("returnTo=https://example.test"), true, "#mentoring-settings"))
    .toBe("/mentor-workspace?view=incoming#mentoring-settings");
});
