// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logoutMutate: vi.fn(),
  language: "vi" as "vi" | "en",
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: mocks.language,
    t: (key: string) => key,
  }),
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button" data-testid="theme-toggle" />,
}));

vi.mock("@/features/auth", () => ({
  useCurrentUser: () => ({
    data: {
      user: {
        id: "admin-1",
        email: "admin@lumigap.edu",
        fullName: "Nguyễn Đình Thành",
        role: "admin",
        systemRole: "ADMIN",
      },
    },
    isLoading: false,
  }),
  useLogout: () => ({
    mutate: mocks.logoutMutate,
    isPending: false,
  }),
}));

vi.mock("@/features/admin", () => ({
  useAdminStats: () => ({
    data: {
      attention: { pendingVerifications: 0, openModerationReports: 0, unhealthyWorkers: 0 },
      systemHealth: { overall: "healthy", checkedAt: "2026-11-26T15:00:00.000Z" },
    },
    isLoading: false,
    isError: false,
  }),
}));

import { AdminLayout } from "../AdminLayout";

describe("AdminLayout sidebar brand & logout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.logoutMutate.mockReset();
    mocks.language = "vi";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("links the LumiGap Admin brand logo to /home and provides a sidebar logout button", () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<div>Admin Home</div>} />
            </Route>
            <Route path="/home" element={<div data-testid="home-page">Home Page</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();

    const logoImg = aside?.querySelector('img[alt="LumiGap Admin"]');
    const brandLink = logoImg?.closest("a");
    expect(brandLink?.getAttribute("href")).toBe("/home");

    const logoutButton = Array.from(aside?.querySelectorAll("button") ?? []).find((btn) =>
      btn.textContent?.includes("Đăng xuất"),
    );
    expect(logoutButton).toBeTruthy();

    act(() => {
      logoutButton?.click();
    });
    expect(mocks.logoutMutate).toHaveBeenCalledTimes(1);

    act(() => {
      brandLink?.click();
    });
    expect(container.querySelector('[data-testid="home-page"]')?.textContent).toBe("Home Page");
  });
});
