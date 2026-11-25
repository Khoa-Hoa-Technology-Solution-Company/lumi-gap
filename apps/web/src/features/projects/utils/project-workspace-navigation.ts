const LAST_PROJECT_STORAGE_PREFIX = "lumigap.lastProject:";
const POST_LOGOUT_PROJECT_PREFIX = "lumigap.postLogoutProject:";

export interface LastVisitedProject {
  projectId: string;
  tab?: string;
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isProjectDetailPath(path: string): boolean {
  return /^\/projects\/[^/?#]+/.test(path);
}

/** Read the last accessible project visited by this user inside `/projects/:id`. */
export function readLastVisitedProject(userId?: string): LastVisitedProject | null {
  if (!userId) return null;
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${LAST_PROJECT_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastVisitedProject> | null;
    if (!parsed || typeof parsed.projectId !== "string" || !parsed.projectId) return null;
    return {
      projectId: parsed.projectId,
      ...(typeof parsed.tab === "string" && parsed.tab ? { tab: parsed.tab } : {}),
    };
  } catch {
    return null;
  }
}

/** Persist the active project (and optional section tab) for returning visits to `/projects`. */
export function writeLastVisitedProject(userId: string | undefined, projectId: string, tab?: string | null): void {
  if (!userId || !projectId) return;
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const value: LastVisitedProject = { projectId, ...(tab ? { tab } : {}) };
    storage.setItem(`${LAST_PROJECT_STORAGE_PREFIX}${userId}`, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

/** Remember a project URL across explicit sign-out so the same user resumes there on next login. */
export function storePostLogoutProjectPath(userId: string | undefined, path: string | null | undefined): void {
  if (!userId || !path || !isProjectDetailPath(path)) return;
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(`${POST_LOGOUT_PROJECT_PREFIX}${userId}`, path);
  } catch {
    // Ignore storage errors.
  }
}

/** Read and clear the pending post-logout project URL for the authenticated user. */
export function consumePostLogoutProjectPath(userId: string | undefined): string | undefined {
  if (!userId) return undefined;
  const storage = getLocalStorage();
  if (!storage) return undefined;
  const key = `${POST_LOGOUT_PROJECT_PREFIX}${userId}`;
  try {
    const path = storage.getItem(key);
    storage.removeItem(key);
    return path && isProjectDetailPath(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the project search and current section, never another project's record IDs. */
export function projectWorkspaceHref(id: string, current: URLSearchParams, fallbackTab?: string) {
  const params = new URLSearchParams();
  const q = current.get("q");
  if (q) params.set("q", q);
  const tab = current.get("tab") ?? fallbackTab;
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return `/projects/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}
