import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";

type IdLike = string | mongoose.Types.ObjectId | { _id?: string | mongoose.Types.ObjectId } | null | undefined;

export interface ProjectScopeLike {
  ownerId?: IdLike;
  members?: Array<{ targetId?: IdLike }>;
  papers?: Array<{ targetId?: IdLike }>;
}

export type ProjectAiFeature = "report" | "gap analysis" | "project chat";

export function idToString(value: IdLike): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && "_id" in value) return idToString(value._id);
  return null;
}

export function canAccessProject(project: ProjectScopeLike, userId: string): boolean {
  const ownerId = idToString(project.ownerId);
  if (ownerId === userId) return true;
  return (project.members ?? []).some((member) => idToString(member.targetId) === userId);
}

export function getProjectPaperIds(project: ProjectScopeLike): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const paper of project.papers ?? []) {
    const id = idToString(paper.targetId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function resolveProjectEvidenceIds(
  projectPaperIds: string[],
  requestedPaperIds: string[] | undefined,
): { ids: string[]; invalidIds: string[] } {
  const projectSet = new Set(projectPaperIds);
  const requested = dedupe(requestedPaperIds ?? []);
  if (requested.length === 0) return { ids: projectPaperIds, invalidIds: [] };

  const ids = requested.filter((id) => projectSet.has(id));
  const invalidIds = requested.filter((id) => !projectSet.has(id));
  return { ids, invalidIds };
}

export function assertProjectHasPapers(projectPaperIds: string[], feature: ProjectAiFeature): void {
  if (projectPaperIds.length > 0) return;
  throw AppError.badRequest(`Add papers to this project before using ${feature}.`);
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
