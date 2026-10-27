// @vitest-environment jsdom
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthTokens, User } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "../api-client";

function signIn(id = "first") {
  useAuthStore.getState().setAuth({ user: { id, systemRole: "USER" } as User,
    tokens: { accessToken: `${id}-access`, refreshToken: `${id}-refresh` } as AuthTokens });
}
function unauthorized(config: InternalAxiosRequestConfig): never {
  throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined,
    { status: 401, statusText: "Unauthorized", headers: {}, config, data: {} });
}
function ok(config: InternalAxiosRequestConfig) {
  return { status: 200, statusText: "OK", headers: {}, config, data: "done" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const rotated = { accessToken: "rotated-access", refreshToken: "rotated-refresh" } as AuthTokens;
beforeEach(() => signIn());
afterEach(() => { vi.restoreAllMocks(); useAuthStore.getState().clear(); });

it.each(["logout", "switch account", "sign in again"])("ignores a delayed successful refresh after %s", async action => {
  const response = deferred<Awaited<ReturnType<typeof axios.post>>>();
  const refresh = vi.spyOn(axios, "post").mockReturnValue(response.promise);
  const adapter = vi.fn(async config => unauthorized(config));
  const request = api.get("/credits/balance", { adapter }).catch(error => error);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  if (action === "logout") useAuthStore.getState().clear();
  else signIn(action === "switch account" ? "second" : "first");
  const expected = useAuthStore.getState().tokens;
  response.resolve({ data: { data: rotated } } as Awaited<ReturnType<typeof axios.post>>);
  expect(await request).toBeInstanceOf(AxiosError);
  expect(useAuthStore.getState().tokens).toEqual(expected);
  expect(adapter).toHaveBeenCalledOnce();
});

it("does not clear a new session when an old refresh fails", async () => {
  const response = deferred<Awaited<ReturnType<typeof axios.post>>>();
  const refresh = vi.spyOn(axios, "post").mockReturnValue(response.promise);
  const request = api.get("/credits/balance", { adapter: async config => unauthorized(config) }).catch(error => error);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  signIn("second");
  response.reject(new Error("expired refresh"));
  await request;
  expect(useAuthStore.getState().user?.id).toBe("second");
});

it("does not refresh or clear the current session for a late 401 from the previous account", async () => {
  const refresh = vi.spyOn(axios, "post");
  await expect(api.get("/credits/balance", { adapter: async config => {
    signIn("second");
    return unauthorized(config);
  } })).rejects.toThrow("Unauthorized");
  expect(refresh).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe("second");
});

it("shares one token refresh across concurrent requests in the same session", async () => {
  const response = deferred<Awaited<ReturnType<typeof axios.post>>>();
  const refresh = vi.spyOn(axios, "post").mockReturnValue(response.promise);
  const adapter = vi.fn(async config => config.headers.Authorization === "Bearer rotated-access" ? ok(config) : unauthorized(config));
  const requests = [api.get("/credits/balance", { adapter }), api.get("/credits/summary", { adapter })];
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  response.resolve({ data: { data: rotated } } as Awaited<ReturnType<typeof axios.post>>);
  expect((await Promise.all(requests)).map(result => result.data)).toEqual(["done", "done"]);
  expect(refresh).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().tokens).toEqual(rotated);
});

it("retries a late 401 with tokens already rotated in the same session", async () => {
  const refresh = vi.spyOn(axios, "post");
  const adapter = vi.fn(async config => {
    if (config.headers.Authorization === "Bearer rotated-access") return ok(config);
    useAuthStore.getState().setTokens(rotated);
    return unauthorized(config);
  });
  expect((await api.get("/credits/balance", { adapter })).data).toBe("done");
  expect(refresh).not.toHaveBeenCalled();
});

it("lets a new session refresh independently while an old refresh is pending", async () => {
  const oldResponse = deferred<Awaited<ReturnType<typeof axios.post>>>();
  const refresh = vi.spyOn(axios, "post").mockReturnValueOnce(oldResponse.promise)
    .mockResolvedValueOnce({ data: { data: rotated } });
  const oldRequest = api.get("/credits/balance", { adapter: async config => unauthorized(config) }).catch(error => error);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  signIn("second");
  const adapter = vi.fn(async config => config._retry ? ok(config) : unauthorized(config));
  expect((await api.get("/credits/summary", { adapter })).data).toBe("done");
  oldResponse.resolve({ data: { data: { accessToken: "old", refreshToken: "old" } } } as Awaited<ReturnType<typeof axios.post>>);
  await oldRequest;
  expect(useAuthStore.getState().tokens).toEqual(rotated);
  expect(refresh).toHaveBeenCalledTimes(2);
});
