import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ThreeBackgroundParticle } from "@/components/ui/three-background-particle";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-x-clip overflow-y-auto bg-slate-50 px-4 py-16 [padding-bottom:max(4rem,env(safe-area-inset-bottom))] [padding-top:max(4rem,env(safe-area-inset-top))] dark:bg-black">
      <ThreeBackgroundParticle />
      <div className="absolute right-3 top-3 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="z-10 w-full max-w-sm">
        <Suspense
          fallback={(
            <div className="min-h-80" role="status" aria-live="polite">
              <span className="sr-only">Loading page...</span>
            </div>
          )}
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
