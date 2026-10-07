import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export function ForumHelpfulButton({ count, selected, pending = false, disabled = false, onToggle }: {
  count: number;
  selected: boolean;
  pending?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const { t, language } = useI18n();
  const formatted = count.toLocaleString(language);
  return <Button type="button" variant="ghost" size="sm" aria-label={`${t("Helpful")} ${formatted}`} aria-pressed={selected} aria-busy={pending} disabled={disabled || pending || !onToggle} title={t("This was useful to the community.")} onClick={onToggle} className={cn("gap-1.5 text-muted-foreground", selected && "text-primary")}>
    <ThumbsUp aria-hidden="true" className="h-4 w-4" /><span>{t("Helpful")}</span><span className="tabular-nums">{formatted}</span>
  </Button>;
}
