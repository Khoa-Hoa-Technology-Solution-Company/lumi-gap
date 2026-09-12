export { papersApi, type PaperReferencesResult, type PaperSubmitFile, type PapersListParams, type SubmitPaperInput } from "./api/papers.api";
export {
  useAcceptPaperPdf,
  useCancelPaperRequest,
  useCreatePaper,
  useInfinitePapers,
  useMyPapers,
  usePaper,
  usePaperReferences,
  usePapers,
  useRejectPaperPdf,
  useUpdatePaper,
  useUploadPaperPdf,
} from "./hooks/use-papers";
