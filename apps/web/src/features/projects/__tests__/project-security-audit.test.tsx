// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject, ProjectAuditEventsPage, ProjectSecurityOverview, ResearchIntegrityCaseView } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSecurityPanel } from "../components/project-security-panel";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  securityOverview: vi.fn(),
  auditEvents: vi.fn(),
  integrityCases: vi.fn(),
  escalateIntegrityCase: vi.fn(),
  resolveIntegrityCase: vi.fn(),
}));

vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, params?: Record<string, unknown>) => {
  if (!params) return key;
  return Object.entries(params).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v)), key);
} }) }));
vi.mock("../hooks/use-projects", () => ({
  useUpdateProject: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock("../api/projects.api", () => ({
  projectsApi: {
    securityOverview: mocks.securityOverview,
    auditEvents: mocks.auditEvents,
    integrityCases: mocks.integrityCases,
    createIntegrityCase: vi.fn(),
    containLeakIncident: vi.fn(),
    escalateIntegrityCase: mocks.escalateIntegrityCase,
    resolveIntegrityCase: mocks.resolveIntegrityCase,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseProject: IProject = {
  _id: "proj-1",
  title: "LumiGap",
  visibility: "PRIVATE",
  status: "ACTIVE",
  ownerId: "owner-1",
  accessRole: "OWNER",
  version: 5,
  exportPolicy: "ALL_MEMBERS",
  aiDataPolicy: "ALLOW_PERSONAL_AI",
  externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
  memberCount: 2,
  paperCount: 5,
  members: [],
  papers: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-20T00:00:00Z",
};

const overviewResponse: ProjectSecurityOverview = {
  projectId: "proj-1",
  visibility: "PRIVATE",
  exportPolicy: "ALL_MEMBERS",
  aiDataPolicy: "ALLOW_PERSONAL_AI",
  externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
  canManage: true,
  canExportSource: true,
  activeMemberCount: 2,
  formerMemberCount: 0,
  activeMentorCount: 1,
  totalEventCount: 139,
  latestEventAt: "2026-11-22T15:22:13.000Z",
  recentEvents: [],
};

const auditPageResponse: ProjectAuditEventsPage = {
  items: [
    {
      id: "evt-pdf-1",
      type: "MANUSCRIPT_PDF_DOWNLOADED",
      category: "ACCESS_EXPORT",
      actor: { id: "owner-1", name: "Nguyen Dinh Thanh" },
      entityKind: "MANUSCRIPT_COMPILATION",
      entityId: "comp-123",
      artifactVersion: 2,
      checksumSha256: "b".repeat(64),
      reason: null,
      visibility: "PROJECT_TEAM",
      createdAt: "2026-11-22T15:22:13.000Z",
      summary: "Manuscript pdf downloaded",
      metadata: { byteSize: 70450, manuscriptId: "ms-1" },
    },
    {
      id: "evt-own-2",
      type: "OWNERSHIP_TRANSFERRED",
      category: "MEMBERSHIP",
      actor: { id: "owner-1", name: "Nguyen Dinh Thanh" },
      entityKind: "PROJECT",
      entityId: "proj-1",
      artifactVersion: null,
      checksumSha256: null,
      reason: "Team handover",
      visibility: "PROJECT_TEAM",
      createdAt: "2026-11-18T13:58:36.000Z",
      summary: "Ownership transferred",
      metadata: {},
    },
  ],
  meta: { page: 1, pageSize: 20, total: 25, totalPages: 2, hasNext: true },
};

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
  });
}

async function renderPanel(project = baseProject) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectSecurityPanel project={project} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await flush();
}

describe("ProjectSecurityPanel & ProjectAuditHistoryDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    mocks.securityOverview.mockResolvedValue(overviewResponse);
    mocks.auditEvents.mockResolvedValue(auditPageResponse);
    mocks.integrityCases.mockResolvedValue([]);
    mocks.update.mockImplementation(async (patch: Partial<IProject>) => ({ ...baseProject, ...patch, version: 6 }));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps Advanced settings collapsed by default and loads only lightweight audit summary on mount", async () => {
    await renderPanel();

    const details = container.querySelector<HTMLDetailsElement>("details");
    expect(details?.open).toBe(false);
    expect(mocks.securityOverview).toHaveBeenCalledWith("proj-1", { limit: 0 });
    expect(mocks.auditEvents).not.toHaveBeenCalled();
    expect(container.textContent).toContain("139 recorded events");
    expect(container.textContent).not.toContain("MANUSCRIPT_PDF_DOWNLOADED");
    expect(container.textContent).not.toContain("b".repeat(64));
  });

  it("saves scoped advanced policy changes for owner and disables controls for members and archived projects", async () => {
    await renderPanel();

    const aiSelect = container.querySelector<HTMLSelectElement>("#sec-ai-policy")!;
    await act(async () => {
      aiSelect.value = "PLATFORM_AI_ONLY";
      aiSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Advanced settings"]')!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.update).toHaveBeenCalledWith({ aiDataPolicy: "PLATFORM_AI_ONLY", expectedVersion: 5 });

    await renderPanel({ ...baseProject, accessRole: "MEMBER", ownerId: "other-owner" });
    expect(container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
    expect(container.querySelector('form[aria-label="Advanced settings"] button[type="submit"]')).toBeNull();

    await renderPanel({ ...baseProject, status: "ARCHIVED" });
    expect(container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
  });

  it("lazily opens Audit History with human-readable labels, filters, pagination, and Event Detail", async () => {
    await renderPanel();

    const viewBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("View history"))!;
    await act(async () => viewBtn.click());
    await flush();

    expect(mocks.auditEvents).toHaveBeenCalledWith("proj-1", { page: 1, pageSize: 20 });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Downloaded manuscript PDF");
    expect(dialog.textContent).toContain("Transferred project ownership");
    expect(dialog.textContent).not.toContain("MANUSCRIPT_PDF_DOWNLOADED");
    expect(dialog.textContent).not.toContain("b".repeat(64));

    // Filter by category
    const categorySelect = dialog.querySelector<HTMLSelectElement>('select[aria-label="Event category"]')!;
    await act(async () => {
      categorySelect.value = "MEMBERSHIP";
      categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(mocks.auditEvents).toHaveBeenLastCalledWith("proj-1", { page: 1, pageSize: 20, category: "MEMBERSHIP" });

    // Open event detail to verify raw event code, Event ID, and SHA-256 checksum
    const firstRow = dialog.querySelector<HTMLButtonElement>('[data-testid="audit-event-row"]')!;
    await act(async () => firstRow.click());
    expect(dialog.textContent).toContain("Audit event details");
    expect(dialog.textContent).toContain("MANUSCRIPT_PDF_DOWNLOADED");
    expect(dialog.textContent).toContain("evt-pdf-1");
    expect(dialog.textContent).toContain("b".repeat(64));
  });

  it("supports escalating and resolving an integrity case through dialogs instead of dead buttons or window.prompt", async () => {
    const sampleCase: ResearchIntegrityCaseView = {
      id: "case-1",
      projectId: "proj-1",
      kind: "DATA_LEAK_INCIDENT",
      status: "REPORTED",
      reporter: { id: "member-1", name: "Member" },
      respondent: null,
      targetKind: "PROJECT",
      targetId: null,
      title: "Suspicious export",
      description: "Observed unauthorized copy",
      evidenceRefs: [],
      preservedSnapshot: null,
      containmentActions: [],
      escalatedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null,
      events: [],
      viewerCanRespond: true,
      viewerCanContain: true,
      viewerCanEscalate: true,
      viewerCanResolve: true,
      ownerAdjudicationBlocked: false,
      createdAt: "2026-11-22T10:00:00Z",
      updatedAt: "2026-11-22T10:00:00Z",
    };
    mocks.integrityCases.mockResolvedValue([sampleCase]);
    mocks.escalateIntegrityCase.mockResolvedValue({ ...sampleCase, status: "ESCALATED" });
    mocks.resolveIntegrityCase.mockResolvedValue({ ...sampleCase, status: "RESOLVED" });

    await renderPanel();

    const escalateBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Escalate to institutional review"))!;
    await act(async () => escalateBtn.click());
    const escalateInput = document.querySelector<HTMLTextAreaElement>("#escalate-reason-input")!;
    expect(escalateInput).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(escalateInput, "Requires faculty office review");
      escalateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const confirmEscalate = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Confirm escalation")!;
    await act(async () => confirmEscalate.click());
    expect(mocks.escalateIntegrityCase).toHaveBeenCalledWith("proj-1", "case-1", "Requires faculty office review");

    const resolveBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Resolve case"))!;
    await act(async () => resolveBtn.click());
    const resolveInput = document.querySelector<HTMLTextAreaElement>("#resolve-summary-input")!;
    expect(resolveInput).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(resolveInput, "Confirmed false positive after audit review");
      resolveInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const confirmResolve = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Confirm resolution")!;
    await act(async () => confirmResolve.click());
    expect(mocks.resolveIntegrityCase).toHaveBeenCalledWith("proj-1", "case-1", "Confirmed false positive after audit review", "RESOLVED");
  });
});
