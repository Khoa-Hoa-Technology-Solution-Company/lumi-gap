import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

// Keep Three.js out of the critical login/register render path so auth forms appear immediately.
const ThreeBackgroundParticle = lazy(() =>
  import("@/components/ui/three-background-particle").then((m) => ({
    default: m.ThreeBackgroundParticle,
  })),
);

export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-x-clip overflow-y-auto bg-slate-50 px-4 py-16 [padding-bottom:max(4rem,env(safe-area-inset-bottom))] [padding-top:max(4rem,env(safe-area-inset-top))] dark:bg-black">
      <Suspense fallback={null}>
        <ThreeBackgroundParticle />
      </Suspense>
      <div className="absolute right-3 top-3 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="z-10 w-full max-w-sm">
        <Suspense
          fallback={(
            <div className="min-h-80 space-y-4 rounded-2xl border border-border/80 bg-card/90 p-6" role="status" aria-live="polite" aria-busy="true">
              <Skeleton className="mx-auto h-7 w-36" />
              <Skeleton className="mx-auto h-4 w-52" />
              <div className="space-y-3 pt-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          )}
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
