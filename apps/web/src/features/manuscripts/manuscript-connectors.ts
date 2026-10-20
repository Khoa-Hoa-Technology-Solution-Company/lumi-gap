/** Direct provider calls: credentials never pass through LumiGap or persistent storage. */
async function bounded(response: Response, limit: number) {
  if (!response.ok || !response.body) throw new Error(response.status === 401 || response.status === 403 ? "PROVIDER_PERMISSION" : response.status === 409 ? "PROVIDER_CONFLICT" : "PROVIDER_ERROR");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > limit) { await reader.cancel(); throw new Error("PROVIDER_LIMIT"); } chunks.push(item.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
const options = (signal: AbortSignal): RequestInit => ({ signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
const escapeBib = (text: string) => text.replace(/[\\{}%$&#_^~]/g, char => ({ "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$", "&": "\\&", "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}" })[char]!);
export function mendeleyBib(records: unknown): string {
  if (!Array.isArray(records) || records.length > 100) throw new Error("PROVIDER_FORMAT");
  const field = (value: unknown) => typeof value === "string" && value.length <= 5000 ? escapeBib(value) : "";
  return records.map((record: unknown) => {
    if (!record || typeof record !== "object") throw new Error("PROVIDER_FORMAT");
    const row = record as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id) || !field(row.title)) throw new Error("PROVIDER_FORMAT");
    const authors = Array.isArray(row.authors) ? row.authors.slice(0, 100).map(author => author && typeof author === "object" ? [field(author.last_name), field(author.first_name)].filter(Boolean).join(", ") : "").filter(Boolean).join(" and ") : "";
    const identifiers = row.identifiers && typeof row.identifiers === "object" ? row.identifiers as Record<string, unknown> : {};
    const fields = [`  title = {${field(row.title)}}`, ...(authors ? [`  author = {${authors}}`] : []), ...(typeof row.year === "number" && Number.isInteger(row.year) && row.year > 0 && row.year < 10000 ? [`  year = {${row.year}}`] : []), ...(field(identifiers.doi) ? [`  doi = {${field(identifiers.doi)}}`] : []), ...(field(row.source) ? [`  journal = {${field(row.source)}}`] : [])];
    return `@misc{mendeley_${row.id.replaceAll("-", "")},\n${fields.join(",\n")}\n}`;
  }).join("\n\n");
}
export async function fetchBibliography(provider: "ZOTERO" | "MENDELEY", token: string, library: string, group: boolean, page: number, signal: AbortSignal, next?: string) {
  if (!Number.isInteger(page) || page < 0 || page > 1000) throw new Error("PROVIDER_PAGE");
  let url: string;
  if (provider === "ZOTERO") {
    if (!/^[1-9][0-9]{0,14}$/.test(library)) throw new Error("PROVIDER_LIBRARY");
    url = `https://api.zotero.org/${group ? "groups" : "users"}/${library}/items/top?format=bibtex&limit=100&start=${page * 100}`;
  } else {
    if (!token) throw new Error("PROVIDER_PERMISSION");
    url = "https://api.mendeley.com/documents?view=bib&limit=100";
    if (next) { const parsed = new URL(next); if (parsed.origin !== "https://api.mendeley.com" || parsed.pathname !== "/documents" || parsed.username || parsed.password || parsed.hash || [...parsed.searchParams.keys()].some(key => !["view", "limit", "marker", "reverse"].includes(key))) throw new Error("PROVIDER_URL"); url = parsed.href; }
  }
  const response = await fetch(url, { ...options(signal), headers: provider === "ZOTERO" ? { "Zotero-API-Version": "3", ...(token ? { "Zotero-API-Key": token } : {}) } : { Authorization: `Bearer ${token}`, Accept: "application/vnd.mendeley-document.1+json" } });
  const link = response.headers.get("Link")?.match(/<([^>]+)>;\s*rel="?next"?/)?.[1];
  const bytes = await bounded(response, 500_000), text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const content = provider === "ZOTERO" ? text : mendeleyBib(JSON.parse(text));
  if (new TextEncoder().encode(content).length > 480_000 || !/@[a-zA-Z]+\s*[{(]/.test(content)) throw new Error("PROVIDER_EMPTY");
  return { content: `% Imported from ${provider === "ZOTERO" ? "Zotero" : "Mendeley"}. Library metadata; source claims require independent review.\n${content}\n`, next: link };
}
function dropboxPath(path: string) {
  if (path.length > 240 || !/^\/(?:[A-Za-z0-9][A-Za-z0-9._ ()-]*\/)*[A-Za-z0-9][A-Za-z0-9._ ()-]*\.zip$/.test(path)) throw new Error("PROVIDER_PATH");
}
const headerArg = (value: unknown) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
export async function downloadDropbox(token: string, path: string, signal: AbortSignal) {
  dropboxPath(path); if (!token) throw new Error("PROVIDER_PERMISSION");
  const response = await fetch("https://content.dropboxapi.com/2/files/download", { ...options(signal), method: "POST", headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": headerArg({ path }) } });
  return new Blob([await bounded(response, 10_000_000)], { type: "application/zip" });
}
export async function inspectDropbox(token: string, path: string, signal: AbortSignal): Promise<string | null> {
  dropboxPath(path); if (!token) throw new Error("PROVIDER_PERMISSION");
  const response = await fetch("https://api.dropboxapi.com/2/files/get_metadata", { ...options(signal), method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
  if (response.status === 409) { const error = new TextDecoder().decode(await bounded(new Response(response.body, { status: 200 }), 10000)); if (error.includes('"not_found"')) return null; throw new Error("PROVIDER_ERROR"); }
  const meta = JSON.parse(new TextDecoder().decode(await bounded(response, 10000)));
  if (meta[".tag"] !== "file" || typeof meta.rev !== "string" || !/^[a-zA-Z0-9]{1,80}$/.test(meta.rev)) throw new Error("PROVIDER_FORMAT"); return meta.rev;
}
export async function uploadDropbox(token: string, path: string, revision: string | null, source: Blob, signal: AbortSignal) {
  dropboxPath(path); if (!token || source.size > 10_000_000 || revision !== null && !/^[a-zA-Z0-9]{1,80}$/.test(revision)) throw new Error("PROVIDER_INPUT");
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", { ...options(signal), method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "Dropbox-API-Arg": headerArg({ path, mode: revision === null ? "add" : { ".tag": "update", update: revision }, autorename: false, strict_conflict: true, mute: false }) }, body: source });
  await bounded(response, 10000);
}
