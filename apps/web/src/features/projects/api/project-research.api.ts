import { api } from "@/services/api-client";
import type { ProjectGapDiscoveryOverview } from "@trend/shared-types";
import type { EvidenceContent, ExtractionSuggestion, GapAssessment, GapResearchView, ProjectEvidencePage, ProjectResearchLibrary, SaveProjectEvidence, ScreeningPhase, ProjectSynthesis, SaveSynthesis, ProjectResearchQuestion, ProjectPaperAnalysis, SynthesisRevision } from "@trend/shared-types";
const path = (id: string, suffix: string) => `/projects/${encodeURIComponent(id)}/research/${suffix}`;
async function get<T>(id: string, suffix: string, params?: Record<string, string | number | undefined>) { return (await api.get<{ data: T }>(path(id, suffix), { params })).data.data; }
async function write<T = unknown>(id: string, suffix: string, data: unknown, method = "post") { return (await api.request<{ data: T }>({ url: path(id, suffix), method, data })).data.data; }
export const researchApi = {
  discovery: (id: string) => get<ProjectGapDiscoveryOverview>(id, "discovery"),
  paperAnalysis: (id: string, paperId: string) => get<ProjectPaperAnalysis>(id, `papers/${encodeURIComponent(paperId)}/analysis`),
  requestPaperAnalysis: (id: string, paperId: string) => write(id, `papers/${encodeURIComponent(paperId)}/analysis`, {}),
  synthesis: (id: string) => get<ProjectSynthesis | null>(id, "synthesis"),
  synthesisHistory: (id: string) => get<SynthesisRevision[]>(id, "synthesis/history"),
  saveSynthesis: (id: string, data: SaveSynthesis) => write(id, "synthesis", data, "put"),
  acceptSynthesis: (id: string, data: { expectedVersion: number; rationale: string }) => write(id, "synthesis/accept", data),
  generateSynthesis: (id: string, data: Pick<SaveSynthesis, "expectedVersion" | "evidence">) => write(id, "synthesis/generate", data),
  questions: (id: string) => get<ProjectResearchQuestion[]>(id, "questions"),
  suggestions: (id: string, paperId: string) => get<ExtractionSuggestion[]>(id, `papers/${paperId}/suggestions`),
  library: (id: string, params: Record<string, string | number | undefined>) => get<ProjectResearchLibrary>(id, "papers", params),
  import: (id: string, data: unknown) => write(id, "papers", data),
  organize: (id: string, paperId: string, data: unknown) => write(id, `papers/${paperId}`, data, "patch"),
  policy: (id: string, data: unknown) => write(id, "screening", data, "patch"),
  assign: (id: string, paperId: string, data: unknown) => write(id, `screening/${paperId}/assign`, data),
  vote: (id: string, paperId: string, data: unknown) => write(id, `screening/${paperId}/vote`, data, "put"),
  resolve: (id: string, paperId: string, data: unknown) => write(id, `screening/${paperId}/resolve`, data),
  screeningHistory: (id: string, paperId: string) => get<Array<{ id: string; version: number; createdAt: string; snapshot: Record<string, unknown> }>>(id, `screening/${paperId}/history`),
  upload: async (id: string, paperId: string, file: File) => { const form = new FormData(); form.append("pdf", file); return write(id, `papers/${paperId}/pdf`, form); },
  download: async (id: string, fileId: string) => (await api.get<Blob>(path(id, `files/${fileId}`), { responseType: "blob" })).data,
  evidence: (id: string, params: Record<string, string | number | undefined>) => get<ProjectEvidencePage>(id, "evidence", params),
  createEvidence: (id: string, data: SaveProjectEvidence) => write(id, "evidence", data),
  editEvidence: (id: string, evidenceId: string, data: EvidenceContent & { expectedVersion: number }) => write(id, `evidence/${evidenceId}`, data, "patch"),
  reviewEvidence: (id: string, evidenceId: string, data: { expectedVersion: number; state: "ACCEPTED" | "REJECTED"; rationale: string }) => write(id, `evidence/${evidenceId}/review`, data),
  evidenceHistory: (id: string, evidenceId: string) => get<Array<{ id: string; version: number; createdAt: string; snapshot: Record<string, unknown> }>>(id, `evidence/${evidenceId}/history`),
  guidance: (id: string, gapId: string, data: { note: string; expectedVersion: number; clientKey: string }) => write(id, `gaps/${gapId}/guidance`, data),
  gap: (id: string, gapId: string) => get<GapResearchView>(id, `gaps/${gapId}`),
  reviseGap: (id: string, gapId: string, data: unknown) => write(id, `gaps/${gapId}`, data, "patch"),
  assessGap: (id: string, gapId: string, data: { status: GapAssessment; rationale: string; expectedVersion: number; reviewedEvidence?: Array<{ id: string; version: number }> }) => write(id, `gaps/${gapId}/assessment`, data),
  linkEvidence: (id: string, gapId: string, data: unknown) => write(id, `gaps/${gapId}/evidence`, data),
  deriveQuestion: (id: string, gapId: string, data: unknown) => write(id, `gaps/${gapId}/questions`, data),
};
export type { ScreeningPhase };
