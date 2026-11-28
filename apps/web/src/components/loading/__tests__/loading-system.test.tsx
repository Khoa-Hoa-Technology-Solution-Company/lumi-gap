// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import {
  AsyncTaskProgress,
  PageSkeleton,
  RoutePendingSignal,
  RouteProgress,
  SectionErrorState,
  classifyApiError,
  resolveSkeletonVariant,
} from "../index";
import { queryClient } from "@/services/query-client";
import { useAuthStore } from "@/stores/auth-store";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, language: "en" }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Global Loading Design System", () => {
  it("delays RouteProgress by 160ms to prevent flicker on fast navigations and clears immediately on settle", async () => {
    await act(async () => {
      root.render(
        <>
          <RouteProgress />
          <RoutePendingSignal />
        </>,
      );
    });
    expect(container.querySelector('[role="progressbar"]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(170);
    });
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    await act(async () => {
      root.render(<RouteProgress />);
    });
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("disables double-submit and sets aria-busy when Button is loading", async () => {
    const onClick = vi.fn();
    await act(async () => {
      root.render(
        <Button loading loadingText="Saving..." onClick={onClick}>
          Save changes
        </Button>,
      );
    });
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toContain("Saving...");
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders determinate progress only when real counts/percent exist, and indeterminate otherwise", async () => {
    await act(async () => {
      root.render(
        <AsyncTaskProgress
          title="Importing papers"
          status="running"
          completed={12}
          total={20}
        />,
      );
    });
    const determinateBar = container.querySelector('[role="progressbar"]')!;
    expect(determinateBar.getAttribute("aria-valuenow")).toBe("60");
    expect(container.textContent).toContain("12/20 (60%)");

    await act(async () => {
      root.render(
        <AsyncTaskProgress
          title="Analyzing paper"
          status="running"
        />,
      );
    });
    const indeterminateBar = container.querySelector('[role="progressbar"]')!;
    expect(indeterminateBar.getAttribute("aria-valuenow")).toBeNull();
  });

  it("classifies errors accurately and never renders Retry for 403 Forbidden or 404 Not Found", async () => {
    expect(classifyApiError({ response: { status: 403 } })).toEqual({ kind: "forbidden", status: 403, retryable: false });
    expect(classifyApiError({ response: { status: 404 } })).toEqual({ kind: "not_found", status: 404, retryable: false });
    expect(classifyApiError({ response: { status: 500 } })).toEqual({ kind: "server", status: 500, retryable: true });
    expect(classifyApiError({ code: "ECONNABORTED" })).toEqual({ kind: "timeout", status: undefined, retryable: true });

    const onRetry = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SectionErrorState error={{ response: { status: 403 } }} onRetry={onRetry} />
        </MemoryRouter>,
      );
    });
    expect(container.querySelector("button")).toBeNull();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SectionErrorState error={{ response: { status: 500 } }} onRetry={onRetry} />
        </MemoryRouter>,
      );
    });
    const retryBtn = container.querySelector("button")!;
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("maps routes to layout-specific skeleton variants", () => {
    expect(resolveSkeletonVariant("/dashboard")).toBe("dashboard");
    expect(resolveSkeletonVariant("/projects")).toBe("projects");
    expect(resolveSkeletonVariant("/projects/p1")).toBe("project-detail");
    expect(resolveSkeletonVariant("/projects/p1/manuscripts/m1")).toBe("manuscript-editor");
    expect(resolveSkeletonVariant("/profile")).toBe("profile");
    expect(resolveSkeletonVariant("/u/demo")).toBe("profile");
    expect(resolveSkeletonVariant("/papers/123")).toBe("paper-detail");
    expect(resolveSkeletonVariant("/notifications")).toBe("notifications");
    expect(resolveSkeletonVariant("/settings/profile")).toBe("settings");
    expect(resolveSkeletonVariant("/mentor-workspace", "?view=review&assignmentId=1")).toBe("review-workspace");
    expect(resolveSkeletonVariant("/admin/users")).toBe("table");
  });

  it("renders accessible page skeletons with neutral reduced-motion-safe primitives", async () => {
    await act(async () => {
      root.render(<PageSkeleton variant="profile" label="Loading profile" />);
    });
    const status = container.querySelector('[role="status"]')!;
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Loading profile");
    expect(container.innerHTML).toContain("motion-reduce:animate-none");
  });

  it("clears QueryClient cache immediately when auth session is cleared (prevents cross-account/post-expiry leaks)", () => {
    queryClient.setQueryData(["projects", "user-a"], [{ id: "secret-project" }]);
    expect(queryClient.getQueryData(["projects", "user-a"])).toBeDefined();

    useAuthStore.getState().clear();
    expect(queryClient.getQueryData(["projects", "user-a"])).toBeUndefined();
  });
});
