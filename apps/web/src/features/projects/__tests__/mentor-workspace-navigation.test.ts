import { expect, it } from "vitest";
import { legacyAcademicSupportDestination, mentorWorkspaceDestination, researchProjectDirectoryDestination, resolveManuscriptDestination, safeMentorWorkReturn, withMentorWorkReturn } from "../utils/mentor-workspace-navigation";

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

it("resolves manuscript destination by actor role without leaking project workspace URLs to reviewers", () => {
  const workReturn = "/mentor-workspace?view=work&workPage=1&workStatus=ACTIONABLE&workSort=priority";
  const mentorUrl = resolveManuscriptDestination({
    actorRole: "REVIEWER",
    requestId: "req-1",
    projectId: "proj-1",
    submissionId: "sub-1",
    revisionId: "rev-2",
    returnTo: workReturn,
  });
  expect(mentorUrl).not.toBeNull();
  const parsed = new URL(mentorUrl!, "http://localhost");
  expect(parsed.pathname).toBe("/mentor-workspace");
  expect(parsed.searchParams.get("view")).toBe("manuscript");
  expect(parsed.searchParams.get("requestId")).toBe("req-1");
  expect(parsed.searchParams.get("revisionId")).toBe("rev-2");
  expect(parsed.searchParams.get("reader")).toBe("1");
  expect(parsed.searchParams.get("returnTo")).toBe(safeMentorWorkReturn(workReturn));
  expect(mentorUrl).not.toContain("/projects/");

  const requesterUrl = resolveManuscriptDestination({
    actorRole: "REQUESTER",
    requestId: "req-1",
    projectId: "proj-1",
    submissionId: "sub-1",
    revisionId: "rev-2",
    returnTo: workReturn,
  });
  expect(requesterUrl).toBe("/projects/proj-1?tab=submissions&submission=sub-1");
});

it("strips unsafe or nested returnTo parameters while allowing reviews, overview and resources returns with sanitized filters", () => {
  expect(safeMentorWorkReturn("/mentor-workspace?view=reviews")).toBe("/mentor-workspace?view=reviews");
  expect(safeMentorWorkReturn("/mentor-workspace?view=overview")).toBe("/mentor-workspace?view=overview");
  expect(safeMentorWorkReturn("/mentor-workspace?view=work&returnTo=%2Fmentor-workspace%3Fview%3Dwork")).not.toContain("returnTo=");
  expect(safeMentorWorkReturn("javascript:alert(1)")).toBeUndefined();
  expect(safeMentorWorkReturn("/projects/proj-1?tab=submissions")).toBeUndefined();

  const resBack = safeMentorWorkReturn(
    "/mentor-workspace?view=resources&q=clinical&projectId=11111111-1111-4111-8111-111111111111&category=MANUSCRIPT_REPORT&sort=title&page=2&returnTo=evil&unknown=1",
  );
  expect(resBack).toBeDefined();
  const parsed = new URL(resBack!, "http://localhost");
  expect(Object.fromEntries(parsed.searchParams)).toEqual({
    view: "resources",
    q: "clinical",
    projectId: "11111111-1111-4111-8111-111111111111",
    category: "MANUSCRIPT_REPORT",
    sort: "title",
    page: "2",
  });
  // Drops invalid projectId/category/sort safely
  const sanitized = safeMentorWorkReturn("/mentor-workspace?view=resources&projectId=../etc&category=INVALID&sort=hack&page=0");
  expect(sanitized).toBe("/mentor-workspace?view=resources");

  // Preserves sanitized projects directory filters & page in returnTo
  const projBack = safeMentorWorkReturn(
    "/mentor-workspace?view=projects&projectSearch=clinical&projectFilter=ATTENTION&projectSort=name&projectPage=2&returnTo=evil&extra=1",
  );
  expect(projBack).toBeDefined();
  const parsedProj = new URL(projBack!, "http://localhost");
  expect(Object.fromEntries(parsedProj.searchParams)).toEqual({
    view: "projects",
    projectPage: "2",
    projectSearch: "clinical",
    projectFilter: "ATTENTION",
    projectSort: "name",
  });
  expect(safeMentorWorkReturn("/mentor-workspace?view=projects&projectFilter=INVALID&projectSort=bad&projectPage=0")).toBe(
    "/mentor-workspace?view=projects",
  );
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
