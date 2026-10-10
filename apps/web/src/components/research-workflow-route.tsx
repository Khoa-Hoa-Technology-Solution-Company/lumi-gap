import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { Button } from "./ui/button";

export function ResearchWorkflowRoute() {
  const { data, isLoading, error, refetch } = useCurrentUser();
  const { t } = useI18n();
  if (isLoading) return <div className="mx-auto h-32 max-w-xl animate-pulse rounded-xl bg-muted" />;
  if (error || !data) return <div className="p-6"><Button onClick={() => void refetch()}>{t("Retry")}</Button></div>;
  if (data.user.systemRole !== "ADMIN" && !data.user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}
