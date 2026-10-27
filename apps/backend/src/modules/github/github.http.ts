import { AppError } from "../../common/exceptions/app-error.js";

export class GithubHttpError extends Error {
  constructor(readonly status: number, readonly rateLimited: boolean) { super("GitHub request failed"); }
}
/** Only this module supplies origins. Redirects, response size and duration are bounded. */
export async function githubJson(url: string, init: RequestInit, limit = 10_000_000): Promise<unknown> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["api.github.com", "github.com"].includes(parsed.hostname) || parsed.port || parsed.username || parsed.password) throw AppError.badRequest("Invalid GitHub destination");
  try {
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json", "User-Agent": "LumiGap", ...init.headers } });
    if (!response.ok) throw new GithubHttpError(response.status, response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0");
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) { await reader.cancel(); throw new Error(); } chunks.push(next.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof GithubHttpError) throw error;
    throw AppError.serviceUnavailable("GitHub is unavailable; retry without changing your manuscript");
  }
}
