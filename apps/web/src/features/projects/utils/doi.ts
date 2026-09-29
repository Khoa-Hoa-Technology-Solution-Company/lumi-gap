const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const DOI_HOSTS = new Set(["doi.org", "www.doi.org", "dx.doi.org"]);

export function normalizeDoi(value: string): string {
  let candidate = value.trim();
  if (!candidate) return "";

  if (/^(?:www\.)?doi\.org\//i.test(candidate)) candidate = `https://${candidate}`;

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (!DOI_HOSTS.has(url.hostname.toLowerCase())) return "";
      candidate = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      return "";
    }
  }

  candidate = candidate.replace(/^doi:\s*/i, "").trim();
  return candidate.toLowerCase();
}

export function isValidDoi(value: string): boolean {
  return DOI_PATTERN.test(normalizeDoi(value));
}

export function matchesExactDoi(paperDoi: string | undefined, query: string): boolean {
  const normalizedQuery = normalizeDoi(query);
  return DOI_PATTERN.test(normalizedQuery) && normalizeDoi(paperDoi ?? "") === normalizedQuery;
}
