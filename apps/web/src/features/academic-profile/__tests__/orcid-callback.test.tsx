// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrcidCallbackPage } from "@/pages/orcid-callback";

const mocks = vi.hoisted(() => ({
  completeOrcid: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});
vi.mock("../hooks/use-academic-profile", () => ({
  useCompleteOrcidConnection: () => ({
    mutateAsync: mocks.completeOrcid,
    isPending: false,
  }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
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

describe("OrcidCallbackPage", () => {
  it("strips code and state from URL immediately, completes OAuth exchange, and navigates to /profile?orcid=connected", async () => {
    window.history.replaceState({}, "", "/integrations/orcid/callback?code=auth-code-123&state=state-xyz-12345678901234567890");
    mocks.completeOrcid.mockResolvedValueOnce({
      returnTo: "/profile",
      link: {
        id: "id-1",
        provider: "ORCID",
        identifier: "0000-0002-1825-0097",
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
        visibility: "PUBLIC",
      },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <OrcidCallbackPage />
        </MemoryRouter>,
      );
    });

    expect(window.location.search).toBe("");
    expect(mocks.completeOrcid).toHaveBeenCalledWith({
      code: "auth-code-123",
      state: "state-xyz-12345678901234567890",
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/profile?orcid=connected", { replace: true });
  });

  it("displays cancellation message when error=access_denied is returned", async () => {
    window.history.replaceState({}, "", "/integrations/orcid/callback?error=access_denied&state=state-xyz-12345678901234567890");
    mocks.completeOrcid.mockRejectedValueOnce(new Error("Cancelled"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <OrcidCallbackPage />
        </MemoryRouter>,
      );
    });

    expect(window.location.search).toBe("");
    expect(container.textContent).toContain("ORCID authorization was cancelled.");
  });
});

