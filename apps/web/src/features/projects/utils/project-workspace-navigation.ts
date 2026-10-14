/** Keep the project search and current section, never another project's record IDs. */
export function projectWorkspaceHref(id: string, current: URLSearchParams) {
  const params = new URLSearchParams();
  for (const key of ["q", "tab"]) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `/projects/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}
