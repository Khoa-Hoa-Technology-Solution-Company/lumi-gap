const AUTH_RETURN_TO_KEY = "lumigap.auth.returnTo";

export function safeInternalReturnTo(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  const [pathname = ""] = value.split(/[?#]/, 1);
  if (["/login", "/register", "/auth/oauth-callback"].includes(pathname)) return undefined;
  return value;
}

export function storeAuthReturnTo(value: string | null | undefined) {
  const safe = safeInternalReturnTo(value);
  if (!safe) return;
  window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, safe);
}

export function consumeAuthReturnTo(): string | undefined {
  const safe = safeInternalReturnTo(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY));
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return safe;
}
