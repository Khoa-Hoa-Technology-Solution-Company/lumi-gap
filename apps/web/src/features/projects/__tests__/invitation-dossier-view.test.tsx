// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InvitationDossier } from "@trend/shared-types";
import { InvitationDossierView } from "../components/invitation-dossier-view";

vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (k: string) => k }) }));

let container: HTMLDivElement, root: Root;

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

const longAbstract = "Nghiên cứu đánh giá các phương pháp giảm thiểu ảo giác trên mô hình ngôn ngữ lớn trong bối cảnh hỏi đáp tài liệu khoa học tiếng Việt. ".repeat(5);

function makeDossier(overrides: Partial<InvitationDossier> = {}): InvitationDossier {
  return {
    version: 1,
    generatedAt: "2026-11-13T00:00:00Z",
    project: {
      id: "proj-1",
      title: "Giảm ảo giác trên mô hình ngôn ngữ lớn",
      abstract: longAbstract,
      abstractApproved: true,
      researchField: "Trí tuệ nhân tạo",
      researchAreas: ["NLP", "RAG"],
      keywords: ["Hallucination", "Benchmark"],
      stage: "ACTIVE",
      primaryObjective: "Xây dựng bộ kiểm thử 1.500 câu hỏi tiếng Việt.",
      teamMemberCount: 4,
    },
    team: {
      teamMemberCount: 4,
      representative: {
        _id: "stu-1",
        fullName: "Nguyễn Minh Anh",
        academicRole: "STUDENT",
        institutionName: "Đại học FPT",
        department: "Công nghệ thông tin",
        programName: "Kỹ thuật phần mềm",
        academicYearLabel: "K18",
        headline: "Sinh viên năm 3 nghiên cứu NLP",
        shortBio: "Đã tham gia đồ án phân tích ngữ nghĩa tài liệu học thuật.",
        researchInterests: ["NLP", "IR"],
        skills: ["Python", "PyTorch"],
        expertiseAreas: ["Information Retrieval"],
        featuredWorks: [
          { id: "w1", kind: "PAPER", title: "Vietnamese RAG Baseline", year: 2026, doi: "10.1000/test", provenance: "PUBLIC_WORK" },
        ],
        publicLinks: [
          { provider: "ORCID", label: "ORCID", profileUrl: "https://orcid.org/0000-0001-2345-6789", verified: true },
        ],
        affiliationVerified: true,
        provenance: ["VERIFIED_AFFILIATION", "VERIFIED_IDENTITY", "PUBLIC_WORK", "SELF_DECLARED"],
      },
      sharedMembersCount: 1,
      sharedMembers: [
        {
          _id: "stu-2",
          fullName: "Trần Quốc Bảo",
          projectRole: "MEMBER",
          institutionName: "Đại học FPT",
          programName: "Trí tuệ nhân tạo",
          skills: ["Evaluation"],
          researchInterests: ["LLM"],
          affiliationVerified: false,
          provenance: "SELF_DECLARED",
        },
      ],
      privacyRedactedCount: 2,
    },
    competencies: {
      researchMethods: [{ name: "Ablation Study", category: "METHOD", provenance: "SELF_DECLARED" }],
      technicalSkills: [{ name: "Python", category: "SKILL", provenance: "SELF_DECLARED" }],
      researchTools: [{ name: "PyTorch", category: "TOOL", provenance: "SELF_DECLARED" }],
      experienceHighlights: [
        { id: "w1", kind: "PAPER", title: "Vietnamese RAG Baseline", year: 2026, doi: "10.1000/test", provenance: "PUBLIC_WORK" },
      ],
      teamStrengthsNote: "Nhóm đã xây xong pipeline trích xuất văn bản thử nghiệm.",
      integrityNotice: "Các kỹ năng, phương pháp, công cụ và kinh nghiệm do thành viên tự khai báo trừ khi được gắn nhãn xác minh đơn vị hoặc công bố công khai.",
    },
    whyThisLecturer: {
      message: "Hướng nghiên cứu về RAG đáng tin cậy của Thầy rất sát với câu hỏi nghiên cứu của nhóm.",
      lecturerName: "TS. Lê Hoàng",
      lecturerInstitution: "Đại học Bách Khoa",
    },
    expectations: {
      supportAreas: ["RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN"],
      expectedPeriod: "1 học kỳ",
      meetingFrequency: "2 tuần/lần",
      expectedMilestone: "Hoàn thành bài báo hội nghị",
      preferredChannel: "Google Meet",
      proposedNote: "Mong muốn được góp ý thiết kế thực nghiệm.",
    },
    accessPreview: {
      mentorRole: "PRIMARY",
      preset: "ADVISOR",
      permissionCount: 3,
      permissions: ["OVERVIEW_VIEW", "PAPERS_VIEW", "MENTOR_CHAT"],
      sharedResourceSummary: ["Chưa mở khóa tài nguyên nội bộ trước khi chấp nhận"],
      expiresAt: null,
      responseDeadline: "6 ngày",
      beforeAcceptNotice: "Trước khi chấp nhận chỉ xem hồ sơ mời.",
      afterAcceptNotice: "Sau khi chấp nhận mới kích hoạt quyền.",
    },
    ...overrides,
  };
}

it("renders all 6 dossier sections, provenance labels, expandable long abstract, and zero fabricated scores", async () => {
  const dossier = makeDossier();
  await act(async () => {
    root.render(
      <MemoryRouter>
        <InvitationDossierView dossier={dossier} />
      </MemoryRouter>,
    );
  });

  const text = container.textContent ?? "";
  expect(text).toContain("A. Thông tin đề tài nghiên cứu");
  expect(text).toContain("B. Nhóm nghiên cứu");
  expect(text).toContain("C. Năng lực và kinh nghiệm của nhóm");
  expect(text).toContain("D. Vì sao nhóm muốn được Thầy/Cô hướng dẫn?");
  expect(text).toContain("E. Nhu cầu và kỳ vọng hướng dẫn");
  expect(text).toContain("F. Vai trò và quyền truy cập đề xuất");

  expect(text).toContain("Nguyễn Minh Anh");
  expect(text).toContain("Đã xác minh đơn vị");
  expect(text).toContain("Công bố công khai");
  expect(text).toContain("Tự khai báo");
  expect(text).toContain("2 thành viên khác không hiển thị thông tin cá nhân");
  expect(text).toContain("Thiết kế phương pháp nghiên cứu");
  expect(text).not.toMatch(/\bscore\b|điểm chất lượng/i);

  const expandBtn = [...container.querySelectorAll("button")].find(b => b.textContent?.includes("Xem đầy đủ"));
  expect(expandBtn).toBeDefined();
  await act(async () => expandBtn!.click());
  expect(container.textContent).toContain("Thu gọn");
});

it("redacts private student details safely and renders unsafe strings as plain text without HTML execution", async () => {
  const dossier = makeDossier({
    whyThisLecturer: { message: '<img src=x onerror="alert(1)"><script>bad()</script>' },
    team: {
      teamMemberCount: 2,
      representative: {
        _id: "stu-1",
        fullName: "Nguyễn Minh Anh",
        researchInterests: [],
        skills: [],
        expertiseAreas: [],
        featuredWorks: [],
        publicLinks: [],
        affiliationVerified: false,
        provenance: [],
        redacted: true,
      },
      sharedMembersCount: 0,
      sharedMembers: [],
      privacyRedactedCount: 1,
    },
  });

  await act(async () => {
    root.render(
      <MemoryRouter>
        <InvitationDossierView dossier={dossier} />
      </MemoryRouter>,
    );
  });

  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img[src='x']")).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  expect(container.textContent).toContain("giới hạn theo cài đặt quyền riêng tư");
});

it("falls back cleanly when rendering a legacy invitation without a dossier snapshot", async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <InvitationDossierView
          legacyProject={{
            id: "legacy",
            title: "Legacy Research Topic",
            summary: "Approved legacy summary",
            stage: "PLANNING",
            expertise: [],
            discovery: "CLOSED",
            researchAreas: [],
            mentoringNeeds: "",
          }}
          legacySender={{ _id: "u1", fullName: "Legacy Student" }}
          legacyMessage="Legacy invitation note"
        />
      </MemoryRouter>,
    );
  });

  expect(container.textContent).toContain("Legacy Research Topic");
  expect(container.textContent).toContain("Approved legacy summary");
  expect(container.textContent).toContain("Legacy Student");
  expect(container.textContent).toContain("Legacy invitation note");
});
