import { Navigate, useParams } from "react-router-dom";
import { isAdminSystemRole } from "@trend/shared-types";
import { useCurrentUser } from "@/features/auth";
import { PageSkeleton, SectionErrorState } from "@/components/loading";
import { UserAiSettings } from "@/features/user-ai/user-ai-settings";
import { InterestsCard } from "@/features/personalization";
import { CreditHistory } from "@/features/credits";
import { SubmitPaperPage } from "./papers/submit-paper";
import { MyPapersPage } from "./papers/my-papers";
import { useI18n } from "@/i18n";
import {
  SettingsLayout,
  type SettingsNavKey,
} from "@/features/settings/components/settings-primitives";
import { SettingsProfileSection } from "@/features/settings/components/settings-profile-section";
import { SettingsPreferencesSection } from "@/features/settings/components/settings-preferences-section";
import { SettingsSecuritySection } from "@/features/settings/components/settings-security-section";

function resolveSettingsSection(section: string | undefined, isAdmin: boolean): SettingsNavKey {
  if (section === "ai") return "ai";
  if (section === "interests") return "interests";
  if (["security", "account"].includes(section ?? "")) return "security";
  if (["credits", "credit-history"].includes(section ?? "")) return "credits";
  if (["preferences", "customization", "notifications"].includes(section ?? "")) return "preferences";
  if (["submit-paper", "submit"].includes(section ?? "") && !isAdmin) return "submit-paper";
  if (["my-papers", "submissions", "works"].includes(section ?? "") && !isAdmin) return "my-papers";
  return "profile";
}

export function AccountSettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { t } = useI18n();
  const { data: userData, isLoading, isFetching, isError, error, refetch } = useCurrentUser();

  if (section === "academic" || section === "academic-profile") {
    return <Navigate to="/profile" replace />;
  }

  if (isLoading) {
    return <PageSkeleton variant="settings" label={t("loading.settings")} />;
  }

  const user = userData?.user;
  if (isError || !user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
      </main>
    );
  }

  const isAdmin = isAdminSystemRole(user.systemRole);
  const activeKey = resolveSettingsSection(section, isAdmin);

  return (
    <SettingsLayout activeKey={activeKey} isAdmin={isAdmin}>
      {activeKey === "profile" ? <SettingsProfileSection user={user} isAdmin={isAdmin} /> : null}
      {activeKey === "preferences" ? <SettingsPreferencesSection user={user} /> : null}
      {activeKey === "security" ? <SettingsSecuritySection user={user} /> : null}
      {activeKey === "ai" ? <UserAiSettings /> : null}
      {activeKey === "interests" ? <InterestsCard /> : null}
      {activeKey === "credits" ? <CreditHistory /> : null}
      {activeKey === "my-papers" && !isAdmin ? <MyPapersPage isEmbedded /> : null}
      {activeKey === "submit-paper" && !isAdmin ? <SubmitPaperPage isEmbedded /> : null}
    </SettingsLayout>
  );
}
