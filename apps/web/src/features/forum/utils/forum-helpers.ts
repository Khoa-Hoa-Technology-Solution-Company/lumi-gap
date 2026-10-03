/**
 * Estimates reading time based on 200 words per minute.
 */
export function calculateReadingTime(text: string): string {
  if (!text) return "1 min read";
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

/**
 * Strips basic markdown syntax for a clean plain-text excerpt preview.
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/^#+\s+/gm, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/_([^_]+)_/g, "$1") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/```[\s\S]*?```/g, "") // code blocks
    .replace(/>\s+/gm, "") // blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/[-*+]\s+/gm, "") // bullet points
    .replace(/\n+/g, " ") // newlines
    .trim();
}

/**
 * Format relative time in a localized and human-friendly way.
 */
export function formatForumRelativeTime(value: string, locale: string): string {
  try {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "";
    const seconds = Math.round((time - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 30) return formatter.format(days, "day");
    return new Date(value).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Compact forum activity time that never wraps into a localized sentence. */
export function formatForumNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Shared K/M/B suffixes; only the decimal separator follows the locale. */
export function formatForumCompactNumber(value: number, locale: string): string {
  if (value < 1000) return formatForumNumber(value, locale);
  const units = [{ divisor: 1e9, suffix: "B" }, { divisor: 1e6, suffix: "M" }, { divisor: 1e3, suffix: "K" }] as const;
  const unit = units.find(({ divisor }) => value >= divisor * 0.99995) ?? units[2];
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / unit.divisor) + unit.suffix;
}

export function formatForumActivityTime(value: string, locale: string): string {
  try {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "";
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (elapsedSeconds < 60) return `${Math.max(1, elapsedSeconds)}s`;
    const minutes = Math.round(elapsedSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** Stable human-readable thread URL with UUID fallback for legacy API responses.
 * Numeric post locators follow Discourse's `/topic-slug/post-number` format.
 * A string locator is retained for old hash links during the migration. */
export function forumPostHref(post: { id: string; publicSlug?: string }, postNumberOrHash?: number | string): string {
  const base = `/forum/${encodeURIComponent(post.publicSlug || post.id)}`;
  if (typeof postNumberOrHash === "number" || (typeof postNumberOrHash === "string" && /^\d+$/.test(postNumberOrHash))) return `${base}/${postNumberOrHash}`;
  if (postNumberOrHash) return `${base}#${postNumberOrHash.replace(/^#/, "")}`;
  return base;
}

export function forumPostNumberHref(post: { id: string; publicSlug?: string }, postNumber: number): string {
  return forumPostHref(post, postNumber);
}
