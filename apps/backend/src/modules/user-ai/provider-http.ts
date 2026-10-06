import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";

export function normalizeAiBaseUrl(value: string, provider: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw AppError.badRequest("Enter a valid AI Base URL"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw AppError.badRequest("AI Base URL must be HTTP(S), without credentials, query parameters or fragments");
  }
  let result = url.toString().replace(/\/+$/, "");
  if (provider === "gemini") result = result.replace(/\/v1(?:beta)?$/, "");
  else if (url.pathname === "/") result += "/v1";
  return result;
}

// Public HTTPS endpoints are allowed; private gateways are an explicit server option.
export function isLocalAiAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(ip) !== 6) return false;
  if (ip.startsWith("::ffff:")) {
    const tail = ip.slice(7);
    if (isIP(tail) === 4) return isLocalAiAddress(tail);
    const parts = tail.split(":");
    if (parts.length !== 2) return false;
    const high = Number.parseInt(parts[0]!, 16), low = Number.parseInt(parts[1]!, 16);
    return isLocalAiAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return ip === "::1" || /^f[cd]/.test(ip);
}

export function resolveAiEndpointUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (env.AI_LOCALHOST_HOST && (hostname === "localhost" || hostname === "localhost." ||
      hostname === "0.0.0.0" || hostname === "::" || hostname === "::1" ||
      isIP(hostname) === 4 && hostname.startsWith("127."))) {
    url.hostname = env.AI_LOCALHOST_HOST;
  }
  return url;
}

export function isPublicAiAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) || a === 198 || (a === 203 && b === 0));
  }
  // Allow globally routable IPv6 only, excluding mapped addresses and documentation ranges.
  return isIP(ip) === 6 && /^[23]/.test(ip) && !ip.startsWith("2001:db8") && !ip.startsWith("2002:");
}

export class AiProviderHttpError extends AppError {
  readonly nonRetryable: boolean;
  constructor(public readonly status: number, public readonly retryDelayMs?: number) {
    super(status === 429 ? 429 : 503, "AI_PROVIDER_ERROR",
      status === 401 || status === 403 ? "The AI provider rejected this API key. Check the key and Base URL." :
      status === 404 ? "The AI endpoint or model was not found. Check the Base URL and fetch models again." :
      status === 429 ? "The AI provider rate limit or quota was exceeded. Retry later or choose another connection." :
      `The AI provider is unavailable (HTTP ${status}). Retry later or choose another connection.`);
    this.nonRetryable = status === 429 && retryDelayMs === undefined;
  }
}

export async function providerJson(urlValue: string, apiKey: string, provider: string, body?: unknown): Promise<any> {
  const originalUrl = new URL(urlValue);
  const url = resolveAiEndpointUrl(urlValue);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const trusted = (env.AI_ALLOWED_BASE_URLS ?? "").split(",").some((origin) => origin.trim() === url.origin || origin.trim() === originalUrl.origin);
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true }).catch(() => {
    throw AppError.badRequest("The AI Base URL hostname could not be resolved");
  });
  const local = env.AI_ALLOW_LOCAL_ENDPOINTS && addresses.length > 0 && addresses.every((item) => isLocalAiAddress(item.address));
  if (url.protocol !== "https:" && !trusted && !local) throw AppError.badRequest("Use HTTPS for public AI endpoints. Local HTTP gateways require AI_ALLOW_LOCAL_ENDPOINTS=true in the server .env.");
  if (!addresses.length || (!trusted && !local && addresses.some((item) => !isPublicAiAddress(item.address)))) {
    throw AppError.badRequest("This AI endpoint is on a private or reserved network. Ask the platform administrator to allow its origin.");
  }
  const pinned = addresses[0]!;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(url, {
      method: payload ? "POST" : "GET",
      headers: { accept: "application/json", ...(payload ? { "content-type": "application/json" } : {}),
        ...(apiKey ? provider === "gemini" ? { "x-goog-api-key": apiKey } : { authorization: `Bearer ${apiKey}` } : {}) },
      // Pin the validated DNS address so a second lookup cannot redirect credentials into a private network.
      lookup: (_host, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, [pinned] as never);
        else callback(null, pinned.address, pinned.family);
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) req.destroy(new Error("response too large"));
        else chunks.push(chunk);
      });
      res.on("error", () => reject(AppError.serviceUnavailable("AI provider response was interrupted")));
      res.on("end", () => {
        const status = res.statusCode ?? 502;
        // Never follow redirects with a user's credential, or return provider error bodies containing secrets.
        if (status < 200 || status >= 300) {
          let retryDelayMs: number | undefined;
          if (status === 429) {
            try {
              const details = JSON.parse(Buffer.concat(chunks).toString("utf8")).error?.details ?? [];
              const violations = details.flatMap((detail: { violations?: Array<{ quotaId?: string; quotaValue?: string }> }) => detail.violations ?? []);
              const exhausted = violations.some((item: { quotaId?: string; quotaValue?: string }) => /PerDay|Daily|PerMonth/i.test(item.quotaId ?? "") || item.quotaValue === "0");
              const seconds = Number.parseFloat(details.find((detail: { retryDelay?: string }) => detail.retryDelay)?.retryDelay ?? String(res.headers["retry-after"] ?? ""));
              if (!exhausted && Number.isFinite(seconds) && seconds >= 0 && seconds < 60) retryDelayMs = Math.ceil(seconds * 1000) + 1000;
            } catch { /* Unknown quota errors must not burn repeated requests. */ }
          }
          return reject(new AiProviderHttpError(status, retryDelayMs));
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(AppError.serviceUnavailable("AI provider returned an invalid JSON response")); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error("request timed out")), body ? 60000 : 20000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(AppError.serviceUnavailable("Could not connect to the AI provider. Check the Base URL or try again later.")));
    req.end(payload);
  });
}
