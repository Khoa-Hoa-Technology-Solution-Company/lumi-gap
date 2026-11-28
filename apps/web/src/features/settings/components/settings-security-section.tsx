import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, Laptop, Lock, LogOut, ShieldAlert } from "lucide-react";
import type { AcademicProfileVisibility, User } from "@trend/shared-types";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePassword, useLogout } from "@/features/auth";
import { checkPasswordPolicy } from "@/features/auth/utils/password-policy";
import {
  useAcademicProfile,
  useUpdateAcademicProfile as useUpdateAcademicProfileDetails,
} from "@/features/academic-profile/hooks/use-academic-profile";
import { useI18n } from "@/i18n";
import {
  SettingsFormField,
  SettingsPageHeader,
  SettingsRow,
  SettingsSection,
} from "./settings-primitives";

export function SettingsSecuritySection({ user }: { user: User }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const changePassword = useChangePassword();
  const logout = useLogout();

  const hasAcademicProfile = Boolean(user.primaryPosition || user.onboarding?.completed);
  const academicQuery = useAcademicProfile(hasAcademicProfile);
  const updateAcademic = useUpdateAcademicProfileDetails();
  const profile = academicQuery.data;

  const hasPasswordLogin = user.authProviders?.password ?? true;
  const hasGoogleLogin = user.authProviders?.google ?? false;

  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");

    if (hasPasswordLogin && !currentPassword) {
      setPasswordError(t("Current password is required."));
      return;
    }
    if (!checkPasswordPolicy(newPassword).valid) {
      setPasswordError(t("Use at least 10 characters with uppercase, lowercase, and a number."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("New passwords do not match."));
      return;
    }

    try {
      await changePassword.mutateAsync({
        ...(hasPasswordLogin ? { currentPassword } : {}),
        newPassword,
      });
      toast.success(
        hasPasswordLogin
          ? t("Password updated successfully.")
          : t("Password set successfully. You can now sign in with Google or email and password."),
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormOpen(false);
    } catch (error) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setPasswordError(msg || t("Unable to update password."));
    }
  }

  async function updateVisibility(visibility: AcademicProfileVisibility) {
    if (!profile) return;
    try {
      await updateAcademic.mutateAsync({ profileVisibility: visibility });
      toast.success(t("settings.security.privacySaved"));
    } catch {
      toast.error(t("Unable to update profile."));
    }
  }

  async function updateDiscoverability(patch: {
    showInResearcherSearch?: boolean;
    allowCollaborationRequests?: boolean;
  }) {
    if (!profile) return;
    try {
      await updateAcademic.mutateAsync({
        discoverability: {
          showInResearcherSearch: patch.showInResearcherSearch ?? profile.discoverability.showInResearcherSearch,
          allowCollaborationRequests:
            patch.allowCollaborationRequests ?? profile.discoverability.allowCollaborationRequests,
        },
      });
      toast.success(t("settings.security.privacySaved"));
    } catch {
      toast.error(t("Unable to update profile."));
    }
  }

  return (
    <div>
      <SettingsPageHeader
        title={t("settings.security.title")}
        description={t("settings.security.subtitle")}
      />

      {/* 1. Sign-in & Authentication */}
      <SettingsSection
        title={t("settings.security.authTitle")}
        description={t("settings.security.authDesc")}
      >
        <SettingsRow
          label={t("settings.security.loginEmail")}
          description={user.email}
          badge={
            <Badge
              variant="outline"
              className={
                user.emailVerifiedAt
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }
            >
              {t(user.emailVerifiedAt ? "settings.security.emailVerified" : "settings.security.emailUnverified")}
            </Badge>
          }
        />

        <SettingsRow
          label={t("settings.security.authMethods")}
          description={
            <div className="mt-1 flex flex-wrap gap-1.5">
              {hasPasswordLogin ? (
                <Badge variant="secondary" className="gap-1 font-medium">
                  <KeyRound className="h-3 w-3" aria-hidden="true" />
                  <span>{t("settings.security.passwordEnabled")}</span>
                </Badge>
              ) : null}
              {hasGoogleLogin ? (
                <Badge variant="secondary" className="gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{t("settings.security.googleLinked")}</span>
                </Badge>
              ) : null}
            </div>
          }
        />

        <SettingsRow
          label={t("settings.security.passwordTitle")}
          description={t(
            hasPasswordLogin ? "settings.security.passwordChangeDesc" : "settings.security.passwordSetDesc",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPasswordFormOpen((open) => !open);
              setPasswordError("");
            }}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{passwordFormOpen ? t("Cancel") : t(hasPasswordLogin ? "Change Password" : "Set Password")}</span>
          </Button>
        </SettingsRow>

        {passwordFormOpen ? (
          <form
            onSubmit={(e) => void handlePasswordSubmit(e)}
            className="my-4 max-w-lg space-y-4 rounded-xl border border-border bg-muted/20 p-5"
          >
            {passwordError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                {passwordError}
              </p>
            ) : null}

            {hasPasswordLogin ? (
              <SettingsFormField id="sec-current-pw" label={t("Current Password")} required>
                <Input
                  id="sec-current-pw"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-10"
                />
              </SettingsFormField>
            ) : null}

            <SettingsFormField
              id="sec-new-pw"
              label={t("New Password")}
              required
              helper={t("Use at least 10 characters with one uppercase letter, one lowercase letter, and one number.")}
            >
              <Input
                id="sec-new-pw"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10"
              />
            </SettingsFormField>

            <SettingsFormField id="sec-confirm-pw" label={t("Confirm New Password")} required>
              <Input
                id="sec-confirm-pw"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10"
              />
            </SettingsFormField>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={changePassword.isPending}
                onClick={() => setPasswordFormOpen(false)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={changePassword.isPending}
                loadingText={t("Updating...")}
              >
                {t(hasPasswordLogin ? "Change Password" : "Set Password")}
              </Button>
            </div>
          </form>
        ) : null}

        <SettingsRow
          label={t("settings.security.twoFactor")}
          description={t("settings.security.twoFactorUnavailable")}
          badge={<Badge variant="outline" className="text-muted-foreground">{t("Unavailable")}</Badge>}
        />
      </SettingsSection>

      {/* 2. Devices & Sessions */}
      <SettingsSection
        title={t("settings.security.sessionsTitle")}
        description={t("settings.security.sessionsDesc")}
      >
        <SettingsRow
          label={t("settings.security.currentSession")}
          description={
            <span className="inline-flex items-center gap-1.5">
              <Laptop className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{t("settings.security.currentSessionDesc")}</span>
            </span>
          }
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate("/login", { replace: true }),
              })
            }
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("settings.security.signOutSession")}</span>
          </Button>
        </SettingsRow>
        <p className="mt-3 text-xs text-muted-foreground">{t("settings.security.remoteSessionsNote")}</p>
      </SettingsSection>

      {/* 3. Privacy & Visibility */}
      {profile ? (
        <SettingsSection
          title={t("settings.security.privacyTitle")}
          description={t("settings.security.privacyDesc")}
        >
          <SettingsRow
            label={t("settings.security.profileVisibility")}
            description={t("settings.security.profileVisibilityDesc")}
          >
            <select
              aria-label={t("settings.security.profileVisibility")}
              value={profile.profileVisibility}
              disabled={updateAcademic.isPending}
              onChange={(e) => void updateVisibility(e.target.value as AcademicProfileVisibility)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="PUBLIC">{t("settings.security.visibilityPublic")}</option>
              <option value="MEMBERS_ONLY">{t("settings.security.visibilityMembers")}</option>
              <option value="PRIVATE">{t("settings.security.visibilityPrivate")}</option>
            </select>
          </SettingsRow>

          <SettingsRow
            label={t("settings.security.discoverable")}
            description={t("settings.security.discoverableDesc")}
          >
            <input
              type="checkbox"
              role="switch"
              aria-label={t("settings.security.discoverable")}
              checked={profile.discoverability.showInResearcherSearch}
              disabled={updateAcademic.isPending}
              onChange={(e) => void updateDiscoverability({ showInResearcherSearch: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </SettingsRow>

          <SettingsRow
            label={t("settings.security.allowCollab")}
            description={t("settings.security.allowCollabDesc")}
          >
            <input
              type="checkbox"
              role="switch"
              aria-label={t("settings.security.allowCollab")}
              checked={profile.discoverability.allowCollaborationRequests}
              disabled={updateAcademic.isPending}
              onChange={(e) => void updateDiscoverability({ allowCollaborationRequests: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </SettingsRow>
        </SettingsSection>
      ) : null}

      {/* 4. Account Management */}
      <SettingsSection
        title={t("settings.security.accountTitle")}
        description={t("settings.security.accountDesc")}
      >
        <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>{t("settings.security.accountDeletionNote")}</p>
        </div>
      </SettingsSection>
    </div>
  );
}
