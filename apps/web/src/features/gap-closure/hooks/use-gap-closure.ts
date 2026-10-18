import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCalibrationQuestionRequest,
  CreateClosureCalibrationRequest,
  CreateCoverageCheckRequest,
  DecideGapClosureRequest,
  ReviewClosureDocumentRequest,
  StartGapClosureCheckRequest,
} from "@trend/shared-types";
import { downloadBlob, gapClosureApi } from "../api/gap-closure.api";
import { isClosureCheckRunning } from "../closure-format";

const POLL_CHECK_MS = 3000;
const POLL_CALIBRATION_MS = 5000;

export const closureKeys = {
  all: ["gap-closure"] as const,
  gapChecks: (gapId: string | undefined) => ["gap-closure", "gap-checks", gapId] as const,
  check: (checkId: string | undefined) => ["gap-closure", "check", checkId] as const,
  dossier: (checkId: string | undefined) => ["gap-closure", "dossier", checkId] as const,
  coverage: (params?: { topic?: string; projectId?: string }) => ["gap-closure", "coverage", params ?? {}] as const,
  calibrations: ["gap-closure", "calibrations"] as const,
  calibration: (id: string | undefined) => ["gap-closure", "calibration", id] as const,
};

/** Checks of one gap, newest first, without documents. */
export function useGapClosureChecks(gapId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: closureKeys.gapChecks(gapId),
    queryFn: () => gapClosureApi.listChecks(gapId!),
    enabled: Boolean(gapId) && enabled,
  });
}

/** One check with documents. Polled every 3 s while the runner is QUEUED or SEARCHING. */
export function useGapClosureCheck(checkId: string | undefined) {
  return useQuery({
    queryKey: closureKeys.check(checkId),
    queryFn: () => gapClosureApi.getCheck(checkId!),
    enabled: Boolean(checkId),
    refetchInterval: (query) => (isClosureCheckRunning(query.state.data?.status) ? POLL_CHECK_MS : false),
  });
}

/** Dossier JSON: coverage, calibration, plain-language arithmetic and inter-rater kappa. Fetched once a check is decided. */
export function useClosureDossier(checkId: string | undefined, enabled: boolean, version?: string) {
  return useQuery({
    queryKey: [...closureKeys.dossier(checkId), version ?? null],
    queryFn: () => gapClosureApi.dossierJson(checkId!),
    enabled: Boolean(checkId) && enabled,
  });
}

export function useStartGapClosureCheck(gapId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StartGapClosureCheckRequest) => gapClosureApi.startCheck(gapId, payload),
    onSuccess: (check) => {
      queryClient.setQueryData(closureKeys.check(check.id), check);
      void queryClient.invalidateQueries({ queryKey: closureKeys.gapChecks(gapId) });
      void queryClient.invalidateQueries({ queryKey: ["gaps"] });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useReviewClosureDocument(checkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, payload }: { documentId: string; payload: ReviewClosureDocumentRequest }) =>
      gapClosureApi.reviewDocument(checkId, documentId, payload),
    onSuccess: () => {
      // A deciding label on a decided check moves it back to SCREENING and resets the gap's closure status.
      void queryClient.invalidateQueries({ queryKey: closureKeys.check(checkId) });
      void queryClient.invalidateQueries({ queryKey: closureKeys.dossier(checkId) });
      void queryClient.invalidateQueries({ queryKey: ["gap-closure", "gap-checks"] });
      void queryClient.invalidateQueries({ queryKey: ["gaps"] });
    },
  });
}

export function useDecideGapClosure(checkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DecideGapClosureRequest) => gapClosureApi.decide(checkId, payload),
    onSuccess: (check) => {
      queryClient.setQueryData(closureKeys.check(checkId), check);
      void queryClient.invalidateQueries({ queryKey: closureKeys.dossier(checkId) });
      void queryClient.invalidateQueries({ queryKey: closureKeys.gapChecks(check.targetId) });
      void queryClient.invalidateQueries({ queryKey: ["gaps"] });
      void queryClient.invalidateQueries({ queryKey: ["gaps", check.targetId, "evidence-records"] });
    },
  });
}

/** Downloads the dossier as a file: Markdown (server-rendered) or JSON. */
export function useDownloadClosureDossier(checkId: string) {
  return useMutation({
    mutationFn: async (format: "markdown" | "json") => {
      if (format === "markdown") {
        const dossier = await gapClosureApi.dossierMarkdown(checkId);
        downloadBlob(dossier.markdown, dossier.filename || `gap-closure-${checkId}.md`, "text/markdown;charset=utf-8");
        return;
      }
      const dossier = await gapClosureApi.dossierJson(checkId);
      downloadBlob(JSON.stringify(dossier, null, 2), `gap-closure-${checkId}.json`, "application/json;charset=utf-8");
    },
  });
}

export function useCoverageChecks(params?: { topic?: string; projectId?: string }, enabled = true) {
  return useQuery({
    queryKey: closureKeys.coverage(params),
    queryFn: () => gapClosureApi.listCoverageChecks(params),
    enabled,
  });
}

export function useCreateCoverageCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCoverageCheckRequest) => gapClosureApi.createCoverageCheck(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gap-closure", "coverage"] }),
  });
}

export function useClosureCalibrations() {
  return useQuery({ queryKey: closureKeys.calibrations, queryFn: () => gapClosureApi.listCalibrations() });
}

/** One calibration with questions. Polled every 5 s while RUNNING so results appear as the checks finish. */
export function useClosureCalibration(id: string | undefined) {
  return useQuery({
    queryKey: closureKeys.calibration(id),
    queryFn: () => gapClosureApi.getCalibration(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? POLL_CALIBRATION_MS : false),
  });
}

function useInvalidateCalibration(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: closureKeys.calibration(id) });
    void queryClient.invalidateQueries({ queryKey: closureKeys.calibrations });
  };
}

export function useCreateClosureCalibration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClosureCalibrationRequest) => gapClosureApi.createCalibration(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: closureKeys.calibrations }),
  });
}

export function useAddCalibrationQuestion(id: string) {
  const invalidate = useInvalidateCalibration(id);
  return useMutation({
    mutationFn: (payload: CreateCalibrationQuestionRequest) => gapClosureApi.addCalibrationQuestion(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteCalibrationQuestion(id: string) {
  const invalidate = useInvalidateCalibration(id);
  return useMutation({
    mutationFn: (questionId: string) => gapClosureApi.deleteCalibrationQuestion(id, questionId),
    onSuccess: invalidate,
  });
}

export function useRunCalibration(id: string) {
  const invalidate = useInvalidateCalibration(id);
  return useMutation({ mutationFn: () => gapClosureApi.runCalibration(id), onSuccess: invalidate });
}

export function useComputeCalibration(id: string) {
  const invalidate = useInvalidateCalibration(id);
  return useMutation({ mutationFn: () => gapClosureApi.computeCalibration(id), onSuccess: invalidate });
}
