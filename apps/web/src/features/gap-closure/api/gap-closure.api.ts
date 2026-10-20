import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";
import type {
  CalibrationQuestionView,
  ClosureCalibrationView,
  CoverageCheckView,
  CreateCalibrationQuestionRequest,
  CreateClosureCalibrationRequest,
  CreateCoverageCheckRequest,
  DecideGapClosureRequest,
  GapClosureCheckView,
  GapClosureDocumentView,
  GapClosureDossier,
  ReviewClosureDocumentRequest,
  StartGapClosureCheckRequest,
} from "@trend/shared-types";

const routes = API_ROUTES.gapClosure;

export interface ClosureMarkdownDossier {
  filename: string;
  markdown: string;
}

export const gapClosureApi = {
  async startCheck(gapId: string, payload: StartGapClosureCheckRequest): Promise<GapClosureCheckView> {
    const res = await api.post(routes.gapChecks(gapId), payload);
    return res.data.data;
  },

  async listChecks(gapId: string): Promise<GapClosureCheckView[]> {
    const res = await api.get(routes.gapChecks(gapId));
    return res.data.data;
  },

  async getCheck(checkId: string): Promise<GapClosureCheckView> {
    const res = await api.get(routes.check(checkId));
    return res.data.data;
  },

  async reviewDocument(checkId: string, documentId: string, payload: ReviewClosureDocumentRequest): Promise<GapClosureDocumentView> {
    const res = await api.patch(routes.document(checkId, documentId), payload);
    return res.data.data;
  },

  async decide(checkId: string, payload: DecideGapClosureRequest): Promise<GapClosureCheckView> {
    const res = await api.post(routes.decide(checkId), payload);
    return res.data.data;
  },

  async dossierJson(checkId: string): Promise<GapClosureDossier> {
    const res = await api.get(routes.dossier(checkId), { params: { format: "json" } });
    return res.data.data;
  },

  async dossierMarkdown(checkId: string): Promise<ClosureMarkdownDossier> {
    const res = await api.get(routes.dossier(checkId), { params: { format: "markdown" } });
    return res.data.data;
  },

  async createCoverageCheck(payload: CreateCoverageCheckRequest): Promise<CoverageCheckView> {
    const res = await api.post(routes.coverageChecks, payload);
    return res.data.data;
  },

  async listCoverageChecks(params?: { topic?: string; projectId?: string }): Promise<CoverageCheckView[]> {
    const res = await api.get(routes.coverageChecks, { params });
    return res.data.data;
  },

  async listCalibrations(): Promise<ClosureCalibrationView[]> {
    const res = await api.get(routes.calibrations);
    return res.data.data;
  },

  async getCalibration(id: string): Promise<ClosureCalibrationView> {
    const res = await api.get(routes.calibration(id));
    return res.data.data;
  },

  async createCalibration(payload: CreateClosureCalibrationRequest): Promise<ClosureCalibrationView> {
    const res = await api.post(routes.calibrations, payload);
    return res.data.data;
  },

  async addCalibrationQuestion(id: string, payload: CreateCalibrationQuestionRequest): Promise<CalibrationQuestionView> {
    const res = await api.post(routes.calibrationQuestions(id), payload);
    return res.data.data;
  },

  async deleteCalibrationQuestion(id: string, questionId: string): Promise<void> {
    await api.delete(routes.calibrationQuestion(id, questionId));
  },

  async runCalibration(id: string): Promise<ClosureCalibrationView> {
    const res = await api.post(routes.calibrationRun(id));
    return res.data.data;
  },

  async computeCalibration(id: string): Promise<ClosureCalibrationView> {
    const res = await api.post(routes.calibrationCompute(id));
    return res.data.data;
  },
};

/** Saves text as a file through a temporary object URL. */
export function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
