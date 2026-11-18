// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MentorSuggestion } from "@trend/shared-types";
import { supervisorInvitationVi } from "@/i18n/locales/supervisor-invitation";
import { SuggestMentorDialog } from "../suggest-mentor-dialog";
import { MemberMentorSuggestionsList, OwnerMentorSuggestionsInbox } from "../mentor-suggestions-panel";

const mocks = vi.hoisted(() => ({
  suggestions: vi.fn(),
  suggest: vi.fn(),
  dismissSuggestion: vi.fn(),
  plan: vi.fn(),
  changePlan: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/features/projects/api/academic-support.api", () => ({
  academicSupportApi: mocks,
}));
vi.mock("@/features/projects/components/mentoring-preferences", () => ({
  mentorshipError: (err: any) => err?.response?.data?.error?.message ?? "Request failed",
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign((selector: any) => selector({ user: { id: "user-1" } }), { getState: () => ({ user: { id: "user-1" } }) }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({ language: "vi", t: (key: string) => (supervisorInvitationVi as Record<string, string>)[key] ?? ({"Send suggestion":"Gửi đề xuất", "View profile":"Xem hồ sơ"} as Record<string,string>)[key] ?? key }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess } }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function tick() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

function setTextarea(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(btn => btn.textContent?.includes(label));
}

const sampleProject = {
  id: "proj-1",
  title: "Phân tích LLM trong giáo dục đại học",
  summary: "Shared abstract",
  researchField: "AI in Education",
  researchAreas: ["NLP", "Learning Analytics"],
  expertise: ["Experimental Design"],
  stage: "PLANNING" as const,
  mentoringNeeds: "Góp ý thiết kế thực nghiệm",
  discovery: "CLOSED" as const,
};

const sampleMentor = {
  _id: "lect-1",
  fullName: "TS. Trần Văn B",
  positionTitle: "Giảng viên chính",
  institutionName: "ĐH Bách Khoa",
  verifiedLecturer: true,
  acceptingMentorships: true,
  expertiseAreas: ["NLP", "LLM Evaluation", "Data Science"],
  researchInterests: ["Educational Technology"],
  matchedTerms: ["NLP"],
  sameInstitution: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("Student mentor suggestion workflow UI", () => {
  it("renders the shared lecturer card and one reason field, validates whitespace, preserves text on error, and submits cleanly", async () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    mocks.suggest
      .mockRejectedValueOnce({ response: { data: { error: { message: "Tạm thời không kết nối được" } } } })
      .mockResolvedValueOnce({ id: "sug-1" });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <SuggestMentorDialog
              project={sampleProject}
              mentor={sampleMentor}
              onClose={onClose}
              onSubmitted={onSubmitted}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await tick();

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("Đề xuất giảng viên"); expect(dialogText).toContain("TS. Trần Văn B");
    expect(dialogText).toContain("Giảng viên chưa nhận được lời mời.");
    expect(dialogText).toContain("Phân tích LLM trong giáo dục đại học");

    const profileLink = document.querySelector<HTMLAnchorElement>('a[href="/academics/lect-1"]');
    expect(profileLink?.textContent).toContain("Xem hồ sơ"); expect(document.querySelectorAll("textarea")).toHaveLength(1);

    const submitBtn = findButton("Gửi đề xuất")!;
    expect(submitBtn.disabled).toBe(true);

    const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => setTextarea(textarea, "   "));
    expect(submitBtn.disabled).toBe(true);
    expect(mocks.suggest).not.toHaveBeenCalled();

    const reason = "  Thầy có kinh nghiệm đánh giá NLP phù hợp với thiết kế thực nghiệm của nhóm  ";
    await act(async () => setTextarea(textarea, reason));
    expect(submitBtn.disabled).toBe(false);

    // Recoverable failure keeps user's text intact
    await act(async () => submitBtn.click());
    await tick();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Tạm thời không kết nối được");
    expect(textarea.value).toBe(reason);
    expect(onClose).not.toHaveBeenCalled();

    // Retry succeeds with trimmed reason
    await act(async () => submitBtn.click());
    await tick();
    expect(mocks.suggest).toHaveBeenLastCalledWith("proj-1", "lect-1", reason.trim());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Đã gửi đề xuất đến chủ dự án. Giảng viên chưa nhận được lời mời.");
    expect(onSubmitted).toHaveBeenCalledWith("TS. Trần Văn B");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays accurate status badges in MemberMentorSuggestionsList without inventing ACCEPTED suggestion status", async () => {
    const items: MentorSuggestion[] = [
      {
        id: "s1",
        projectId: "proj-1",
        mentorUser: { _id: "l1", fullName: "TS. Giảng viên A", verifiedLecturer: true, institutionName: "ĐH KHTN" },
        suggestedBy: { _id: "user-1", fullName: "Sinh viên 1" },
        message: "Rất phù hợp về phương pháp định lượng.",
        status: "PENDING",
        inRecruitmentPlan: true,
        plannedRole: "PRIMARY",
        createdAt: "2026-11-12T08:00:00Z",
      },
      {
        id: "s2",
        projectId: "proj-1",
        mentorUser: { _id: "l2", fullName: "PGS. Giảng viên B", verifiedLecturer: true },
        suggestedBy: { _id: "user-1", fullName: "Sinh viên 1" },
        message: "Có nhiều công bố về LLM safety.",
        status: "INVITED",
        requestId: "req-2",
        requestStatus: "ACCEPTED",
        hasActiveRelationship: true,
        createdAt: "2026-11-10T08:00:00Z",
      },
      {
        id: "s3",
        projectId: "proj-1",
        mentorUser: { _id: "l3", fullName: "ThS. Giảng viên C" },
        suggestedBy: { _id: "user-1", fullName: "Sinh viên 1" },
        message: "Gợi ý dự phòng.",
        status: "DISMISSED",
        dismissReason: "Nhóm ưu tiên giảng viên chuyên sâu NLP.",
        createdAt: "2026-11-09T08:00:00Z",
      },
    ];
    mocks.suggestions.mockResolvedValue({
      items,
      meta: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
      counts: { pending: 1, total: 3, mine: 3, minePending: 1 },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <MemberMentorSuggestionsList projectId="proj-1" />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await tick();

    expect(mocks.suggestions).toHaveBeenCalledWith("proj-1", 1, "mine");
    const text = host.textContent ?? "";
    expect(text).toContain("Đề xuất của tôi");
    expect(text).toContain("Đang chờ chủ dự án xem xét");
    expect(text).toContain("Đã đưa vào kế hoạch mời (Cố vấn chính)");
    expect(text).toContain("Chủ dự án đã gửi lời mời chính thức");
    expect(text).toContain("Giảng viên đã chấp nhận hướng dẫn dự án");
    expect(text).toContain("Đề xuất đã được bỏ qua");
    expect(text).toContain("Đề xuất nội bộ đã được chủ dự án bỏ qua; giảng viên chưa nhận được lời mời.");
    expect(text).toContain("Nhóm ưu tiên giảng viên chuyên sâu NLP.");
  });

  it("allows Owner to add a suggested lecturer to recruitment plan or dismiss with an optional reason", async () => {
    const pendingItem: MentorSuggestion = {
      id: "s-pending",
      projectId: "proj-1",
      mentorUser: { _id: "lect-1", fullName: "TS. Trần Văn B", verifiedLecturer: true, positionTitle: "Giảng viên chính", institutionName: "ĐH Bách Khoa" },
      suggestedBy: { _id: "student-1", fullName: "Nguyễn Minh Anh" },
      message: "Phù hợp phần thực nghiệm đánh giá.",
      status: "PENDING",
      expertiseAreas: ["NLP"],
      acceptingMentorships: true,
      inRecruitmentPlan: false,
      hasPendingRequest: false,
      hasActiveRelationship: false,
      createdAt: "2026-11-12T08:00:00Z",
    };

    mocks.suggestions.mockResolvedValue({
      items: [pendingItem],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      counts: { pending: 1, total: 1, mine: 0, minePending: 0 },
    });
    mocks.plan.mockResolvedValue({
      version: 1,
      parallelInvitations: false,
      autoSend: false,
      currentMentors: [],
      currentInvitations: [],
      closedRoles: [],
      canManage: true,
      positions: { PRIMARY: { status: "VACANT", pendingRequests: 0 }, SECONDARY: { status: "VACANT", pendingRequests: 0 } },
      candidates: [],
    });
    mocks.changePlan.mockResolvedValue({});
    mocks.dismissSuggestion.mockResolvedValue({ id: "s-pending" });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <OwnerMentorSuggestionsInbox projectId="proj-1" onOpenPlan={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await tick();

    expect(host.textContent).toContain("Đề xuất từ thành viên");
    expect(host.textContent).toContain("1 đang chờ xem xét");
    expect(host.textContent).toContain("Nguyễn Minh Anh");
    expect(host.textContent).toContain("Phù hợp phần thực nghiệm đánh giá.");

    // Add to recruitment plan flow
    await act(async () => findButton("Thêm vào kế hoạch mời")!.click());
    await tick();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Thêm ứng viên vào kế hoạch");
    const confirmAddBtn = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === "Thêm vào kế hoạch")!;
    expect(confirmAddBtn.disabled).toBe(false);
    await act(async () => confirmAddBtn.click());
    await tick();
    expect(mocks.changePlan).toHaveBeenCalledWith("proj-1", {
      action: "add",
      expectedVersion: 1,
      mentorUserId: "lect-1",
      mentorRole: "UNASSIGNED",
    });

    // Dismiss flow with optional note
    await act(async () => findButton("Bỏ qua")!.click());
    await tick();
    expect(document.body.textContent).toContain("Bỏ qua đề xuất cố vấn?");
    const noteInput = document.querySelector<HTMLTextAreaElement>("#dismiss-reason-proj-1")!;
    await act(async () => setTextarea(noteInput, "Đã có ứng viên chính phù hợp hơn."));
    await act(async () => findButton("Xác nhận bỏ qua")!.click());
    await tick();
    expect(mocks.dismissSuggestion).toHaveBeenCalledWith("proj-1", "s-pending", "Đã có ứng viên chính phù hợp hơn.");
  });
});
