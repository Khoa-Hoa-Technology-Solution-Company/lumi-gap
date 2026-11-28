import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  FileText,
  KeyRound,
  Menu,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SettingsPanelTransition } from "@/components/settings-panel-transition";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

export type SettingsNavKey =
  | "profile"
  | "preferences"
  | "security"
  | "interests"
  | "my-papers"
  | "submit-paper"
  | "ai"
  | "credits";

export interface SettingsNavItem {
  key: Exclude<SettingsNavKey, "submit-paper">;
  to: string;
  labelKey: string;
  icon: LucideIcon;
  adminHidden?: boolean;
}

export interface SettingsNavGroup {
  id: string;
  titleKey: string;
  items: readonly SettingsNavItem[];
}

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    id: "account",
    titleKey: "settings.group.account",
    items: [
      { key: "profile", to: "/settings/profile", labelKey: "settings.nav.profile", icon: User },
      { key: "preferences", to: "/settings/preferences", labelKey: "settings.nav.preferences", icon: SlidersHorizontal },
      { key: "security", to: "/settings/security", labelKey: "settings.nav.security", icon: ShieldCheck },
    ],
  },
  {
    id: "research",
    titleKey: "settings.group.research",
    items: [
      { key: "interests", to: "/settings/interests", labelKey: "settings.nav.interests", icon: Sparkles },
      { key: "my-papers", to: "/settings/my-papers", labelKey: "settings.nav.works", icon: FileText, adminHidden: true },
    ],
  },
  {
    id: "services",
    titleKey: "settings.group.services",
    items: [
      { key: "ai", to: "/settings/ai", labelKey: "settings.nav.ai", icon: KeyRound },
      { key: "credits", to: "/settings/credits", labelKey: "settings.nav.credits", icon: ReceiptText },
    ],
  },
];

function visibleGroups(isAdmin: boolean) {
  return SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !(isAdmin && item.adminHidden)),
  })).filter((group) => group.items.length > 0);
}

export function SettingsSidebar({
  activeKey,
  isAdmin,
  onSelect,
}: {
  activeKey: SettingsNavKey;
  isAdmin: boolean;
  onSelect?: () => void;
}) {
  const { t } = useI18n();
  // Highlight "Công trình của tôi" when on the embedded "Nộp bài báo" workflow too.
  const normalizedActive = activeKey === "submit-paper" ? "my-papers" : activeKey;
  const groups = visibleGroups(isAdmin);

  return (
    <nav aria-label={t("settings.workspaceTitle")} className="account-settings-nav space-y-6" data-no-i18n>
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(group.titleKey)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ key, to, labelKey, icon: Icon }) => {
              const active = normalizedActive === key;
              return (
                <li key={key}>
                  <Link
                    to={to}
                    onClick={onSelect}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary/10 font-semibold text-primary dark:bg-primary/15"
                        : "font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{t(labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SettingsLayout({
  activeKey,
  isAdmin,
  children,
}: {
  activeKey: SettingsNavKey;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groups = visibleGroups(isAdmin);
  const normalizedActive = activeKey === "submit-paper" ? "my-papers" : activeKey;
  const activeItem = groups.flatMap((g) => g.items).find((item) => item.key === normalizedActive);
  const ActiveIcon = activeItem?.icon ?? User;

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" data-no-i18n>
      {/* Mobile navigation selector */}
      <div className="mb-5 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="settings-mobile-drawer"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Menu className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">{t("settings.workspaceTitle")} /</span>
            <ActiveIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{activeItem ? t(activeItem.labelKey) : t("settings.nav.profile")}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            id="settings-mobile-drawer"
            side="left"
            className="w-[min(19rem,calc(100vw-2rem))] p-5"
            closeLabel={t("Close navigation")}
          >
            <SheetTitle className="text-base font-semibold text-foreground">
              {t("settings.workspaceTitle")}
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs text-muted-foreground">
              {t("settings.workspaceSubtitle")}
            </SheetDescription>
            <div className="mt-6">
              <SettingsSidebar
                activeKey={activeKey}
                isAdmin={isAdmin}
                onSelect={() => setDrawerOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop 2-column workspace: sticky 236px sidebar + spacious main column */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:sticky lg:top-[calc(var(--app-header-height)+1.5rem)] lg:block">
          <div className="mb-5 px-3">
            <p className="text-xs font-semibold text-foreground">{t("settings.workspaceTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("settings.workspaceSubtitle")}
            </p>
          </div>
          <SettingsSidebar activeKey={activeKey} isAdmin={isAdmin} />
        </aside>

        <div className="min-w-0">
          <SettingsPanelTransition section={activeKey}>
            <div className="min-w-0 rounded-xl border border-border/85 bg-card px-5 py-6 sm:px-8 sm:py-7">
              {children}
            </div>
          </SettingsPanelTransition>
        </div>
      </div>
    </main>
  );
}

export function SettingsPageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border/75 py-6 last:border-b-0 last:pb-0", className)}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[18px]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  badge,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/60 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {badge}
        </div>
        {description ? (
          <div className="text-[13px] leading-5 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function SettingsFormField({
  id,
  label,
  required,
  helper,
  error,
  children,
  className,
}: {
  id?: string;
  label: string;
  required?: boolean;
  helper?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export function SettingsSaveBar({
  dirty,
  saving,
  onDiscard,
  saveLabel,
  savingLabel,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard?: () => void;
  saveLabel: string;
  savingLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {dirty ? t("settings.profile.unsaved") : ""}
      </p>
      <div className="flex items-center gap-2">
        {dirty && onDiscard ? (
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onDiscard}>
            {t("settings.profile.discard")}
          </Button>
        ) : null}
        <Button type="submit" size="sm" loading={saving} loadingText={savingLabel} disabled={!dirty && !saving}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
