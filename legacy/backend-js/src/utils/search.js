const MAX_SEARCH_LENGTH = 100;

export function escapeRegexSearch(value) {
  return String(value || '')
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
