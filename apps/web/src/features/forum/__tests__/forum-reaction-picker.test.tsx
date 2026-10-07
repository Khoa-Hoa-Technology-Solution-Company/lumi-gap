// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORUM_REACTIONS, ForumReactionPicker } from "../components/forum-reaction-picker";
import type { ForumReactionName } from "../api/forum.api";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const counts = Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, 0])) as Record<ForumReactionName, number>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const openPicker = async () => {
  const trigger = container.querySelector<HTMLButtonElement>('.forum-reaction-trigger')!;
  // Let the previous menu's deferred focus restoration finish before reopening.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return trigger;
};

describe("Forum emoji palette", () => {
  it("adds a heart immediately and keeps it when the palette is dismissed", async () => {
    const toggle = vi.fn();
    function HeartChoice() {
      const [choice, setChoice] = useState<ForumReactionName[]>([]);
      return <ForumReactionPicker counts={counts} viewerReactions={choice} isAuthed onToggle={(reaction, active) => { toggle(reaction, active); setChoice(active ? [reaction] : []); }} />;
    }
    await act(async () => root.render(<HeartChoice />));
    const trigger = await openPicker();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith("LIKE", true);
    expect(trigger.textContent).toContain("❤️");
    expect(document.querySelector('[role="menuitemradio"][aria-label="Like"]')?.getAttribute("aria-checked")).toBe("true");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("❤️");
    expect(toggle).toHaveBeenCalledTimes(1);
    await openPicker();
    expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => document.querySelector<HTMLElement>('[role="menuitemradio"][aria-label="Like"]')!.click());
    expect(toggle).toHaveBeenLastCalledWith("LIKE", false);
    expect(trigger.getAttribute("aria-label")).toBe("Add reaction");
  });

  it("replaces the automatic heart with the emoji selected in the same palette", async () => {
    const toggle = vi.fn();
    function HeartChoice() {
      const [choice, setChoice] = useState<ForumReactionName[]>([]);
      return <ForumReactionPicker counts={counts} viewerReactions={choice} isAuthed onToggle={(reaction, active) => { toggle(reaction, active); setChoice(active ? [reaction] : []); }} />;
    }
    await act(async () => root.render(<HeartChoice />));
    await openPicker();
    await act(async () => document.querySelector<HTMLElement>('[role="menuitemradio"][aria-label="Laugh"]')!.click());
    expect(toggle.mock.calls).toEqual([["LIKE", true], ["LAUGH", true]]);
    expect(container.querySelector('.forum-reaction-trigger')?.textContent).toContain("😂");
    expect(document.querySelector('[role="menu"][aria-label="Choose a reaction"]')).toBeNull();
  });

  it("opens a compact palette, exposes selected state, and toggles the exact reaction", async () => {
    const toggle = vi.fn();
    await act(async () => root.render(<ForumReactionPicker counts={counts} viewerReactions={["LOVE"]} isAuthed onToggle={toggle} />));
    const trigger = await openPicker();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const palette = document.querySelector('[role="menu"][aria-label="Choose a reaction"]')!;
    expect(palette.classList.contains("forum-reaction-popover")).toBe(true);
    expect(palette.querySelectorAll('[role="menuitemradio"]')).toHaveLength(10);
    expect(palette.textContent).toContain("Choose one reaction");
    const love = palette.querySelector<HTMLElement>('[aria-label="Love"]')!;
    expect(love.getAttribute("aria-checked")).toBe("true");
    await act(async () => love.click());
    expect(toggle).toHaveBeenCalledWith("LOVE", false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await openPicker();
    await act(async () => document.querySelector<HTMLElement>('[role="menuitemradio"][aria-label="Laugh"]')!.click());
    expect(toggle).toHaveBeenLastCalledWith("LAUGH", true);
  });

  it("replaces the selected reaction and reflects removal on the trigger", async () => {
    function SingleChoice() {
      const [choice, setChoice] = useState<ForumReactionName[]>(["LOVE"]);
      return <ForumReactionPicker counts={counts} viewerReactions={choice} isAuthed onToggle={(reaction, active) => setChoice(active ? [reaction] : [])} />;
    }
    await act(async () => root.render(<SingleChoice />));
    expect(container.querySelector('.forum-reaction-trigger')?.textContent).toContain("🥰");
    await openPicker();
    await act(async () => document.querySelector<HTMLElement>('[role="menuitemradio"][aria-label="Laugh"]')!.click());
    expect(container.querySelector('.forum-reaction-trigger')?.textContent).toContain("😂");
    await openPicker();
    const checked = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')];
    expect(checked).toHaveLength(1);
    expect(checked[0]?.getAttribute("aria-label")).toBe("Laugh");
    await act(async () => checked[0]!.click());
    expect(container.querySelector('.forum-reaction-trigger')?.getAttribute("aria-label")).toBe("Add reaction");
    expect(container.querySelector('.forum-selected-reaction')).toBeNull();
  });

  it("navigates the two rows spatially with arrows and closes with Escape", async () => {
    await act(async () => root.render(<ForumReactionPicker isAuthed onToggle={vi.fn()} />));
    const trigger = await openPicker();
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    await act(async () => {
      items[0]!.focus();
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).toBe(items[5]);
    await act(async () => items[5]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(items[6]);
    await act(async () => items[6]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it.each([
    { isAuthed: false, disabled: false, pending: false, note: "Sign in to react to this discussion." },
    { isAuthed: true, disabled: true, pending: false, note: "This discussion is read-only." },
    { isAuthed: true, disabled: false, pending: true, note: "Choose one reaction. Select it again to remove it." },
  ])("allows inspection but prevents mutation when $note", async ({ note, ...props }) => {
    const toggle = vi.fn();
    await act(async () => root.render(<ForumReactionPicker {...props} onToggle={toggle} />));
    const trigger = await openPicker();
    expect(trigger.disabled).toBe(false);
    expect(document.body.textContent).toContain(note);
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items).toHaveLength(10);
    expect(items.every((item) => item.getAttribute("aria-disabled") === "true")).toBe(true);
    await act(async () => items[0]!.click());
    expect(toggle).not.toHaveBeenCalled();
  });

  it("lets signed-out readers inspect existing reactors without enabling reactions", async () => {
    const toggle = vi.fn();
    await act(async () => root.render(<ForumReactionPicker counts={{ ...counts, LOVE: 2 }} reactionUsers={{ LOVE: [{ id: "a", fullName: "A. Researcher" }] }} isAuthed={false} onToggle={toggle} />));
    const chip = container.querySelector<HTMLButtonElement>('[aria-label="Love 2. Who reacted"]')!;
    expect(chip.disabled).toBe(false);
    await act(async () => chip.click());
    expect(document.body.textContent).toContain("A. Researcher");
    expect(document.body.textContent).toContain("more people reacted");
    expect(document.querySelector('[role="dialog"][aria-label="Who reacted"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Reaction filters"]')).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(toggle).not.toHaveBeenCalled();
  });
});
