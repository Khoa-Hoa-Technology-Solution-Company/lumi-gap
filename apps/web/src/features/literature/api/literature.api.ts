import type {
  AddCorpusPaperRequest,
  CorpusPaperRecord,
  CreateLiteratureCorpusRequest,
  LiteratureCorpus,
  LiteratureEvidenceMap,
} from "@trend/shared-types";
import { api } from "@/services/api-client";

const corpusPath = (id: string) => `/literature/corpora/${id}`;

export const literatureApi = {
  async list(): Promise<LiteratureCorpus[]> {
    const response = await api.get("/literature/corpora");
    return response.data.data;
  },
  async create(input: CreateLiteratureCorpusRequest): Promise<LiteratureCorpus> {
    const response = await api.post("/literature/corpora", input);
    return response.data.data;
  },
  async detail(id: string): Promise<{ corpus: LiteratureCorpus; papers: CorpusPaperRecord[] }> {
    const response = await api.get(corpusPath(id));
    return response.data.data;
  },
  async addPaper(id: string, input: AddCorpusPaperRequest): Promise<CorpusPaperRecord> {
    const response = await api.post(`${corpusPath(id)}/papers`, input);
    return response.data.data;
  },
  async removePaper(id: string, paperId: string): Promise<void> {
    await api.delete(`${corpusPath(id)}/papers/${paperId}`);
  },
  async evidenceMap(id: string): Promise<LiteratureEvidenceMap> {
    const response = await api.get(`${corpusPath(id)}/evidence-map`);
    return response.data.data;
  },
};
