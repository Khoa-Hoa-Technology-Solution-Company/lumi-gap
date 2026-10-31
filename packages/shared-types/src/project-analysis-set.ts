import type { ScreeningSettings } from "./project-screening.js";

export interface ProjectAnalysisSet {
  id: string; projectId: string; mode: "DRAFT" | "OFFICIAL"; topic: string;
  createdAt: string; createdById: string; confirmedById: string | null;
  settings: ScreeningSettings; hash: string;
  sources: Array<{
    id: string; projectPaperId: string; updatedAt: string; fingerprint: string;
    title: string; abstractText: string | null; doi: string | null; publicationYear: number;
    roundId: string | null; roundVersion: number | null; finalDecisionId: string | null;
    selectionRule: ScreeningSettings | null; reviewIds: string[];
    finalDecision: { id: string; decision: string; reason: string; resolverId: string | null; createdAt: string } | null;
    evidenceRevisions: Array<{ id: string; entityId: string; version: number; snapshot: unknown }>;
  }>;
}
