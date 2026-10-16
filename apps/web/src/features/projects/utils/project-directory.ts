import type { IProject, ProjectStatus } from "@trend/shared-types";

export const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "PLANNING", "ON_HOLD", "COMPLETED", "ARCHIVED"];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PLANNING: "Planning",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export type ProjectScope = "ALL" | "OWNED" | "SHARED";
export type ProjectSort = "UPDATED" | "NAME" | "OLDEST";
export interface ProjectDirectoryFilters {
  search: string;
  status: ProjectStatus | "ALL";
  scope: ProjectScope;
  sort: ProjectSort;
}

export function readProjectDirectoryFilters(params: URLSearchParams): ProjectDirectoryFilters {
  const status = params.get("status");
  const scope = params.get("scope");
  const sort = params.get("sort");
  return {
    search: params.get("q") ?? "",
    status: PROJECT_STATUSES.includes(status as ProjectStatus) ? status as ProjectStatus : "ALL",
    scope: scope === "OWNED" || scope === "SHARED" ? scope : "ALL",
    sort: sort === "NAME" || sort === "OLDEST" ? sort : "UPDATED",
  };
}

export function readProjectSearchFilters(params: URLSearchParams): ProjectDirectoryFilters {
  return { search: params.get("q") ?? "", status: "ALL", scope: "ALL", sort: "UPDATED" };
}

export function ownsProject(project: IProject, userId: string | undefined) {
  // The API knows the role even when a migrated account uses a different public ID.
  return project.accessRole ? project.accessRole === "OWNER" : Boolean(userId && project.ownerId === userId);
}

function searchable(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/gi, "d").toLocaleLowerCase();
}

export function selectDirectoryProjects(
  projects: IProject[],
  filters: ProjectDirectoryFilters,
  userId: string | undefined,
  language: string,
) {
  const terms = searchable(filters.search.trim()).split(/\s+/).filter(Boolean);
  const result = projects.filter(project => {
    const owned = ownsProject(project, userId);
    if (filters.scope === "OWNED" && !owned) return false;
    if (filters.scope === "SHARED" && owned) return false;
    if (filters.status !== "ALL" && project.status !== filters.status) return false;
    const text = searchable(`${project.title} ${project.description ?? ""} ${project.researchField ?? ""}`);
    return terms.every(term => text.includes(term));
  });
  const collator = new Intl.Collator(language, { sensitivity: "base", numeric: true });
  return result.sort((a, b) => {
    if (filters.sort !== "NAME") {
      const left = Date.parse(a.updatedAt);
      const right = Date.parse(b.updatedAt);
      if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
      if (Number.isFinite(left) && left !== right) return filters.sort === "OLDEST" ? left - right : right - left;
    }
    return collator.compare(a.title, b.title);
  });
}
