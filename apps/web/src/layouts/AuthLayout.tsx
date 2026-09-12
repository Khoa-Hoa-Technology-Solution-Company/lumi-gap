import { Outlet } from "react-router-dom";
import { ThreeBackgroundParticle } from "@/components/ui/three-background-particle";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden bg-slate-50 dark:bg-black">
      <ThreeBackgroundParticle />
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>
      <div className="z-10 w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
