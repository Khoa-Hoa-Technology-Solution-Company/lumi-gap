import { mentorWorkKinds, type MentorWorkQuery } from "@trend/shared-types";

/** Retire the standalone support page while keeping old invitations and bookmarks usable. */
export function legacyAcademicSupportDestination(params: URLSearchParams, lecturer: boolean, hash = ""): string {
  const projectId = params.get("projectId");
  if (!lecturer) {
    const teamProjectId = params.get("invitationProjectId") || projectId;
    if (!teamProjectId) return "/projects";
    const search = new URLSearchParams({ tab: "support", view: "requests" });
    if (params.has("requestId")) search.set("requestId", params.get("requestId")!);
    return `/projects/${encodeURIComponent(teamProjectId)}?${search}`;
  }
  const view = params.get("view");
  const next = new URLSearchParams({ view: projectId ? "project" : view === "active" ? "projects" : ["incoming", "outgoing", "history", "discover"].includes(view ?? "") ? view! : "incoming" });
  if (projectId) {
    next.set("projectId", projectId);
    if (params.has("section")) next.set("section", params.get("section")!);
  }
  for (const key of ["invitationProjectId", "requestId"]) {
    if (params.has(key)) next.set(key, params.get(key)!);
  }
  return `/mentor-workspace?${next}${hash === "#mentoring-settings" ? hash : ""}`;
}

const workStatuses = ["ACTIONABLE", "IN_PROGRESS", "WAITING", "DONE", "ALL", "TODO", "BLOCKED", "OVERDUE"];
export function readMentorWorkFilters(params: URLSearchParams): MentorWorkQuery {
  const page = Number(params.get("workPage"));
  const status = params.get("workStatus") ?? "ACTIONABLE";
  const kind = params.get("workKind");
  return { page: Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1,
    status: workStatuses.includes(status) ? status as MentorWorkQuery["status"] : "ACTIONABLE",
    sort: params.get("workSort") === "deadline" ? "deadline" : "priority",
    ...(params.get("workQ") ? { q: params.get("workQ")!.slice(0,160) } : {}),
    ...(kind && [...mentorWorkKinds, "REVIEW"].includes(kind) ? { kind: kind as MentorWorkQuery["kind"] } : {}),
    ...(params.get("workProjectId") ? { projectId: params.get("workProjectId")! } : {}),
  };
}
export function writeMentorWorkFilters(params: URLSearchParams, filters: MentorWorkQuery): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries({ workPage: filters.page, workStatus: filters.status, workSort: filters.sort, workQ: filters.q, workKind: filters.kind, workProjectId: filters.projectId })) {
    if (value === undefined || value === "") next.delete(key); else next.set(key, String(value));
  }
  return next;
}
/** Only a local work queue URL can be used as a return destination. */
export function safeMentorWorkReturn(value: string | null | undefined): string | undefined {
  if (!value?.startsWith("/mentor-workspace?") || value.includes("#")) return;
  const search = new URLSearchParams(value.slice(value.indexOf("?") + 1));
  const view = search.get("view");
  if (view !== "work" && view !== "project") return;
  const result = writeMentorWorkFilters(new URLSearchParams({ view }), readMentorWorkFilters(search));
  const group = search.get("workGroup");
  if (group === "status" || group === "project" && view === "work") result.set("workGroup", group);
  if (view === "project") {
    const project = search.get("projectId");
    if (!project || !/^[a-f0-9-]{24,36}$/i.test(project)) return;
    result.set("projectId", project); result.set("tab", "tasks");
  }
  return `/mentor-workspace?${result}`;
}
export function withMentorWorkReturn(target: string, returnTo?: string): string {
  const safe = safeMentorWorkReturn(returnTo);
  if (!safe || !target.startsWith("/mentor-workspace?")) return target;
  const params = new URLSearchParams(target.slice(target.indexOf("?") + 1));
  params.set("returnTo", safe);
  return `/mentor-workspace?${params}`;
}

/** Keep mentor navigation in its shell without granting access to any resource. */
export function mentorWorkspaceDestination(href: string): string {
  if (href === "/reviews") return "/mentor-workspace?view=reviews";
  if (href === "/review-templates") return "/mentor-workspace?view=templates";
  if (href === "/review-templates/new") return "/mentor-workspace?view=template-builder";
  const review = /^\/(reviews\/mentor-entry|reviews|review-requests|review-templates)\/([^/?#]+)(\/edit)?$/.exec(href.split("?")[0]!);
  if (review) {
    const kind = review[1];
    if (kind === "review-templates" && !review[3] || kind !== "review-templates" && review[3]) return href;
    const params = new URLSearchParams({ view: kind === "review-templates" ? "template-builder" : kind === "review-requests" ? "review-request" : kind === "reviews/mentor-entry" ? "review-entry" : "review" });
    try { params.set(kind === "review-templates" ? "templateId" : kind === "review-requests" ? "requestId" : kind === "reviews/mentor-entry" ? "submissionId" : "assignmentId", decodeURIComponent(review[2]!)); }
    catch { return href; }
    const extras = new URLSearchParams(href.split("?")[1]);
    for (const key of ["reviewId", "revisionId", "detailTab", "reader"]) if (extras.has(key)) params.set(key, extras.get(key)!);
    const returnTo = safeMentorWorkReturn(extras.get("returnTo"));
    if (returnTo) params.set("returnTo", returnTo);
    return `/mentor-workspace?${params}`;
  }
  if (href === "/notifications") return "/mentor-workspace?view=notifications";
  const support = /^\/academic-support(?:\?([^#]*))?$/.exec(href);
  if (support) return legacyAcademicSupportDestination(new URLSearchParams(support[1]), true);
  const project = /^\/(?:projects|academic-support\/projects)\/([^/?#]+)(?:\?([^#]*))?(#.*)?$/.exec(href);
  if (!project) return href;
  const params = new URLSearchParams(project[2]);
  if (params.get("view") === "resources") params.set("section", "resources");
  params.set("view", "project");
  try { params.set("projectId", decodeURIComponent(project[1]!)); }
  catch { return href; }
  return `/mentor-workspace?${params}${project[3] ?? ""}`;
}

/** Old embedded personal-library links belong to the research workspace. */
export function researchProjectDirectoryDestination(params: URLSearchParams, hash = ""): string {
  const search = new URLSearchParams();
  for (const key of ["q", "scope", "status", "sort", "create"]) {
    if (params.has(key)) search.set(key, params.get(key)!);
  }
  const directory = params.get("directory");
  if (directory === "trash" || directory === "invitations") search.set("view", directory);
  return `/projects${search.size ? `?${search}` : ""}${hash}`;
}
