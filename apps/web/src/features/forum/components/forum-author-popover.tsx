import { forwardRef, useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Activity, BadgeCheck, ExternalLink, Filter, MessageCircle, X } from "lucide-react";
import { Link, useInRouterContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { PublicAcademicProfile } from "@trend/shared-types";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { useAcademicAvatar } from "@/features/academic-profile/hooks/use-academic-profile";
import { cn } from "@/utils/cn";
import type { ForumAuthorView } from "../api/forum.api";
import { ForumAuthorAvatar } from "./forum-author-avatar";

interface ForumAuthorPopoverProps {
  author: ForumAuthorView;
  children: ReactNode;
  isAuthed?: boolean;
  canReply?: boolean;
  onReply?: () => void;
  isFollowing?: boolean;
  followPending?: boolean;
  onToggleFollow?: () => void;
  onFilterPosts?: () => void;
  authorTopicPostCount?: number;
  className?: string;
}

type PopoverPosition = { top: number; left: number };

const VIEWPORT_GUTTER = 12;
const OPEN_DELAY = 120;
const CLOSE_DELAY = 220;
const PROFILE_STALE_TIME = 5 * 60 * 1000;

// Hovercards are mounted once per author in a long thread. Keep one small
// in-memory cache so moving between posts does not refetch the same profile.
const profileCache = new Map<string, { profile: PublicAcademicProfile; fetchedAt: number }>();
const profileRequests = new Map<string, Promise<PublicAcademicProfile>>();

const ProfileTriggerLink = forwardRef<HTMLAnchorElement, { to: string; children: ReactNode; className?: string; "aria-haspopup"?: "dialog"; "aria-expanded"?: boolean; "aria-label"?: string; onClick?: () => void; onPointerEnter?: () => void; onPointerLeave?: () => void; onFocus?: () => void; onBlur?: (event: FocusEvent<HTMLElement>) => void }>(function ProfileTriggerLink({ to, children, ...props }, ref) {
  const inRouter = useInRouterContext();
  return inRouter ? <Link ref={ref} to={to} {...props}>{children}</Link> : <a ref={ref} href={to} {...props}>{children}</a>;
});

function getCachedProfile(userId: string) {
  const cached = profileCache.get(userId);
  if (!cached) return undefined;
  if (Date.now() - cached.fetchedAt > PROFILE_STALE_TIME) {
    profileCache.delete(userId);
    return undefined;
  }
  return cached.profile;
}

function loadPublicProfile(userId: string) {
  const cached = getCachedProfile(userId);
  if (cached) return Promise.resolve(cached);

  const existing = profileRequests.get(userId);
  if (existing) return existing;

  const request = academicProfileApi.publicProfile(userId).then((profile) => {
    profileCache.set(userId, { profile, fetchedAt: Date.now() });
    profileRequests.delete(userId);
    return profile;
  }).catch((error) => {
    profileRequests.delete(userId);
    throw error;
  });
  profileRequests.set(userId, request);
  return request;
}

function prefetchPublicProfile(userId: string) {
  if (!userId || getCachedProfile(userId)) return;
  void loadPublicProfile(userId).catch(() => undefined);
}

function positionCard(trigger: HTMLElement, card: HTMLElement): PopoverPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - cardRect.width - VIEWPORT_GUTTER);
  const preferredLeft = triggerRect.left;
  const left = Math.min(Math.max(VIEWPORT_GUTTER, preferredLeft), maxLeft);
  const below = triggerRect.bottom + 10;
  const above = triggerRect.top - cardRect.height - 10;
  const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - cardRect.height - VIEWPORT_GUTTER);
  const belowFits = below + cardRect.height <= window.innerHeight - VIEWPORT_GUTTER;
  const aboveFits = above >= VIEWPORT_GUTTER;
  const preferredTop = belowFits || !aboveFits ? below : above;
  return { top: Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), maxTop), left };
}

function isTriggerVisible(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  return rect.bottom > VIEWPORT_GUTTER && rect.top < window.innerHeight - VIEWPORT_GUTTER;
}

export function ForumAuthorPopover({
  author,
  children,
  canReply = false,
  onReply,
  onFilterPosts,
  authorTopicPostCount,
  className,
}: ForumAuthorPopoverProps) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>();
  const [profile, setProfile] = useState<PublicAcademicProfile | undefined>(() => getCachedProfile(author.id));
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number>();
  const closeTimerRef = useRef<number>();
  const focusedRef = useRef(false);
  const suppressFocusOpenRef = useRef(false);
  const requestedAuthorRef = useRef(author.id);
  const avatarSrc = useAcademicAvatar(profile?.avatarUrl ?? author.avatarUrl);

  const profilePath = profile?.publicHandle
    ? `/u/${encodeURIComponent(profile.publicHandle)}`
    : author.publicHandle
      ? `/${encodeURIComponent(author.publicHandle)}`
      : `/academics/${encodeURIComponent(author.id)}`;
  const activityPath = profile?.publicHandle
    ? `/u/${encodeURIComponent(profile.publicHandle)}/activity`
    : author.publicHandle
      ? `/u/${encodeURIComponent(author.publicHandle)}/activity`
      : `/academics/${encodeURIComponent(author.id)}/activity`;

  const cancelTimers = useCallback(() => {
    if (openTimerRef.current !== undefined) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = undefined;
    closeTimerRef.current = undefined;
  }, []);

  const requestProfile = useCallback(() => {
    if (!author.id) return;
    const cached = getCachedProfile(author.id);
    if (cached) {
      setProfile(cached);
      setProfileLoading(false);
      setProfileError(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(false);
    void loadPublicProfile(author.id).then((next) => {
      if (requestedAuthorRef.current !== author.id) return;
      setProfile(next);
      setProfileLoading(false);
    }).catch(() => {
      if (requestedAuthorRef.current !== author.id) return;
      setProfileLoading(false);
      setProfileError(true);
    });
  }, [author.id]);

  useEffect(() => {
    requestedAuthorRef.current = author.id;
    setProfile(getCachedProfile(author.id));
    setProfileLoading(false);
    setProfileError(false);
  }, [author.id]);

  const closeCard = useCallback(() => {
    cancelTimers();
    focusedRef.current = false;
    setOpen(false);
  }, [cancelTimers]);

  const scheduleClose = useCallback(() => {
    if (focusedRef.current) return;
    if (openTimerRef.current !== undefined) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      if (!focusedRef.current) setOpen(false);
    }, CLOSE_DELAY);
  }, []);

  const openCard = useCallback(() => {
    cancelTimers();
    setPosition(undefined);
    setOpen(true);
    requestProfile();
  }, [cancelTimers, requestProfile]);

  const handlePointerEnter = useCallback(() => {
    cancelTimers();
    prefetchPublicProfile(author.id);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = undefined;
      openCard();
    }, OPEN_DELAY);
  }, [author.id, cancelTimers, openCard]);

  const handleFocus = useCallback(() => {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false;
      focusedRef.current = true;
      return;
    }
    focusedRef.current = true;
    openCard();
  }, [openCard]);

  const handleFocusOut = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (triggerRef.current?.contains(next) || cardRef.current?.contains(next)) return;
    focusedRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const handlePointerLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  useEffect(() => {
    return () => cancelTimers();
  }, [cancelTimers]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !cardRef.current) return;
    const next = positionCard(triggerRef.current, cardRef.current);
    setPosition((previous) => previous?.top === next.top && previous.left === next.left ? previous : next);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, profileLoading, profile?.userId, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target)) closeCard();
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCard();
        const trigger = triggerRef.current;
        if (trigger && document.activeElement !== trigger) {
          suppressFocusOpenRef.current = true;
          trigger.focus();
        } else {
          suppressFocusOpenRef.current = false;
        }
      }
    };
    let frame = 0;
    const handleViewportChange = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const trigger = triggerRef.current;
        if (!trigger || !isTriggerVisible(trigger)) {
          closeCard();
          return;
        }
        updatePosition();
      });
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [closeCard, open, updatePosition]);

  const title = profile?.displayName ?? author.fullName;
  const rawPosition = profile?.affiliation.positionTitle ?? author.positionTitle ?? author.primaryPosition;
  const positionTitle = rawPosition === "STUDENT" ? t("Student") : rawPosition === "LECTURER" ? t("Lecturer") : rawPosition === "RESEARCH_STAFF" ? t("Researcher") : rawPosition;
  const institution = profile?.affiliation.institutionName ?? author.institution;
  const headline = profile?.headline || profile?.biography;
  const expertise = profile?.expertiseAreas?.slice(0, 3) ?? [];
  const verified = author.affiliationVerified || author.positionVerified || profile?.verificationStatus === "VERIFIED";

  const card = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={t("Author profile preview")}
      data-state="open"
      className="forum-author-popover fixed z-[100] max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain text-foreground"
      style={position ? { top: position.top, left: position.left } : { visibility: "hidden", top: 12, left: 12 }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.stopPropagation()}
      onPointerEnter={cancelTimers}
      onPointerLeave={handlePointerLeave}
      onFocus={cancelTimers}
      onBlur={handleFocusOut}
    >
      <div className="forum-user-card rounded-xl border border-border/90 bg-background p-4 shadow-[0_8px_28px_hsl(var(--foreground)/0.14)]">
        <div className="flex items-start gap-3">
          <ForumAuthorAvatar author={{ ...author, avatarUrl: avatarSrc ?? undefined, affiliationVerified: verified }} size="lg" showVerifiedBadge={verified} />
          <div className="min-w-0 flex-1 pr-5">
            <h2 className="truncate text-base font-semibold leading-5">{title}</h2>
            {profile?.publicHandle || author.publicHandle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">@{profile?.publicHandle ?? author.publicHandle}</p> : null}
          </div>
          <button type="button" aria-label={t("Close author profile preview")} title={t("Close author profile preview")} onClick={closeCard} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
        {positionTitle || institution ? <p className="mt-3 text-xs text-muted-foreground">{[positionTitle, institution].filter(Boolean).join(" · ")}</p> : null}
        {verified ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("Academic identity verified")}</p> : null}
        {headline ? <p className="mt-2 line-clamp-3 text-sm leading-5">{headline}</p> : null}
        {profileLoading ? <div role="status" className="mt-3 h-8 animate-pulse rounded-md bg-muted" aria-label={t("Loading academic profile")} /> : null}
        {profileError && !headline ? <p className="mt-3 text-xs text-muted-foreground">{t("Only public profile details are shown here.")}</p> : null}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {profile?.createdAt ? <span>{t("Joined")} <time className="text-foreground" dateTime={profile.createdAt}>{new Date(profile.createdAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric", year: "numeric" })}</time></span> : null}
          {authorTopicPostCount !== undefined ? <span>{t("Posts in topic")} <strong className="font-medium text-primary">{authorTopicPostCount}</strong></span> : null}
          {profile?.expertiseAreas?.length ? <span>{t("Expertise")} <strong className="font-medium text-primary">{profile.expertiseAreas.length}</strong></span> : null}
        </div>
        {expertise.length ? <div className="mt-3 flex flex-wrap gap-1.5">{expertise.map((item) => <span key={item} className="rounded border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">{item}</span>)}{(profile?.expertiseAreas.length ?? 0) > expertise.length ? <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">+{profile!.expertiseAreas.length - expertise.length}</span> : null}</div> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Button asChild variant="discussion" size="sm" className="h-8 gap-1.5 rounded-full"><Link to={profilePath} onClick={closeCard}><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />{t("View profile")}</Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full"><Link to={activityPath} onClick={closeCard}><Activity aria-hidden="true" className="h-3.5 w-3.5" />{t("Activity")}</Link></Button>
          {onFilterPosts ? <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={() => { closeCard(); onFilterPosts(); }}><Filter aria-hidden="true" className="h-3.5 w-3.5" />{authorTopicPostCount !== undefined ? `${authorTopicPostCount} ` : ""}{t("Posts in this topic")}</Button> : null}
          {onReply ? <Button type="button" size="sm" variant="ghost" disabled={!canReply} className="h-8 gap-1.5 text-muted-foreground" onClick={() => { closeCard(); onReply(); }}><MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />{t("Reply")}</Button> : null}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return <>
    <ProfileTriggerLink
      ref={triggerRef}
      to={profilePath}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={t("View author profile")}
      onClick={closeCard}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleFocusOut}
      className={cn("inline-flex self-start justify-self-start rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", open && "ring-2 ring-primary/35 ring-offset-2", className)}
    >
      {children}
    </ProfileTriggerLink>
    {card}
  </>;
}
