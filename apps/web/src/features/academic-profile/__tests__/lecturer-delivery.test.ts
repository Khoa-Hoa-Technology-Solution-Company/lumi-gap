// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { beforeEach, expect, it, vi } from "vitest";
import { deliverLecturerEvidence } from "../services/lecturer-delivery";
import { lecturerDeliveryStore as store, type LecturerDelivery } from "../services/lecturer-delivery-store";

let userId: string;
const api = { upload: vi.fn(), submit: vi.fn(), reconcile: vi.fn() };
const receipt = (id: string) => ({ accepted: true as const, requestId: "request", submissionKey: id, status: "PENDING" as const, submittedAt: "2026-10-09T00:00:00Z" });
function draft(): LecturerDelivery {
  const id = crypto.randomUUID();
  return { userId, id, institutionName: "University", state: "QUEUED", uploads: {}, input: { type: "POSITION", evidenceType: "DOCUMENT", institutionId: "institution", path: "MANUAL", submissionKey: id },
    sources: [{ id: "source", type: "STAFF_ID", sourceKind: "DOCUMENT", reference: "", customEvidenceName: "", additionalExplanation: "Issued by the university", file: new NodeFile(["private image bytes"], "staff.png", { type: "image/png" }) as unknown as File }] };
}
beforeEach(() => {
  userId = crypto.randomUUID();
  api.upload.mockReset().mockResolvedValue({ uploadId: "upload", expiresAt: new Date(Date.now() + 300_000).toISOString() });
  api.submit.mockReset().mockImplementation(async input => receipt(input.submissionKey));
  api.reconcile.mockReset().mockResolvedValue(null);
});
it("commits files before processing, then releases local private files only after server acknowledgement", async () => {
  const job = draft(); await store.enqueue(job);
  const saved = await store.read(userId);
  expect(await saved!.sources[0]!.file!.text()).toBe("private image bytes");
  let acknowledge!: (value: unknown) => void;
  api.submit.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  const sending = deliverLecturerEvidence(userId, store, api, () => true);
  await vi.waitFor(() => expect(api.submit).toHaveBeenCalledTimes(1));
  expect((await store.read(userId))!.state).toBe("SENDING");
  expect((await store.read(userId))!.sources[0]!.file).toBeDefined();
  acknowledge(receipt(job.id)); await sending;
  const delivered = await store.read(userId);
  expect(delivered!.state).toBe("SENT"); expect(delivered!.receipt?.requestId).toBe("request");
  expect(delivered!.sources[0]!.file).toBeUndefined(); expect(delivered!.payload).toBeUndefined();
});
it("preserves files after an upload failure and successfully retries", async () => {
  await store.enqueue(draft()); api.upload.mockRejectedValueOnce(new Error("Offline"));
  await deliverLecturerEvidence(userId, store, api, () => true);
  const failed = await store.read(userId);
  expect(failed!.state).toBe("FAILED"); expect(failed!.sources[0]!.file).toBeDefined(); expect(api.submit).not.toHaveBeenCalled();
  await store.update(userId, job => ({ ...job, state: "QUEUED" }));
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect((await store.read(userId))!.state).toBe("SENT");
});
it("reconciles a committed request after reload without uploading or submitting again", async () => {
  const job = draft(); await store.enqueue(job); api.submit.mockRejectedValueOnce(new Error("Response lost"));
  await deliverLecturerEvidence(userId, store, api, () => true);
  const uncertain = await store.read(userId);
  expect(uncertain!.state).toBe("UNCERTAIN"); expect(uncertain!.payload?.submissionKey).toBe(job.id);
  await store.update(userId, job => ({ ...job, state: "QUEUED" }));
  api.reconcile.mockResolvedValueOnce(receipt(job.id));
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect(api.submit).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
  expect((await store.read(userId))!.state).toBe("SENT");
});
it("replays the identical payload and idempotency key after timeout or throttling", async () => {
  await store.enqueue(draft()); api.submit.mockRejectedValueOnce(new Error("Timeout")).mockRejectedValueOnce({ response: { status: 429 } });
  await deliverLecturerEvidence(userId, store, api, () => true);
  const original = api.submit.mock.calls[0]![0];
  for (let attempt = 0; attempt < 2; attempt++) {
    await store.update(userId, job => ({ ...job, state: "QUEUED" }));
    await deliverLecturerEvidence(userId, store, api, () => true);
  }
  expect(api.submit.mock.calls.map(call => call[0])).toEqual([original, original, original]);
  expect(api.upload).toHaveBeenCalledTimes(1); expect((await store.read(userId))!.state).toBe("SENT");
});
it("never claims success without the matching durable acknowledgement", async () => {
  await store.enqueue(draft()); api.submit.mockResolvedValueOnce({ ...receipt("another-key"), accepted: true });
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect((await store.read(userId))!.state).toBe("UNCERTAIN"); expect((await store.read(userId))!.sources[0]!.file).toBeDefined();
});
it("prevents another tab or click from starting a duplicate delivery", async () => {
  const job = draft(); await store.enqueue(job);
  await expect(store.enqueue({ ...job, id: "second" })).rejects.toThrow("already saved");
  let upload!: (value: unknown) => void;
  api.upload.mockImplementationOnce(() => new Promise(resolve => { upload = resolve; }));
  const first = deliverLecturerEvidence(userId, store, api, () => true);
  await vi.waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect(api.upload).toHaveBeenCalledTimes(1);
  upload({ uploadId: "upload", expiresAt: new Date(Date.now() + 300_000).toISOString() }); await first;
  expect(api.submit).toHaveBeenCalledTimes(1);
});
it("pauses on account switching and resumes only for the original owner", async () => {
  await store.enqueue(draft()); let signedIn = true;
  api.upload.mockImplementationOnce(async () => { signedIn = false; return { uploadId: "old-upload", expiresAt: new Date(Date.now() + 300_000).toISOString() }; });
  await deliverLecturerEvidence(userId, store, api, () => signedIn);
  expect(api.submit).not.toHaveBeenCalled(); expect((await store.read(userId))!.state).toBe("QUEUED");
  expect(await store.read("other-account")).toBeUndefined();
  signedIn = true; await deliverLecturerEvidence(userId, store, api, () => signedIn);
  expect((await store.read(userId))!.state).toBe("SENT");
});
it("resumes a saved upload after an abandoned tab lease expires", async () => {
  const job = draft(); job.state = "UPLOADING"; job.lease = { owner: "closed-tab", until: Date.now() - 1 };
  job.uploads.source = { uploadId: "saved-upload", expiresAt: new Date(Date.now() + 300_000).toISOString() };
  await store.enqueue(job); await deliverLecturerEvidence(userId, store, api, () => true);
  expect(api.upload).not.toHaveBeenCalled();
  expect(api.submit.mock.calls[0]![0].sources[0].uploadId).toBe("saved-upload");
});
it("reuploads an expired staged file after a definitive server rejection", async () => {
  await store.enqueue(draft()); api.submit.mockRejectedValueOnce({ response: { status: 400, data: { error: { message: "This document upload is unavailable or expired. Upload it again." } } } });
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect((await store.read(userId))!.payload).toBeUndefined();
  await store.update(userId, job => ({ ...job, state: "QUEUED" }));
  await deliverLecturerEvidence(userId, store, api, () => true);
  expect(api.upload).toHaveBeenCalledTimes(2); expect((await store.read(userId))!.state).toBe("SENT");
});
