// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicIdentityLink, AcademicProfile } from "@trend/shared-types";
import { AcademicIdentityManager } from "../components/academic-identity-manager";

const mocks = vi.hoisted(() => ({ links: [] as AcademicIdentityLink[], create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/use-academic-profile", () => ({
  useAcademicIdentityLinks: () => ({ data: mocks.links, isLoading: false, isError: false }),
  useCreateAcademicIdentity: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateAcademicIdentity: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteAcademicIdentity: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

let root: Root;
let container: HTMLDivElement;
const identity: AcademicIdentityLink = {
  id: "identity", provider: "ORCID", identifier: "0000-0002-1825-0097",
  visibility: "PUBLIC", connectionMethod: "OAUTH", status: "CONNECTED", verificationStatus: "PROVIDER_CONNECTED",
  createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z",
};
const profile = { academicIdentityLinks: [] } as unknown as AcademicProfile;
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === label)!;
async function click(label: string) { await act(async () => button(label).click()); }
async function choose(provider: string) {
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>("#academic-identity-provider")!;
    select.value = provider;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function mount(editable = true) { await act(async () => root.render(<AcademicIdentityManager profile={profile} editable={editable} />)); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.links = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("Academic identity disclosure and ownership semantics", () => {
  it("starts with ORCID without exposing other provider fields or pretending OAuth is available", async () => {
    await mount(); await click("Add academic identity");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Connect ORCID to link your scholarly identifier with LumiGap.");
    expect(button("Connect ORCID").disabled).toBe(true);
    expect(dialog.querySelectorAll("input, select")).toHaveLength(0);
    expect(dialog.textContent).not.toContain("Google Scholar");
    expect(dialog.textContent).toContain("Add another academic profile");
  });

  it("requires a service selection and reveals just that provider's fields", async () => {
    await mount(); await click("Add academic identity"); await click("Add another academic profile");
    expect(document.querySelectorAll('[role="dialog"] input')).toHaveLength(0);
    expect(document.querySelector("#academic-identity-visibility")).toBeNull();
    expect(button("Add profile").disabled).toBe(true);
    const options = document.querySelector<HTMLSelectElement>("#academic-identity-provider")!.options;
    expect(Array.from(options).map((option) => option.text)).toEqual(["Choose a service", "Google Scholar", "Semantic Scholar", "OpenAlex", "Other"]);
    for (const provider of ["GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR", "OPENALEX", "OTHER"]) {
      await choose(provider);
      expect(document.querySelectorAll('[role="dialog"] input')).toHaveLength(provider === "OTHER" ? 2 : 1);
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("This profile is self-declared.");
      expect(document.querySelector("#academic-identity-visibility")).not.toBeNull();
    }
  });

  it("does not label manually entered or system linked ORCID as connected", async () => {
    mocks.links = [{ ...identity, status: "LINKED", connectionMethod: "MANUAL", verificationStatus: "UNVERIFIED" }];
    await mount();
    expect(container.textContent).toContain("Self-declared");
    expect(container.textContent).not.toContain("Connected");
    expect(container.textContent).not.toContain("Verified Researcher");
    await click("Add academic identity");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(identity.identifier);
    expect(button("Connect ORCID")).toBeUndefined();
  });

  it("changes only visibility for a connected ORCID and requires confirmation to disconnect", async () => {
    mocks.links = [identity];
    await mount();
    expect(container.textContent).toContain("Connected");
    expect(container.querySelector('a[href="https://orcid.org/0000-0002-1825-0097"]')).not.toBeNull();
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>("#identity-visibility-identity")!;
      select.value = "PRIVATE"; select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.update).toHaveBeenCalledWith({ identityId: identity.id, input: { visibility: "PRIVATE" } });
    await click("Disconnect");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Disconnect ORCID from LumiGap?");
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((item) => item.textContent === "Disconnect").at(-1)!;
    await act(async () => confirm.click());
    expect(mocks.remove).toHaveBeenCalledWith(identity.id);
  });

  it("shows no editing or disconnect controls to a public viewer", async () => {
    await act(async () => root.render(<AcademicIdentityManager profile={{ ...profile, academicIdentityLinks: [identity] }} editable={false} />));
    expect(button("Disconnect")).toBeUndefined();
    expect(button("Add academic identity")).toBeUndefined();
    expect(container.querySelector("select")).toBeNull();
  });
});
