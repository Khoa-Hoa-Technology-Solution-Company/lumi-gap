// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KeywordTagInput,
  mergeKeywordTerms,
  normalizeKeywordTerm,
  splitKeywordTerms,
} from "../components/keyword-tag-input";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ language: "en", t: (key: string) => key }),
}));

let root: Root;
let container: HTMLDivElement;

function Harness({ initial = [], onFormSubmit }: { initial?: string[]; onFormSubmit?: () => void }) {
  const [values, setValues] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onFormSubmit?.();
      }}
    >
      <KeywordTagInput
        id="kw-input"
        label="Research keywords"
        values={values}
        draftInput={draft}
        onChange={setValues}
        onDraftInputChange={setDraft}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </form>
  );
}

async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("KeywordTagInput & keyword parsing helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("normalizes and splits multiline/delimited text while preserving internal multiword spaces", () => {
    expect(normalizeKeywordTerm("  Large   Language   Models  ")).toBe("Large Language Models");
    expect(splitKeywordTerms("LLM\nLiterature Review\r\nResearch Gap; Discovery, Academic Research")).toEqual([
      "LLM",
      "Literature Review",
      "Research Gap",
      "Discovery",
      "Academic Research",
    ]);
  });

  it("rejects oversized keywords without silent truncation and enforces max 10 with case-insensitive dedupe", () => {
    const oversized = "A".repeat(81);
    const res1 = mergeKeywordTerms(["LLM"], ["llm", "Large Language Models", oversized]);
    expect(res1.next).toEqual(["LLM", "Large Language Models"]);
    expect(res1.error).toContain("80 characters");

    const ten = Array.from({ length: 10 }, (_, i) => `Keyword ${i + 1}`);
    const res2 = mergeKeywordTerms(ten, ["Keyword 11"]);
    expect(res2.next).toHaveLength(10);
    expect(res2.error).toContain("up to 10");
  });

  it("splits multiline clipboard paste into distinct tags without concatenating words", async () => {
    await act(async () => root.render(<Harness />));
    const input = container.querySelector<HTMLInputElement>("#kw-input")!;
    await act(async () => {
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: { getData: () => "LLM\nLiterature Review\nResearch Gap" },
      });
      input.dispatchEvent(pasteEvent);
    });

    expect(JSON.parse(container.querySelector('[data-testid="values"]')!.textContent!)).toEqual([
      "LLM",
      "Literature Review",
      "Research Gap",
    ]);
    expect(container.textContent).toContain("3/10");
  });

  it("commits keyword on Enter without submitting the parent form, supports comma split and chip removal", async () => {
    const onSubmit = vi.fn();
    await act(async () => root.render(<Harness onFormSubmit={onSubmit} />));
    const input = container.querySelector<HTMLInputElement>("#kw-input")!;

    await fill("#kw-input", "Large Language Models");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.parse(container.querySelector('[data-testid="values"]')!.textContent!)).toEqual([
      "Large Language Models",
    ]);

    await fill("#kw-input", "Systematic Review, Meta Analysis,");
    expect(JSON.parse(container.querySelector('[data-testid="values"]')!.textContent!)).toEqual([
      "Large Language Models",
      "Systematic Review",
      "Meta Analysis",
    ]);

    const removeBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Systematic Review"]')!;
    await act(async () => removeBtn.click());
    expect(JSON.parse(container.querySelector('[data-testid="values"]')!.textContent!)).toEqual([
      "Large Language Models",
      "Meta Analysis",
    ]);
  });
});
