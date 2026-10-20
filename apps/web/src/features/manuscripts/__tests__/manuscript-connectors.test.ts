import { afterEach, expect, it, vi } from "vitest";
import { fetchBibliography, mendeleyBib, downloadDropbox, inspectDropbox, uploadDropbox } from "../manuscript-connectors";
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
it("fetches Zotero exports from a fixed origin with a private header, never a URL credential", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("@article{verified_key, title={Actual library title}}")); vi.stubGlobal("fetch", fetcher);
  const result = await fetchBibliography("ZOTERO", "private-key", "12345", true, 2, signal());
  expect(result.content).toContain("verified_key"); expect(result.content).toContain("Library metadata");
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://api.zotero.org/groups/12345/items/top?format=bibtex&limit=100&start=200"); expect(url).not.toContain("private-key");
  expect(options.headers["Zotero-API-Key"]).toBe("private-key"); expect(options.redirect).toBe("error"); expect(options.credentials).toBe("omit");
  await expect(fetchBibliography("ZOTERO", "key", "../bad", false, 0, signal())).rejects.toThrow("PROVIDER_LIBRARY"); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("converts only supplied Mendeley fields and rejects untrusted pagination origins", async () => {
  expect(mendeleyBib([{ id: "abc-123", title: "A & B {test}", authors: [{ first_name: "Minh", last_name: "Nguyen" }], identifiers: { doi: "10.1234/source" }, year: 2024 }])).toContain("A \\& B \\{test\\}");
  expect(mendeleyBib([{ id: "abc", title: "Only supplied title" }])).not.toContain("doi");
  vi.stubGlobal("fetch", vi.fn());
  await expect(fetchBibliography("MENDELEY", "key", "", false, 0, signal(), "https://evil.example/documents")).rejects.toThrow("PROVIDER_URL"); expect(fetch).not.toHaveBeenCalled();
});
it("keeps Dropbox revisions conditional and refuses unsafe paths or failed downloads", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ".tag": "file", rev: "abcd1234" })).mockResolvedValueOnce(Response.json({ rev: "next" })); vi.stubGlobal("fetch", fetcher);
  expect(await inspectDropbox("private", "/Team/source.zip", signal())).toBe("abcd1234");
  await uploadDropbox("private", "/Team/source.zip", "abcd1234", new Blob(["zip"]), signal());
  const [url, request] = fetcher.mock.calls[1]!;
  expect(url).toBe("https://content.dropboxapi.com/2/files/upload"); expect(request.redirect).toBe("error");
  expect(JSON.parse(request.headers["Dropbox-API-Arg"])).toMatchObject({ mode: { ".tag": "update", update: "abcd1234" }, strict_conflict: true, autorename: false });
  await expect(downloadDropbox("private", "/../source.zip", signal())).rejects.toThrow("PROVIDER_PATH"); expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValueOnce(new Response("conflict", { status: 409 }));
  await expect(uploadDropbox("private", "/Team/source.zip", "abcd1234", new Blob(["zip"]), signal())).rejects.toThrow("PROVIDER_CONFLICT");
});
it("rejects oversized bibliography responses before importing data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(500001))));
  await expect(fetchBibliography("ZOTERO", "", "123", false, 0, signal())).rejects.toThrow("PROVIDER_LIMIT");
});
