// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LecturerEvidenceEntry, newEvidenceDraft, evidenceDraftIssue } from "../components/lecturer-evidence-entry";
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../components/private-evidence-pdf-preview", () => ({ default: () => <div>Private PDF preview</div> }));
let container: HTMLDivElement, root: Root;
function Harness() {
  const [value, setValue] = useState(newEvidenceDraft("source-1"));
  return <><LecturerEvidenceEntry value={value} index={0} disabled={false} removable={false} onChange={setValue} onRemove={() => undefined} /><button disabled={Boolean(evidenceDraftIssue(value))}>Submit</button></>;
}
beforeEach(async () => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(<Harness />)); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function select(type: string) { const element = container.querySelector("select")!; await act(async () => { element.value = type; element.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function input(selector: string, value: string) { const element = container.querySelector(selector) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
const submit = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Submit")!;
describe("dynamic Lecturer evidence inputs", () => {
  it("previews the selected image and revokes its private URL when closed", async () => {
    const create = vi.fn(() => "blob:private-preview"), revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    await select("STAFF_ID");
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["image"], "staff.png", { type: "image/png" });
    await act(async () => { Object.defineProperty(fileInput, "files", { value: [file] }); fileInput.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Preview evidence")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("img")!.getAttribute("src")).toBe("blob:private-preview");
    expect(dialog.textContent).toContain("staff.png"); expect(create).toHaveBeenCalledWith(file);
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Close")!.click());
    expect(revoke).toHaveBeenCalledWith("blob:private-preview");
  });
  it("previews PDF evidence using the private reader before submission", async () => {
    await select("APPOINTMENT_DOCUMENT");
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { Object.defineProperty(fileInput, "files", { value: [new File(["%PDF-1.4"], "appointment.pdf", { type: "application/pdf" })] }); fileInput.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Preview evidence")!.click());
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Private PDF preview");
    expect(document.querySelector('[role="dialog"] iframe')).toBeNull();
  });
  it("shows only a URL for a faculty profile and only upload for appointment or staff card", async () => {
    expect(container.querySelector('input[type="url"]')).not.toBeNull(); expect(container.querySelector('input[type="file"]')).toBeNull();
    for (const type of ["INSTITUTION_ISSUED_PROFILE", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID"]) {
      await select(type);
      expect(container.querySelector('input[type="url"]')).toBeNull();
      expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.accept).toContain("image/png");
      expect(submit().disabled).toBe(true);
    }
  });
  it("requires a custom description, supports URL or document and preserves a URL when switching", async () => {
    await select("OTHER_INSTITUTION_SOURCE");
    expect(container.querySelector('#lecturer-primary-evidence-name')).not.toBeNull();
    await input('input[type="url"]', "https://university.edu/teaching");
    expect(submit().disabled).toBe(true);
    await input('#lecturer-primary-evidence-name', "Department teaching confirmation");
    expect(submit().disabled).toBe(false);
    await act(async () => container.querySelector<HTMLInputElement>('input[value="DOCUMENT"]')!.click());
    expect(container.querySelector('input[type="url"]')).toBeNull();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { Object.defineProperty(file, "files", { value: [new File(["image"], "staff.png", { type: "image/png" })] }); file.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(submit().disabled).toBe(false);
    await act(async () => container.querySelector<HTMLInputElement>('input[value="URL"]')!.click());
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe("https://university.edu/teaching");
    expect(submit().disabled).toBe(false);
  });
  it("rejects invalid or empty documents and unsafe URL schemes", async () => {
    await input('input[type="url"]', "http://localhost/evidence"); expect(submit().disabled).toBe(true);
    await select("STAFF_ID");
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { Object.defineProperty(file, "files", { value: [new File(["html"], "id.html", { type: "text/html" })] }); file.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Choose a PDF, JPEG or PNG");
    expect(submit().disabled).toBe(true);
  });
});
