import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslatePaperBodySchema } from "../dto/translate-paper.schema.js";
import { getSupportedLanguages, translateText } from "../libretranslate.client.js";

describe("paper translation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes valid ISO target language codes", () => {
    expect(TranslatePaperBodySchema.parse({ targetLanguage: " VI " })).toEqual({
      targetLanguage: "vi",
    });
  });

  it("rejects language names and malformed codes", () => {
    expect(TranslatePaperBodySchema.safeParse({ targetLanguage: "Vietnamese" }).success).toBe(false);
    expect(TranslatePaperBodySchema.safeParse({ targetLanguage: "@@" }).success).toBe(false);
  });

  it("sends unknown source languages as auto and returns translated text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ translatedText: "Xin chao" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(translateText("Hello", "und", "vi")).resolves.toBe("Xin chao");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      q: "Hello",
      source: "auto",
      target: "vi",
      format: "text",
    });
  });

  it("does not call the provider for empty text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(translateText("", "en", "vi")).resolves.toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the provider language catalogue for the capabilities endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { code: "en", name: "English", targets: ["vi", "fr", "zh-Hans"] },
          { code: "vi", name: "Vietnamese", targets: ["en"] },
          { code: "bad", name: "Bad", targets: [] },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getSupportedLanguages()).resolves.toEqual(["en", "fr", "vi", "zh-hans"]);
  });
});
