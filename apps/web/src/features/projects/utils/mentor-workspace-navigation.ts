/** Keep mentor navigation in its shell without granting access to any resource. */
export function mentorWorkspaceDestination(href: string): string {
  if (href === "/reviews") return "/mentor-workspace?view=reviews";
  if (href === "/review-templates") return "/mentor-workspace?view=templates";
  if (href === "/review-templates/new") return "/mentor-workspace?view=template-builder";
  const review = /^\/(reviews\/mentor-entry|reviews|review-requests|review-templates)\/([^/?#]+)(\/edit)?$/.exec(href);
  if (review) {
    const kind = review[1];
    if (kind === "review-templates" && !review[3] || kind !== "review-templates" && review[3]) return href;
    const params = new URLSearchParams({ view: kind === "review-templates" ? "template-builder" : kind === "review-requests" ? "review-request" : kind === "reviews/mentor-entry" ? "review-entry" : "review" });
    try { params.set(kind === "review-templates" ? "templateId" : kind === "review-requests" ? "requestId" : kind === "reviews/mentor-entry" ? "submissionId" : "assignmentId", decodeURIComponent(review[2]!)); }
    catch { return href; }
    return `/mentor-workspace?${params}`;
  }
  if (href === "/notifications") return "/mentor-workspace?view=notifications";
  const support = /^\/academic-support(?:\?([^#]*))?$/.exec(href);
  if (support) return `/mentor-workspace?${support[1] || "view=incoming"}`;
  const project = /^\/(?:projects|academic-support\/projects)\/([^/?#]+)(?:\?([^#]*))?(#.*)?$/.exec(href);
  if (!project) return href;
  const params = new URLSearchParams(project[2]);
  if (params.get("view") === "resources") params.set("section", "resources");
  params.set("view", "project");
  try { params.set("projectId", decodeURIComponent(project[1]!)); }
  catch { return href; }
  return `/mentor-workspace?${params}${project[3] ?? ""}`;
}
