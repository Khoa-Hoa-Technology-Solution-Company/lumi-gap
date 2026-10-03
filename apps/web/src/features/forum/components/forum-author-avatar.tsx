import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ForumAuthorView } from "../api/forum.api";
import { useI18n } from "@/i18n";
import { useAcademicAvatar } from "@/features/academic-profile/hooks/use-academic-profile";

interface ForumAuthorAvatarProps {
  author: ForumAuthorView;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "card";
  showVerifiedBadge?: boolean;
  className?: string;
}

const AVATAR_COLORS = [
  "bg-[#486786] text-white",
  "bg-[#76628b] text-white",
  "bg-[#52786d] text-white",
  "bg-[#8d704f] text-white",
  "bg-[#986574] text-white",
  "bg-[#4f7885] text-white",
  "bg-[#806a7d] text-white",
  "bg-[#63715a] text-white",
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

function getAuthorColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-xs font-medium",
  sm: "h-8 w-8 text-xs font-semibold",
  md: "h-10 w-10 text-sm font-semibold",
  lg: "h-12 w-12 text-base font-bold",
  xl: "h-14 w-14 text-lg font-bold",
  card: "h-24 w-24 text-3xl font-semibold sm:h-32 sm:w-32 sm:text-4xl",
};

const BADGE_SIZES = {
  xs: "h-2.5 w-2.5 -right-0.5 -bottom-0.5",
  sm: "h-3.5 w-3.5 -right-1 -bottom-1",
  md: "h-4 w-4 -right-1 -bottom-1",
  lg: "h-4.5 w-4.5 -right-1 -bottom-1",
  xl: "h-5 w-5 -right-1 -bottom-1",
  card: "h-6 w-6 -right-1 -bottom-1",
};

export function ForumAuthorAvatar({
  author,
  size = "md",
  showVerifiedBadge = false,
  className,
}: ForumAuthorAvatarProps) {
  const { t } = useI18n();
  const avatarSrc = useAcademicAvatar(author.avatarUrl);
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = Boolean(avatarSrc && avatarSrc !== failedSrc);
  const initials = useMemo(() => getAuthorInitials(author.fullName), [author.fullName]);
  const color = useMemo(
    () => getAuthorColor(author.id || author.fullName),
    [author.id, author.fullName]
  );

  return (
    <div role="img" aria-label={author.fullName} title={author.fullName} className={cn("forum-author-avatar relative inline-flex shrink-0 select-none rounded-full", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full ring-1 ring-black/5 dark:ring-white/10",
          SIZE_CLASSES[size],
          color
        )}
      >
        <span aria-hidden="true" className="leading-none">{size === "xs" ? initials.slice(0, 1) : initials}</span>
        {showImage ? (
          <img
            src={avatarSrc!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(avatarSrc ?? undefined)}
          />
        ) : null}
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
