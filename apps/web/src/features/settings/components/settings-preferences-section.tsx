import { Link } from "react-router-dom";
import { Bell, Globe, HandHeart, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { User } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n, type UiLanguageCode } from "@/i18n";
import { cn } from "@/utils/cn";
import { SettingsPageHeader, SettingsRow, SettingsSection } from "./settings-primitives";

export function SettingsPreferencesSection({ user }: { user: User }) {
  const { t, language, languages, setLanguage } = useI18n();
  const { theme = "system", setTheme } = useTheme();
  const isLecturer = user.academicRole === "LECTURER";

  const themes = [
    { id: "light", labelKey: "settings.preferences.themeLight", icon: Sun },
    { id: "dark", labelKey: "settings.preferences.themeDark", icon: Moon },
    { id: "system", labelKey: "settings.preferences.themeSystem", icon: Monitor },
  ] as const;

  return (
    <div>
      <SettingsPageHeader
        title={t("settings.preferences.title")}
        description={t("settings.preferences.subtitle")}
      />

      <SettingsSection
        title={t("settings.preferences.appearanceTitle")}
        description={t("settings.preferences.appearanceDesc")}
      >
        <div className="grid max-w-lg grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("settings.preferences.appearanceTitle")}>
          {themes.map(({ id, labelKey, icon: Icon }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.preferences.languageTitle")}
        description={t("settings.preferences.languageDesc")}
      >
        <div className="max-w-sm">
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <select
              aria-label={t("settings.preferences.languageTitle")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as UiLanguageCode)}
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.nativeLabel} ({item.label})
                </option>
              ))}
            </select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.preferences.notificationsTitle")}
        description={t("settings.preferences.notificationsDesc")}
      >
        <SettingsRow
          label={t("Notifications")}
          description={t("View your recent research, review, and mentoring updates.")}
        >
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/notifications">
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("settings.preferences.openNotifications")}</span>
            </Link>
          </Button>
        </SettingsRow>

        {isLecturer ? (
          <SettingsRow
            label={t("settings.preferences.mentoringDelivery")}
            description={t("settings.preferences.mentoringDeliveryDesc")}
          >
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/profile?tab=collaboration">
                <HandHeart className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("settings.preferences.manageMentoring")}</span>
              </Link>
            </Button>
          </SettingsRow>
        ) : null}
      </SettingsSection>
    </div>
  );
}
