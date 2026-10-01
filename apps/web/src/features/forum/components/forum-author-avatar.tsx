import { useMemo } from "react";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ForumAuthorView } from "../api/forum.api";
import { useI18n } from "@/i18n";

interface ForumAuthorAvatarProps {
  author: ForumAuthorView;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showVerifiedBadge?: boolean;
  className?: string;
}

const GRADIENTS = [
  "from-blue-500 to-indigo-600 text-white",
  "from-violet-500 to-purple-600 text-white",
  "from-emerald-500 to-teal-600 text-white",
  "from-amber-500 to-orange-600 text-white",
  "from-rose-500 to-pink-600 text-white",
  "from-cyan-500 to-blue-600 text-white",
  "from-fuchsia-500 to-pink-600 text-white",
  "from-teal-500 to-emerald-600 text-white",
];

export function getAuthorInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0] || "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] || "";
  return ((first[0] || "") + (last[0] || "")).toUpperCase() || "U";
}

export function getAuthorGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index] || GRADIENTS[0] || "from-blue-500 to-indigo-600 text-white";
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs font-semibold",
  md: "h-10 w-10 text-sm font-semibold",
  lg: "h-12 w-12 text-base font-bold",
  xl: "h-14 w-14 text-lg font-bold",
};

const BADGE_SIZES = {
  xs: "h-2.5 w-2.5 -right-0.5 -bottom-0.5",
  sm: "h-3.5 w-3.5 -right-1 -bottom-1",
  md: "h-4 w-4 -right-1 -bottom-1",
  lg: "h-4.5 w-4.5 -right-1 -bottom-1",
  xl: "h-5 w-5 -right-1 -bottom-1",
};

export function ForumAuthorAvatar({
  author,
  size = "md",
  showVerifiedBadge = false,
  className,
}: ForumAuthorAvatarProps) {
  const { t } = useI18n();
  const initials = useMemo(() => getAuthorInitials(author.fullName), [author.fullName]);
  const gradient = useMemo(
    () => getAuthorGradient(author.id || author.fullName),
    [author.id, author.fullName]
  );

  return (
    <div role="img" aria-label={author.fullName} title={author.fullName} className={cn("relative inline-flex shrink-0 select-none", className)}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-black/5 dark:ring-white/10",
          SIZE_CLASSES[size],
          !author.avatarUrl && `bg-gradient-to-br ${gradient}`
        )}
      >
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.fullName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {showVerifiedBadge && author.affiliationVerified && (
        <span
          className={cn(
            "absolute rounded-full bg-background p-0.5 text-emerald-600 shadow-sm",
            BADGE_SIZES[size]
          )}
          title={t("Affiliation verified")}
        >
          <BadgeCheck className="h-full w-full fill-emerald-100 dark:fill-emerald-950" />
        </span>
      )}
    </div>
  );
}
