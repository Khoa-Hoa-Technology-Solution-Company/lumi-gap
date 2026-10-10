import type { LecturerVerificationSubmission, LecturerVerificationSubmitInput } from "@trend/shared-types";
import { academicProfileApi } from "../api/academic-profile.api";
import { lecturerVerificationError } from "../utils/lecturer-verification-form";
import { evidenceDraftIssue } from "../components/lecturer-evidence-entry";
import { lecturerDeliveryStore, type DeliveryStore, type LecturerDelivery } from "./lecturer-delivery-store";

type DeliveryApi = {
  upload: (file: File, institutionId: string, progress: (value: number) => void) => Promise<{ uploadId: string; expiresAt: string }>;
  submit: (input: LecturerVerificationSubmitInput) => Promise<LecturerVerificationSubmission>;
  reconcile: (key: string) => Promise<LecturerVerificationSubmission | null>;
};
export const activeDelivery = (job?: LecturerDelivery) => Boolean(job && ["QUEUED", "UPLOADING", "SENDING"].includes(job.state));

export async function enqueueLecturerDelivery(job: LecturerDelivery) {
  if (!job.sources.length || job.sources.length > 6 || job.sources.some(evidenceDraftIssue)) throw new Error("Provide complete evidence for each entry.");
  await lecturerDeliveryStore.enqueue(job);
}

/** Independent of the form's lifetime; files and the exact submitted payload survive reloads. */
export async function deliverLecturerEvidence(userId: string, store: DeliveryStore, api: DeliveryApi, authorized: () => boolean) {
  const owner = crypto.randomUUID();
  let job = await store.update(userId, current => {
    if (!activeDelivery(current) || current.lease && current.lease.until > Date.now()) return current;
    return { ...current, lease: { owner, until: Date.now() + 120_000 } };
  });
  if (!job || job.lease?.owner !== owner) return;
  let leaseLost = false;
  async function save(change: Partial<LecturerDelivery>) {
    const next = await store.update(userId, current => {
      if (current.id !== job!.id || current.lease?.owner !== owner) { leaseLost = true; return current; }
      return { ...current, ...change, lease: { owner, until: Date.now() + 120_000 } };
    });
    if (leaseLost || !next) throw new Error("Delivery ownership changed.");
    job = next;
  }
  const heartbeat = setInterval(() => { void save({}).catch(() => { leaseLost = true; }); }, 30_000);
  function guard() { if (leaseLost || !authorized()) throw new Error("Delivery paused until you sign in again."); }
  try {
    guard();
    // A lost response may have been committed by the server. Check before replay or reupload.
    if (job.payload) {
      const receipt = await api.reconcile(job.id);
      if (receipt?.accepted && receipt.requestId && receipt.submissionKey === job.id) return await complete(receipt);
      guard();
    }
    if (!job.payload) {
      await save({ state: "UPLOADING", error: undefined, progress: 0 });
      const sources: LecturerVerificationSubmitInput["sources"] = [];
      for (let index = 0; index < job.sources.length; index++) {
        guard();
        const source = job.sources[index]!;
        let staged = job.uploads[source.id];
        if (source.sourceKind === "DOCUMENT" && !source.retainedSourceId) {
          if (!staged || Date.parse(staged.expiresAt) <= Date.now() + 60_000) {
            if (!source.file) throw new Error("Choose an evidence document.");
            staged = await api.upload(source.file, job.input.institutionId, progress => {
              void save({ progress: Math.round((index + progress / 100) / job!.sources.length * 100) }).catch(() => { leaseLost = true; });
            });
            guard();
            await save({ uploads: { ...job.uploads, [source.id]: staged } });
          }
        }
        sources.push({ type: source.type, sourceKind: source.sourceKind,
          ...(source.type === "OTHER_INSTITUTION_SOURCE" ? { customEvidenceName: source.customEvidenceName.trim() } : {}),
          additionalExplanation: source.additionalExplanation.trim() || undefined,
          ...(source.sourceKind === "URL" ? { reference: source.reference.trim() } : source.retainedSourceId ? { retainedSourceId: source.retainedSourceId } : { uploadId: staged!.uploadId }),
        });
      }
      await save({ payload: { ...job.input, sources }, state: "SENDING", progress: 100 });
    } else await save({ state: "SENDING", error: undefined });
    guard();
    const receipt = await api.submit(job.payload!);
    if (!receipt?.accepted || !receipt.requestId || receipt.submissionKey !== job.id) throw new Error("Missing durable acknowledgement");
    return await complete(receipt);
  } catch (error) {
    if (leaseLost) return;
    const status = (error as { response?: { status?: number } }).response?.status;
    const uncertain = Boolean(job.payload && (!status || status >= 500 || status === 429));
    const expired = !uncertain && lecturerVerificationError(error, "", "evidence").includes("expired");
    await save({ state: authorized() ? uncertain ? "UNCERTAIN" : "FAILED" : "QUEUED",
      error: uncertain ? "Submission is not confirmed. Retry to check the same request; your draft is preserved." : lecturerVerificationError(error, "Could not submit the verification request. Please try again.", "evidence"),
      ...(expired ? { payload: undefined, uploads: {} } : {}),
    });
  } finally {
    clearInterval(heartbeat);
    await store.update(userId, current => current.lease?.owner === owner ? { ...current, lease: undefined } : current);
  }
  async function complete(receipt: LecturerVerificationSubmission) {
    // Keep the receipt, release private local files only after durable acknowledgement.
    await save({ state: "SENT", receipt, error: undefined, payload: undefined, uploads: {}, sources: job!.sources.map(({ file: _file, ...source }) => source) });
    return receipt;
  }
}

const running = new Set<string>();
export async function runLecturerDelivery(userId: string, authorized: () => boolean) {
  if (running.has(userId)) return;
  running.add(userId);
  try {
    return await deliverLecturerEvidence(userId, lecturerDeliveryStore, {
      upload: (file, institutionId, progress) => academicProfileApi.stageLecturerEvidence(file, institutionId, progress, userId),
      submit: input => academicProfileApi.submitLecturerVerification(input, userId),
      reconcile: async key => (await academicProfileApi.verificationStatus(key, userId)).submission,
    }, authorized);
  } finally { running.delete(userId); }
}
