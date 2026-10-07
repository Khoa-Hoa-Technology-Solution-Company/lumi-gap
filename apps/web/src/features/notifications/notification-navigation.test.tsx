// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "@trend/shared-types";
import NotificationMenu from "./components/notification-menu";
import { NotificationsPage } from "@/pages/notifications";
import { AdminTrustSafetyPage } from "@/pages/admin/trust-safety";

const mocks = vi.hoisted(() => ({
  markRead: vi.fn((_id: string) => new Promise<void>(() => {})),
  queue: vi.fn(async () => []),
  appeals: vi.fn(async () => []),
  copyright: vi.fn(async () => []),
}));
const notification: NotificationItem = {
  id: "notification-1", title: "Forum report needs review", message: "A report needs review.",
  type: "FORUM_MODERATION", paperId: null, targetKind: null, targetId: null,
  isRead: false, createdAt: "2026-10-06T00:00:00Z",
};
vi.mock("./hooks/use-notifications", () => ({
  useNotifications: () => ({ data: [notification], isLoading: false }),
  useMarkNotificationRead: () => useMutation({ mutationFn: (id: string) => mocks.markRead(id) }),
  useMarkAllNotificationsRead: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: "admin-1", systemRole: "ADMIN" } }) }));
vi.mock("@/features/admin/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: { data: [] } }) }));
vi.mock("@/features/forum/hooks/use-forum-categories", () => ({ useForumCategories: () => ({ data: [] }) }));
vi.mock("@/features/forum/api/forum.api", () => ({ forumApi: {
  moderationQueue: mocks.queue, appeals: mocks.appeals, copyrightClaims: mocks.copyright,
  restrictions: async () => [],
} }));

function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-location>{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>;
}
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function mount(content: React.ReactNode, path = "/notifications") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{content}<Location /></MemoryRouter></QueryClientProvider>));
  return { container, close: async () => { await act(async () => root.unmount()); client.clear(); container.remove(); } };
}
const button = (label: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent === label)!;
async function openMenu(container: HTMLElement) {
  // Radix supports keyboard opening as well as pointer input.
  await act(async () => container.querySelector('[aria-label="Notifications"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
}

describe("notification navigation", () => {
  it.each(["pending", "failed"])("opens the report queue from the notifications page when marking read is %s", async (state) => {
    if (state === "failed") mocks.markRead.mockRejectedValueOnce(new Error("Read API unavailable"));
    const view = await mount(<NotificationsPage />);
    try {
      await act(async () => Array.from(view.container.querySelectorAll("button")).find((item) => item.textContent?.includes(notification.title))!.click());
      expect(view.container.querySelector("[data-location]")!.textContent).toBe("/admin/trust-safety?tab=reports&status=all");
      expect(mocks.markRead).toHaveBeenCalledWith(notification.id);
    } finally { await view.close(); }
  });

  it.each(["pending", "failed"])("opens the same destination from the bell menu when marking read is %s and closes the menu", async (state) => {
    if (state === "failed") mocks.markRead.mockRejectedValueOnce(new Error("Read API unavailable"));
    const view = await mount(<NotificationMenu notifications={[notification]} isLoading={false} unreadCount={1} isAdmin />);
    try {
      await openMenu(view.container);
      await act(async () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes(notification.title))!.click());
      expect(view.container.querySelector("[data-location]")!.textContent).toBe("/admin/trust-safety?tab=reports&status=all");
      expect(mocks.markRead).toHaveBeenCalledWith(notification.id);
      expect(document.querySelector('[role="menu"]')).toBeNull();
    } finally { await view.close(); }
  });

  it("closes the dropdown when opening all notifications", async () => {
    const view = await mount(<NotificationMenu notifications={[notification]} isLoading={false} unreadCount={1} isAdmin />, "/forum/example");
    try {
      await openMenu(view.container);
      await act(async () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === "View all notifications")!.click());
      expect(view.container.querySelector("[data-location]")!.textContent).toBe("/notifications");
      expect(document.querySelector('[role="menu"]')).toBeNull();
    } finally { await view.close(); }
  });

  it("honors queue deep links and browser history when switching sections", async () => {
    const view = await mount(<AdminTrustSafetyPage />, "/admin/trust-safety?tab=reports&status=all");
    try {
      expect(mocks.queue).toHaveBeenCalledWith("all");
      expect(view.container.querySelector("select")!.value).toBe("all");
      await act(async () => button("Appeals").click());
      expect(mocks.appeals).toHaveBeenCalledWith("SUBMITTED");
      await act(async () => button("Copyright claims").click());
      expect(mocks.copyright).toHaveBeenCalled();
      await act(async () => button("History back").click());
      expect(button("Appeals").getAttribute("aria-pressed")).toBe("true");
    } finally { await view.close(); }
  });

  it("defaults invalid queue parameters to the supported reports view", async () => {
    const view = await mount(<AdminTrustSafetyPage />, "/admin/trust-safety?tab=unknown&status=unknown");
    try {
      expect(mocks.queue).toHaveBeenCalledWith("open");
      expect(button("Reports").getAttribute("aria-pressed")).toBe("true");
    } finally { await view.close(); }
  });
});
