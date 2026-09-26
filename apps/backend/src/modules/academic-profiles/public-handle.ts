const RESERVED_HANDLES = new Set([
  "about", "academics", "admin", "api", "app", "auth", "blog", "bookmarks",
  "communities", "community", "contact", "dashboard", "explore", "forum", "help",
  "home", "lecturers", "legal", "login", "logout", "my-papers", "notifications",
  "lumigap", "onboarding", "paperlens", "papers", "profile", "projects", "rankings", "register",
  "reports", "research", "research-gaps", "search", "settings", "signup", "support",
  "team", "trends", "u", "users", "verify", "www",
]);

export function normalizePublicHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPublicHandle(value: string): boolean {
  return value.length >= 3
    && value.length <= 40
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    && !RESERVED_HANDLES.has(value);
}

/** Resolve grandfathered dotted handles without allowing users to create new ones. */
export function isValidResolvablePublicHandle(value: string): boolean {
  return isValidPublicHandle(value)
    || value.length >= 3
      && value.length <= 40
      && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)
      && !RESERVED_HANDLES.has(value);
}
