export function combineAcademicBio(
  headline?: string | null,
  biography?: string | null,
  legacyBio?: string | null,
): string {
  const summary = headline?.trim() ?? "";
  const body = biography?.trim() || legacyBio?.trim() || "";

  if (!summary || summary === body) return body || summary;
  if (!body) return summary;
  if (body.split(/\r?\n/u, 1)[0]?.trim() === summary) return body;
  return `${summary}\n\n${body}`;
}
