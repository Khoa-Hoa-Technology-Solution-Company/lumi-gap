// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorProjectPreview } from "@trend/shared-types";
import { MentorPreviewContent, MentorInvitationAccessNotice } from "../components/mentor-preview";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let host: HTMLDivElement, root: Root;
const preview: MentorProjectPreview = { id: "project", title: "Evaluating language models", summary: "An owner-approved abstract", teamMemberCount: 4,
  stage: "PLANNING", discovery: "CLOSED", researchAreas: ["Computer Science"], expertise: ["Study design"], mentoringNeeds: "Review our evaluation methods" };
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("labels the topic, approved abstract and aggregate team size without exposing member identities", async () => {
  await act(async () => root.render(<MentorPreviewContent preview={preview} />));
  expect([...host.querySelectorAll("dt")].map(el => el.textContent)).toEqual(["Research topic", "Shared research abstract", "Research team"]);
  expect(host.textContent).toContain("An owner-approved abstract");
  expect(host.textContent).toContain("4 team members, including the project owner");
  expect(host.textContent).toContain(preview.mentoringNeeds);
  expect(host.querySelector("a")).toBeNull();
});

it("renders abstract HTML as plain text and does not use unapproved fallback fields", async () => {
  const untrusted = { ...preview, summary: '<script>alert("x")</script>', description: "PRIVATE-NOTES", publicSummary: "UNAPPROVED-ABSTRACT", members: [{ fullName: "PRIVATE-MEMBER" }] };
  await act(async () => root.render(<MentorPreviewContent preview={untrusted} />));
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain(untrusted.summary);
  expect(host.textContent).not.toMatch(/PRIVATE-NOTES|UNAPPROVED-ABSTRACT|PRIVATE-MEMBER/);
});

it("explains missing approved abstract without inventing text or team size", async () => {
  await act(async () => root.render(<MentorPreviewContent preview={{ ...preview, summary: "", teamMemberCount: undefined }} />));
  expect(host.textContent).toContain("The team has not shared a research abstract yet.");
  expect(host.textContent).not.toContain("Research team");
});

it("explains that consent and explicit sharing are both required", async () => {
  await act(async () => root.render(<MentorInvitationAccessNotice />));
  expect(host.textContent).toContain("Project access starts after acceptance");
  expect(host.textContent).toContain("only on resources the owner shares and permissions they grant");
  expect(host.textContent).toContain("LaTeX source and confidential data are not automatically opened");
});
