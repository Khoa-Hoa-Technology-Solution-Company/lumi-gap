import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, RefreshCw, BarChart3, ShieldAlert, FileText, Activity, ClipboardCheck } from "lucide-react";
import { useCurrentUser } from "@/features/auth";
import { cn } from "@/utils/cn";

const NAV = [
  { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", end: false, label: "Users", icon: Users },
  { to: "/admin/papers", end: false, label: "Paper Requests", icon: FileText },
  { to: "/admin/sync", end: false, label: "Sync", icon: RefreshCw },
  { to: "/admin/pipeline", end: false, label: "Pipeline", icon: Activity },
  { to: "/admin/evaluation", end: false, label: "Evaluation", icon: ClipboardCheck },
  { to: "/admin/analytics", end: false, label: "Analytics", icon: BarChart3 },
];


export function AdminLayout() {
  const { data } = useCurrentUser();

  if (data?.user && data.user.role !== "admin") {
    return (
      <main className="container space-y-3 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-red-500/80" />
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">Only admins can access this area.</p>
      </main>
    );
  }

  return (
    <div className="container grid grid-cols-1 gap-6 py-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        {NAV.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
