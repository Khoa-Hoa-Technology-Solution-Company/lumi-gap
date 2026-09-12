import type { Paper, PaperKind, PaperRef } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export interface PapersListParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PaperReferencesResult {
  references: PaperRef[];
  totalReferenced: number;
  inCorpus: number;
}

export interface PaperSubmitFile {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface SubmitPaperInput {
  title: string;
  doi: string;
  paperLink: string;
  abstractText: string;
  publicationYear: number;
  paperKind: PaperKind;
  authors: string[];
  keywords: string[];
  topics: string[];
  openAccessUrl?: string;
  pdf?: PaperSubmitFile;
}

function appendPaperFormData(formData: FormData, input: SubmitPaperInput) {
  formData.append("title", input.title.trim());
  formData.append("doi", input.doi.trim());
  formData.append("paperLink", input.paperLink.trim());
  formData.append("abstractText", input.abstractText.trim());
  formData.append("publicationYear", String(input.publicationYear));
  formData.append("paperKind", input.paperKind);
  formData.append(
    "authors",
    JSON.stringify(input.authors.map((displayName, index) => ({ displayName, position: index + 1, isCorresponding: index === 0 }))),
  );
  formData.append("keywords", JSON.stringify(input.keywords.map((keywordName) => ({ keywordName }))));
  formData.append("topics", JSON.stringify(input.topics.map((topicName) => ({ topicName }))));
  if (input.openAccessUrl?.trim()) formData.append("openAccessUrl", input.openAccessUrl.trim());
  if (input.pdf) {
    formData.append("pdf", {
      uri: input.pdf.uri,
      name: input.pdf.name,
      type: input.pdf.mimeType ?? "application/pdf",
    } as unknown as Blob);
  }
}

export const papersApi = {
  async list(params: PapersListParams) {
    const res = await api.get(API_ROUTES.papers.list, { params });
    return {
      papers: res.data.data as Paper[],
      meta: res.data.meta as {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      },
    };
  },
  async detail(id: string): Promise<Paper> {
    const res = await api.get(API_ROUTES.papers.detail(id));
    return res.data.data;
  },
  async references(id: string): Promise<PaperReferencesResult> {
    const res = await api.get(API_ROUTES.papers.references(id));
    return res.data.data;
  },
  async create(input: SubmitPaperInput): Promise<Paper> {
    const formData = new FormData();
    appendPaperFormData(formData, input);
    const res = await api.post(API_ROUTES.papers.create, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },
  async update(id: string, input: SubmitPaperInput): Promise<Paper> {
    const formData = new FormData();
    appendPaperFormData(formData, input);
    const res = await api.patch(API_ROUTES.papers.update(id), formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },
  async myRequests(): Promise<Paper[]> {
    const res = await api.get(API_ROUTES.papers.myRequests);
    return res.data.data;
  },
  async uploadPdf(id: string, file: PaperSubmitFile): Promise<Paper> {
    const formData = new FormData();
    formData.append("pdf", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/pdf",
    } as unknown as Blob);
    const res = await api.post(API_ROUTES.papers.uploadPdf(id), formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },
  async acceptPdf(id: string): Promise<Paper> {
    const res = await api.patch(API_ROUTES.papers.acceptPdf(id));
    return res.data.data;
  },
  async rejectPdf(id: string): Promise<Paper> {
    const res = await api.patch(API_ROUTES.papers.rejectPdf(id));
    return res.data.data;
  },
  async cancel(id: string): Promise<void> {
    await api.delete(API_ROUTES.papers.cancel(id));
  },
};
