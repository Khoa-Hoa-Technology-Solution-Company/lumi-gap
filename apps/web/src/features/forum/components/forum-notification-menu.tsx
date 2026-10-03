import { Bell, BellOff, BellRing, Eye, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import type { ForumNotificationLevel } from "@trend/shared-types";
import { cn } from "@/utils/cn";

const levels = [
  { value: "WATCHING", label: "Watching", description: "Notify me about every new reply in this discussion.", icon: BellRing },
  { value: "TRACKING", label: "Tracking", description: "Keep this discussion in Following. Notify me when someone replies to me.", icon: Eye },
  { value: "NORMAL", label: "Normal", description: "Notify me only when someone replies to me.", icon: Bell },
  { value: "MUTED", label: "Muted", description: "Do not notify me about this discussion.", icon: BellOff },
] as const;

export function ForumNotificationMenu({ level, isAuthed, pending, disabled, loginHref, onChange, showLabel = false }: { level: ForumNotificationLevel; isAuthed: boolean; pending?: boolean; disabled?: boolean; loginHref: string; onChange: (level: ForumNotificationLevel) => void; showLabel?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selected = levels.find((item) => item.value === level) ?? levels[2];
  const Icon = selected.icon;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild><button type="button" disabled={pending || disabled} aria-label={`${t("Discussion notifications")}: ${t(selected.label)}`} title={`${t("Discussion notifications")}: ${t(selected.label)}`} aria-busy={pending} data-notification-level={selected.value} className={cn(showLabel ? "forum-notification-button" : "forum-timeline-control", "forum-notification-trigger")}>
      {pending ? <Loader2 className="forum-notification-trigger-icon h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Icon className="forum-notification-trigger-icon h-4 w-4" aria-hidden="true" />}
      {showLabel ? t(selected.label) : null}
    </button></DropdownMenuTrigger>
    {showLabel ? <span role="status" className="sr-only">{pending ? t("Saving notification settings…") : ""}</span> : null}
    <DropdownMenuContent align="start" aria-label={t("Discussion notifications")} className="forum-notification-menu w-80 max-w-[calc(100vw-2rem)] p-1.5">
      <DropdownMenuRadioGroup value={level} onValueChange={(value) => {
        const next = levels.find((item) => item.value === value);
        if (isAuthed && !pending && !disabled && next && next.value !== level) onChange(next.value);
      }}>
        {levels.map(({ value, label, description, icon: LevelIcon }) => <DropdownMenuRadioItem key={value} value={value} disabled={pending || disabled} onSelect={() => { if (!isAuthed) navigate(loginHref); }} data-notification-level={value} className="forum-notification-item items-start gap-3 py-3"><span className="forum-notification-icon mt-0.5" aria-hidden="true"><LevelIcon className="h-4 w-4" /></span><span className="min-w-0"><span className="block font-semibold">{t(label)}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(description)}</span></span></DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
