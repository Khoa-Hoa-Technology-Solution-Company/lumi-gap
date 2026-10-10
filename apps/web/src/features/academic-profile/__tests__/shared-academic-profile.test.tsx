// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicProfile } from "@trend/shared-types";
import { AcademicProfileView } from "../components/academic-profile-view";
import { AcademicProfileInlineEditor } from "../components/academic-profile-inline-editor";
import { ProfilePage } from "@/pages/profile-overview";

const mocks = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn(), options: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("../hooks/use-academic-profile", () => ({ useAcademicAvatar: (url?: string) => url ?? null, useAcademicCover: () => null, useUpdateAcademicProfile: () => ({ mutateAsync: mocks.save }), useSetPublicHandle: () => ({ mutateAsync: vi.fn() }), useUploadAcademicCover: () => ({ mutateAsync: vi.fn() }), useRemoveAcademicCover: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../components/profile-avatar-dialog", () => ({ ProfileAvatarDialog: () => null }));
vi.mock("../components/profile-cover-dialog", () => ({ ProfileCoverDialog: () => null }));
vi.mock("../components/student-affiliation-panel", () => ({ StudentAffiliationPanel: () => <p>Optional affiliation verification</p> }));
vi.mock("../components/position-verification-panel", () => ({ PositionVerificationPanel: ({ open }: { open?: boolean }) => <div><p>Separate position verification</p>{open && <p>Position verification form open</p>}</div> }));
vi.mock("../components/academic-identity-manager", () => ({ AcademicIdentityManager: ({ profile }: { profile: AcademicProfile }) => <div>{profile.academicIdentityLinks.map(link => <p key={link.id}>{link.provider}</p>)}</div> }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ institutions: [{ id: "11111111-1111-4111-8111-111111111111", name: "University of Melbourne" }], researchAreas: ["Education", "Software Engineering", "Artificial Intelligence"], programs: [] }) } }));
vi.mock("../api/academic-profile.api", () => ({ academicProfileApi: { featuredWorkOptions: mocks.options } }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { primaryPosition: "STUDENT" } } }) }));
vi.mock("@/features/academic-profile", async () => ({
  AcademicProfileView: (await import("../components/academic-profile-view")).AcademicProfileView,
  useAcademicProfile: () => ({ data: profile() }),
}));
let root: Root, container: HTMLDivElement, client: QueryClient;
function profile(overrides: Partial<AcademicProfile> = {}): AcademicProfile {
  return { id: "profile", userId: "student", displayName: "Academic Student", points: 0, academicRole: "STUDENT", academicType: "student", primaryPosition: "STUDENT", positionCategory: "STUDENT", positionSource: "PREDEFINED", positionTitle: "Student", affiliation: { institutionName: "University of Melbourne", institutionId: "11111111-1111-4111-8111-111111111111", hostInstitution: false, programName: "Software Engineering", isCurrent: true, affiliationVerificationStatus: "NOT_SUBMITTED" }, affiliationHistory: [], profileVisibility: "PUBLIC", discoverability: { allowCollaborationRequests: true, showInResearcherSearch: true }, researchInterests: ["Automated Testing"], expertiseAreas: ["Software Engineering"], skills: [], researchKeywords: [], biography: "Researching reliable software.", academicIdentityLinks: [{ id: "link", provider: "ORCID", verificationStatus: "UNVERIFIED", visibility: "PUBLIC", status: "SELF_DECLARED", connectionMethod: "MANUAL", createdAt: "2026-10-01", updatedAt: "2026-10-01" }], externalIdentities: [], featuredWorks: [{ kind: "PROJECT", source: "LUMIGAP", projectId: "project", canonical: true, title: "Research project contribution", href: "/projects/project" }], supportAvailability: { enabled: false, types: [], preferredTopics: [] }, reviewAvailability: { enabled: false, types: [], preferredTopics: [] }, verificationStatus: "SELF_DECLARED", academicRoleVerificationStatus: "SELF_DECLARED", verification: { status: "SELF_DECLARED" }, verificationEvidence: [], verificationRequests: [], profileHistory: [], privacy: { expertise: "PUBLIC", researchInterests: "PUBLIC", orcid: "PUBLIC" }, createdAt: "2026-10-01", updatedAt: "2026-10-01", ...overrides };
}
function RouteLocation() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
async function render(element: React.ReactNode, initialEntry = "/profile") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{element}<RouteLocation /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function fill(element: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function click(text: string) { const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); mocks.save.mockResolvedValue(profile()); mocks.options.mockResolvedValue([{ kind: "PROJECT", projectId: "project-2", source: "LUMIGAP", canonical: true, title: "Permitted project", visibility: "RESTRICTED" }]); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
describe("shared academic profile presentation and editing", () => {
  it("restores the main overview layout while retaining Student identity and typed contributions", async () => {
    await render(<AcademicProfileView profile={profile()} />);
    expect(container.textContent).toContain("Student"); expect(container.textContent).toContain("Software Engineering");
    expect(Array.from(container.querySelectorAll("h2")).map(item => item.textContent)).toEqual(["Academic Biography", "Research Focus & Expertise", "Featured Works & Contributions"]);
    expect(container.querySelector('a[href="/projects/project"]')?.textContent).toBe("Research project contribution");
    expect(container.textContent).not.toMatch(/h-index|Citations|Publications|External User|Verified Researcher/);
    expect(container.textContent).not.toContain("LumiGap Verified Paper");
    await click("Scholarly Identities1");
    expect(container.textContent).toContain("ORCID");
  });
  it("omits empty optional sections, skills and metrics on another user's profile", async () => {
    await render(<AcademicProfileView profile={profile({ biography: "", expertiseAreas: [], researchInterests: [], featuredWorks: [], academicIdentityLinks: [] })} />);
    expect(container.querySelectorAll("h2")).toHaveLength(0);
    expect(container.textContent).not.toContain("Research skills"); expect(container.textContent).not.toContain("Add work");
    expect(container.textContent).not.toMatch(/Publications|Citations|h-index/);
  });
  it.each(["RESEARCHER", "LECTURER"] as const)("shows current position rather than student major for %s", async role => {
    await render(<AcademicProfileView profile={profile({ academicRole: role, academicType: role === "LECTURER" ? "lecturer" : "researcher", positionTitle: role === "LECTURER" ? "Senior Lecturer" : "Research Engineer" })} />);
    expect(container.querySelector("header")?.textContent).toContain(role === "LECTURER" ? "Senior Lecturer" : "Research Engineer");
    expect(container.querySelector("header")?.textContent).not.toContain("Software Engineering");
    if (role === "LECTURER") expect(container.textContent).toContain("Lecturer position is self-declared");
  });
  it.each([[false, "VERIFIED", false], [true, "PENDING", false], [true, "VERIFIED", true]] as const)("renders precise FPT badge only for host=%s and status=%s", async (host, status, expected) => {
    await render(<AcademicProfileView profile={profile({ affiliation: { institutionName: host ? "FPT University" : "Other university", hostInstitution: host, isCurrent: true, affiliationVerificationStatus: status } })} />);
    expect(Boolean(container.querySelector('[aria-label="FPT Education affiliation verified"]'))).toBe(expected);
  });
  it("displays Lecturer position verification separately from affiliation", async () => {
    await render(<AcademicProfileView profile={profile({ academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", verificationStatuses: { position: "VERIFIED", affiliation: "NOT_SUBMITTED", identity: "NOT_SUBMITTED", email: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" } })} />);
    expect(container.textContent).toContain("Lecturer position verified");
    expect(container.querySelector('[aria-label="FPT Education affiliation verified"]')).toBeNull();
  });
  it("shows small own-profile CTAs for optional content", async () => {
    const own = profile({ biography: "", featuredWorks: [], academicIdentityLinks: [] });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    expect(container.textContent).toContain("Add a research project or contribution");
    expect(container.textContent).toContain("Add biography");
  });
  it("keeps the active tab and unrelated URL state when opening and closing the current editor", async () => {
    await render(<ProfilePage />, "/profile?tab=affiliation&from=directory");
    expect(container.textContent).toContain("Optional affiliation verification");
    await click("Edit identity");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Program / Major");
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/profile?tab=affiliation&from=directory&edit=affiliation");
    await click("Cancel");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/profile?tab=affiliation&from=directory");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Academic Affiliation");
  });
  it("switches embedded profile tabs without changing the account settings URL", async () => {
    const own = profile();
    await render(<AcademicProfileView profile={own} editableProfile={own} embedded />, "/settings/profile?tab=academic");
    await click("Scholarly Identities1");
    expect(container.textContent).toContain("ORCID");
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/settings/profile?tab=academic");
  });
  it("hides private settings and academic review availability for a self-declared Lecturer", async () => {
    await render(<AcademicProfileView profile={profile({ academicRole: "LECTURER", reviewAvailability: { enabled: true, types: ["RESEARCH_PAPER"], preferredTopics: [] } })} />, "/u/lecturer?tab=settings");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Overview & Research");
    expect(container.textContent).not.toContain("Privacy & Settings");
    expect(container.textContent).not.toContain("Verify your Lecturer status");
    expect(container.textContent).not.toContain("Academic Review Open");
    await click("Collaboration & Review");
    expect(container.textContent).not.toContain("Open for assigned academic reviews");
  });
  it.each([["NOT_SUBMITTED", "Verify Lecturer Status"], ["NEEDS_MORE_INFORMATION", "Update verification"], ["REJECTED", "Submit new verification"]] as const)("opens the existing verification flow from the reminder for %s", async (status, action) => {
    const own = profile({ academicRole: "LECTURER", verificationStatuses: { position: status, affiliation: "VERIFIED", email: "VERIFIED", identity: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" } });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    expect(container.querySelector('header section[aria-labelledby]')).not.toBeNull();
    await click(action);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Affiliation & Verification");
    expect(container.textContent).toContain("Position verification form open");
  });
  it("shows an in-review message without prompting a duplicate verification request", async () => {
    const own = profile({ academicRole: "LECTURER", verificationStatuses: { position: "PENDING", affiliation: "VERIFIED", email: "VERIFIED", identity: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" } });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    expect(container.textContent).toContain("Your Lecturer verification is under review");
    expect(container.textContent).not.toContain("Verify Lecturer Status");
    await click("View verification status");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Affiliation & Verification");
    expect(container.textContent).not.toContain("Position verification form open");
    expect(document.activeElement?.textContent).toBe("Separate position verification");
  });
  it.each(["STUDENT", "RESEARCHER"] as const)("does not remind %s users to verify Lecturer status", async academicRole => {
    const own = profile({ academicRole });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    expect(container.querySelector('header section[aria-labelledby]')).toBeNull();
  });
  it("removes the reminder only after Lecturer role and position are both verified", async () => {
    const own = profile({ academicRole: "LECTURER", verificationStatuses: { position: "VERIFIED", affiliation: "VERIFIED", email: "VERIFIED", identity: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" } });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    expect(container.querySelector('header section[aria-labelledby]')).not.toBeNull();
    const verified = { ...own, academicRoleVerificationStatus: "VERIFIED" as const };
    await render(<AcademicProfileView profile={verified} editableProfile={verified} />);
    expect(container.querySelector('header section[aria-labelledby]')).toBeNull();
  });
  it("edits Student program without a Current Position input or re-entering onboarding data", async () => {
    await render(<AcademicProfileInlineEditor section="affiliation" profile={profile()} onClose={mocks.close} />);
    const label = Array.from(container.querySelectorAll("label")).find(item => item.textContent?.includes("Program / Major"))!;
    expect(label.querySelector<HTMLInputElement>("input")?.value).toBe("Software Engineering");
    expect(container.textContent).not.toContain("Current Position");
    await fill(label.querySelector("input")!, "Computer Science"); await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ academicRole: "STUDENT", affiliation: expect.objectContaining({ programName: "Computer Science" }) }));
    expect(mocks.save.mock.calls[0]![0]).not.toHaveProperty("positionTitle");
  });
  it("uses searchable research taxonomy and tags instead of CSV inputs", async () => {
    await render(<AcademicProfileInlineEditor section="research" profile={profile()} onClose={mocks.close} />);
    await click("Education"); await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expertiseAreas: ["Software Engineering", "Education"], researchInterests: ["Automated Testing"] }));
    expect(container.textContent).not.toContain("Separate topics with commas.");
  });
  it("selects accessible project references without manually entering database IDs", async () => {
    await render(<AcademicProfileInlineEditor section="works" profile={profile({ featuredWorks: [] })} onClose={mocks.close} />);
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent?.startsWith("Permitted project"))!;
    await act(async () => option.click()); await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith({ featuredWorks: [{ kind: "PROJECT", projectId: "project-2", source: "LUMIGAP" }] });
    expect(container.textContent).not.toContain("LumiGap paper ID");
  });
});
