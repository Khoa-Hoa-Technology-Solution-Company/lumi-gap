export function projectSubmissionPath(projectId: string, submission?: string) {
  const params = new URLSearchParams({ tab: "submissions" });
  if (submission) params.set("submission", submission);
  return `/projects/${encodeURIComponent(projectId)}?${params}`;
}
