import { beforeEach, expect, it, vi } from "vitest";
import { academicProfileApi } from "../api/academic-profile.api";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: mocks }));
const input = { type: "POSITION", evidenceType: "DOCUMENT", path: "MANUAL", institutionId: "institution", submissionKey: "submission-key", sources: [{ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: "https://university.edu/person" }] } as const;
const payload = { ...input, sources: [...input.sources] };
const receipt = { accepted: true, requestId: "request", submissionKey: input.submissionKey, status: "PENDING" };
beforeEach(() => { mocks.get.mockReset(); mocks.post.mockReset(); });
it("reconciles a lost response using the authenticated submission-key lookup", async () => {
  mocks.post.mockRejectedValue(new Error("Timeout")); mocks.get.mockResolvedValue({ data: { data: { submission: receipt } } });
  expect(await academicProfileApi.submitLecturerVerification(payload)).toEqual(receipt);
  expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining("verification-status"), expect.objectContaining({ params: { submissionKey: input.submissionKey } }));
});
it("never reports success when persistence cannot be confirmed", async () => {
  mocks.post.mockRejectedValue(new Error("Timeout")); mocks.get.mockResolvedValue({ data: { data: { submission: null } } });
  await expect(academicProfileApi.submitLecturerVerification(payload)).rejects.toThrow("Timeout");
});
it("does not treat validation or an idempotency mismatch as accepted", async () => {
  const error = { response: { status: 409 } }; mocks.post.mockRejectedValue(error);
  await expect(academicProfileApi.submitLecturerVerification(payload)).rejects.toBe(error); expect(mocks.get).not.toHaveBeenCalled();
});
it("reconciles a throttled retry without creating a second request", async () => {
  mocks.post.mockRejectedValue({ response: { status: 429 } }); mocks.get.mockResolvedValue({ data: { data: { submission: receipt } } });
  expect(await academicProfileApi.submitLecturerVerification(payload)).toEqual(receipt);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("does not claim a throttled request succeeded without an authoritative receipt", async () => {
  const error = { response: { status: 429 } }; mocks.post.mockRejectedValue(error); mocks.get.mockResolvedValue({ data: { data: { submission: null } } });
  await expect(academicProfileApi.submitLecturerVerification(payload)).rejects.toBe(error);
});
