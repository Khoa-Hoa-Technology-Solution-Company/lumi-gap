import axios, { AxiosError } from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api-client";

const auth = vi.hoisted(() => ({ id: "owner", clear: vi.fn(), setTokens: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: { getState: () => ({ user: { id: auth.id }, tokens: { accessToken: "access", refreshToken: "refresh" }, clear: auth.clear, setTokens: auth.setTokens }) } }));
beforeEach(() => { auth.id = "owner"; vi.restoreAllMocks(); });
it("never sends saved evidence under a different account's credentials", async () => {
  const adapter = vi.fn(); auth.id = "other-account";
  await expect(api.post("/academic-profiles/me/verification-evidence", {}, { expectedUserId: "owner", adapter })).rejects.toThrow("original account");
  expect(adapter).not.toHaveBeenCalled();
});
it("does not refresh or retry an old delivery if the account changed while the request was in flight", async () => {
  const refresh = vi.spyOn(axios, "post");
  const adapter = vi.fn(async config => {
    auth.id = "other-account";
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, { status: 401, statusText: "Unauthorized", headers: {}, config, data: {} });
  });
  await expect(api.post("/academic-profiles/me/verification-evidence", {}, { expectedUserId: "owner", adapter })).rejects.toThrow("Unauthorized");
  expect(adapter).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
});
