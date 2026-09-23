export interface PicocScope {
  population?: string;
  intervention?: string;
  comparison?: string;
  outcome?: string;
  context?: string;
}

export interface LiteratureCorpus {
  _id: string;
  ownerId: string;
  projectId?: string;
  name: string;
  topic: string;
  researchGoal?: string;
  domain?: string;
  keywords: string[];
  picoc: PicocScope;
  searchStrategy?: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  paperCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CorpusPaperEvidence {
  researchProblem?: string;
  objectives?: string;
  population?: string;
  context?: string;
  intervention?: string;
  comparison?: string;
  outcome?: string;
  methodology?: string;
  dataset?: string;
  findings?: string;
  limitations?: string;
  futureWork?: string;
  contributionType?: string;
  researchType?: string;
}

export interface CorpusPaperRecord {
  _id: string;
  corpusId: string;
  paperId: string | { _id: string; title: string; publicationYear?: number; journalName?: string; doi?: string };
  included: boolean;
  exclusionReason?: string;
  evidence: CorpusPaperEvidence;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLiteratureCorpusRequest {
  name: string;
  topic: string;
  researchGoal?: string;
  domain?: string;
  keywords?: string[];
  picoc?: PicocScope;
  searchStrategy?: string;
  projectId?: string;
}

export interface AddCorpusPaperRequest {
  paperId: string;
  included?: boolean;
  exclusionReason?: string;
  evidence?: CorpusPaperEvidence;
}

export interface EvidenceMapBucket {
  value: string;
  count: number;
}

export interface LiteratureEvidenceMap {
  corpusId: string;
  includedPaperCount: number;
  dimensions: {
    methodology: EvidenceMapBucket[];
    context: EvidenceMapBucket[];
    outcome: EvidenceMapBucket[];
    researchType: EvidenceMapBucket[];
    year: EvidenceMapBucket[];
  };
}
