import type { ForumPostType } from "@trend/shared-types";
import { BookOpen, Compass, HelpCircle, MessageSquare } from "lucide-react";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

interface ForumPostTypeBadgeProps {
  type: ForumPostType;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export const FORUM_TYPE_CONFIG: Record<
  ForumPostType,
  {
    label: string;
    description: string;
    icon: typeof HelpCircle;
    badgeStyle: string;
    iconColor: string;
    accentGlow: string;
  }
> = {
  QUESTION: {
    label: "Question",
    description: "Specific academic question seeking focused answers",
    icon: HelpCircle,
    badgeStyle:
      "bg-transparent text-blue-700 border-blue-200 dark:text-blue-300 dark:border-blue-800/70",
    iconColor: "text-violet-600 dark:text-violet-400",
    accentGlow: "from-violet-500/10 to-indigo-500/10",
  },
  DISCUSSION: {
    label: "Discussion",
    description: "Open scholarly discussion and methodological debate",
    icon: MessageSquare,
    badgeStyle:
      "bg-transparent text-slate-600 border-slate-300 dark:text-slate-300 dark:border-slate-700",
    iconColor: "text-sky-600 dark:text-sky-400",
    accentGlow: "from-sky-500/10 to-blue-500/10",
  },
  PAPER_DISCUSSION: {
    label: "Paper Discussion",
    description: "Critique and inquiry centered around a specific published paper",
    icon: BookOpen,
    badgeStyle:
      "bg-transparent text-amber-800 border-amber-300 dark:text-amber-300 dark:border-amber-800/70",
    iconColor: "text-amber-700 dark:text-amber-400",
    accentGlow: "from-amber-500/10 to-orange-500/10",
  },
  RESEARCH_GAP_DISCUSSION: {
    label: "Research Gap Discussion",
    description: "Analysis and validation of candidate research gaps and future directions",
    icon: Compass,
    badgeStyle:
      "bg-transparent text-emerald-800 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800/70",
    iconColor: "text-emerald-700 dark:text-emerald-400",
    accentGlow: "from-emerald-500/10 to-teal-500/10",
  },
};

export function ForumPostTypeBadge({
  type,
  size = "sm",
  showIcon = true,
  className,
}: ForumPostTypeBadgeProps) {
  const { t } = useI18n();
  const config = FORUM_TYPE_CONFIG[type] ?? FORUM_TYPE_CONFIG.DISCUSSION;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1 font-medium",
    md: "px-2.5 py-1 text-xs gap-1.5 font-semibold",
    lg: "px-3 py-1.5 text-sm gap-2 font-semibold",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 transition-colors",
        config.badgeStyle,
        sizeClasses[size],
        className
      )}
      title={t(config.description)}
    >
      {showIcon && <Icon className={cn("shrink-0", iconSizes[size], config.iconColor)} />}
      <span>{t(config.label)}</span>
    </span>
  );
}
