import type { ForumPostType } from "@trend/shared-types";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAGS = /<\s*\/?\s*[a-z][^>]*>/gi;
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;

export function cleanForumText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "").replace(HTML_TAGS, "").trim();
}

export function isValidForumDoi(value: string): boolean {
  return DOI_PATTERN.test(value.trim());
}

export function isAllowedForumUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function normalizeForumTag(value: string): { name: string; slug: string } | null {
  const name = cleanForumText(value).replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 80);
  if (!name) return null;
  const slug = name.normalize("NFKD").toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug ? { name, slug } : null;
}

export function normalizeForumTags(values: string[]): Array<{ name: string; slug: string }> {
  const unique = new Map<string, { name: string; slug: string }>();
  for (const value of values) {
    const tag = normalizeForumTag(value);
    if (tag && !unique.has(tag.slug)) unique.set(tag.slug, tag);
  }
  return [...unique.values()];
}

export function normalizeForumPostType(value: string | undefined): ForumPostType {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "QUESTION" || normalized === "PAPER_DISCUSSION" || normalized === "RESEARCH_GAP_DISCUSSION") return normalized;
  return "DISCUSSION";
}

export function canExposeForumProject(visibility: string): boolean {
  return visibility === "PUBLIC_SUMMARY";
}

export function canExposeForumGap(forumShareable: boolean): boolean {
  return forumShareable;
}

export function canShowAcademicIdentity(profileVisibility: string | null | undefined, viewerIsSignedIn: boolean, isOwner: boolean): boolean {
  if (isOwner || profileVisibility === "PUBLIC") return true;
  return profileVisibility === "MEMBERS" && viewerIsSignedIn;
}
