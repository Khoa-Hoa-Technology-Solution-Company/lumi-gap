import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { queryClient } from "./services/query-client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider, preloadInitialDictionary } from "@/i18n";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { RouteProgress } from "@/components/loading";
import { useAuthStore } from "@/stores/auth-store";
import { authApi } from "@/features/auth/api/auth.api";
import { reloadOnceForStaleChunk } from "@/utils/stale-chunk";
import "./theme/globals.css";
import "./theme/lumi-surface.css";

// Kick off locale dictionary + active session validation in parallel before React paints
// to eliminate the serial i18n -> layout -> /auth/me cold-start waterfall.
preloadInitialDictionary();
if (useAuthStore.getState().tokens?.accessToken) {
  void queryClient.prefetchQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const data = await authApi.me();
      useAuthStore.setState({ user: data.user });
      return data;
    },
    staleTime: 30_000,
  });
}

const LecturerDeliveryNotice = lazy(() =>
  import("@/features/academic-profile/components/lecturer-delivery-notice").then((module) => ({
    default: module.LecturerDeliveryNotice,
  })),
);

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : null;

// Vite fires this when a lazy chunk (or its CSS) from an older deploy is gone.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={150}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <RouteProgress />
              <I18nProvider>
                <App />
                <Suspense fallback={null}>
                  <LecturerDeliveryNotice />
                </Suspense>
                <Toaster
                  closeButton
                  position="bottom-right"
                  duration={2400}
                  visibleToasts={2}
                  expand={false}
                  gap={8}
                  offset={16}
                  mobileOffset={12}
                  swipeDirections={["right", "bottom"]}
                />
              </I18nProvider>
            </BrowserRouter>
          </TooltipProvider>
          {ReactQueryDevtools && import.meta.env.VITE_SHOW_QUERY_DEVTOOLS === "true" ? (
            <Suspense fallback={null}>
              <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            </Suspense>
          ) : null}
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
