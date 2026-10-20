import { expect, it, vi } from "vitest";
import { resolveWritingCitations } from "../ai-citations";

const source = { id: "paper", title: "Project source", authors: [], year: 2024, doi: null, citationKey: "Study2024", bibtex: "" };

it("resolves citation collisions including commands with whitespace and optional arguments", async () => {
  const insert = vi.fn().mockResolvedValue({ key: "Study2024_2" });
  const text = "Evidence \\Citep* [see] [p. 2] {Study2024,manual}. Also \\cite{Study2024}.";
  expect(await resolveWritingCitations(text, [source], [source], insert)).toBe("Evidence \\Citep* [see] [p. 2] {Study2024_2,manual}. Also \\cite{Study2024_2}.");
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith("paper");
});

it("rejects removed project sources before adding any bibliography entries", async () => {
  const insert = vi.fn();
  const removed = { ...source, id: "removed", citationKey: "Removed2025" };
  await expect(resolveWritingCitations("\\cite{Study2024,Removed2025}", [source, removed], [source], insert)).rejects.toThrow("Project reference changed");
  expect(insert).not.toHaveBeenCalled();
});

it("retains existing manual bibliography keys without creating invented references", async () => {
  const insert = vi.fn();
  expect(await resolveWritingCitations("\\cite {manual_key}", [], [], insert)).toBe("\\cite {manual_key}");
  expect(insert).not.toHaveBeenCalled();
});
