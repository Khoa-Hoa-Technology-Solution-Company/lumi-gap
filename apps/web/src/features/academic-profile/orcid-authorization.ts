export const orcidPendingKey = "lumigap.orcid.pending";
export function rememberOrcidAuthorization(result: { authorizationUrl: string; state: string }, userId: string) {
  const url = new URL(result.authorizationUrl);
  if (!["https://orcid.org", "https://sandbox.orcid.org"].includes(url.origin) || url.pathname !== "/oauth/authorize" || url.username || url.password || url.searchParams.get("state") !== result.state || !/^[A-Za-z0-9_-]{43}$/.test(result.state)) throw new Error("Invalid ORCID authorization destination");
  sessionStorage.setItem(orcidPendingKey, JSON.stringify({ state: result.state, userId, createdAt: Date.now() }));
}

export function redirectToOrcidAuthorization(result: { authorizationUrl: string; state: string }, userId: string) {
  rememberOrcidAuthorization(result, userId);
  window.location.assign(result.authorizationUrl);
}
