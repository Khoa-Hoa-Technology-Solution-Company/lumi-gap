import { forwardRef, useCallback, useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Activity, ExternalLink, Filter, MessageCircle, X } from "lucide-react";
import { AcademicIdentitySummary, profileIdentity } from "@/features/academic-profile/components/academic-identity-summary";
import { Link, useInRouterContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { PublicAcademicProfile } from "@trend/shared-types";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { useAcademicAvatar, useAcademicCover } from "@/features/academic-profile/hooks/use-academic-profile";
import { useAuthStore } from "@/stores/auth-store";
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
const EXIT_DURATION = 140;
const CARD_OPEN_EVENT = "forum:author-card-open";
const PROFILE_STALE_TIME = 5 * 60 * 1000;

// Hovercards are mounted once per author in a long thread. Keep one small
// in-memory cache so moving between posts does not refetch the same profile.
const profileCache = new Map<string, { profile: PublicAcademicProfile; fetchedAt: number }>();
const profileRequests = new Map<string, Promise<PublicAcademicProfile>>();

const ProfileTriggerLink = forwardRef<HTMLAnchorElement, { to: string; children: ReactNode; className?: string; "aria-haspopup"?: "dialog"; "aria-expanded"?: boolean; "aria-controls"?: string; "aria-label"?: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void; onPointerLeave?: () => void; onFocus?: () => void; onBlur?: (event: FocusEvent<HTMLElement>) => void }>(function ProfileTriggerLink({ to, children, ...props }, ref) {
  const inRouter = useInRouterContext();
  return inRouter ? <Link ref={ref} to={to} {...props}>{children}</Link> : <a ref={ref} href={to} {...props}>{children}</a>;
});

function getCachedProfile(profileKey: string) {
  const cached = profileCache.get(profileKey);
  if (!cached) return undefined;
  if (Date.now() - cached.fetchedAt > PROFILE_STALE_TIME) {
    profileCache.delete(profileKey);
    return undefined;
  }
  return cached.profile;
}

function loadPublicProfile(userId: string, profileKey: string) {
  const cached = getCachedProfile(profileKey);
  if (cached) return Promise.resolve(cached);

  const existing = profileRequests.get(profileKey);
  if (existing) return existing;

  const request = academicProfileApi.publicProfile(userId).then((profile) => {
    profileCache.set(profileKey, { profile, fetchedAt: Date.now() });
    if (profileCache.size > 100) profileCache.delete(profileCache.keys().next().value!);
    profileRequests.delete(profileKey);
    return profile;
  }).catch((error) => {
    profileRequests.delete(profileKey);
    throw error;
  });
  profileRequests.set(profileKey, request);
  return request;
}

function prefetchPublicProfile(userId: string, profileKey: string) {
  if (!userId || getCachedProfile(profileKey)) return;
  void loadPublicProfile(userId, profileKey).catch(() => undefined);
}

function positionCard(trigger: HTMLElement, card: HTMLElement): PopoverPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const maxLeft = Math.max(VIEWPORT_GUTTER, viewportWidth - cardRect.width - VIEWPORT_GUTTER);
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
  const viewer = useAuthStore((state) => state.tokens?.accessToken ? state.user?.id ?? "authenticated" : "anonymous");
  const profileKey = `${viewer}:${author.id}`;
  const cardId = useId();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>();
  const [profileState, setProfileState] = useState(() => ({ key: profileKey, profile: getCachedProfile(profileKey) }));
  const profile = profileState.key === profileKey ? profileState.profile : undefined;
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number>();
  const closeTimerRef = useRef<number>();
  const exitTimerRef = useRef<number>();
  const openRef = useRef(false);
  const pinnedRef = useRef(false);
  const focusedRef = useRef(false);
  const suppressFocusOpenRef = useRef(false);
  const requestedProfileRef = useRef(profileKey);
  requestedProfileRef.current = profileKey;
  const avatarSrc = useAcademicAvatar(present ? profile?.avatarUrl ?? author.avatarUrl : undefined);
  const loadedCover = useAcademicCover(present ? profile?.coverUrl : undefined);
  const coverSrc = present && profile?.coverUrl ? loadedCover : null;

  const profilePath = profile?.publicHandle
    ? `/u/${encodeURIComponent(profile.publicHandle)}`
    : author.publicHandle
      ? `/u/${encodeURIComponent(author.publicHandle)}`
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
    const cached = getCachedProfile(profileKey);
    if (cached) {
      setProfileState({ key: profileKey, profile: cached });
      setProfileLoading(false);
      setProfileError(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(false);
    void loadPublicProfile(author.id, profileKey).then((next) => {
      if (requestedProfileRef.current !== profileKey) return;
      setProfileState({ key: profileKey, profile: next });
      setProfileLoading(false);
    }).catch(() => {
      if (requestedProfileRef.current !== profileKey) return;
      setProfileLoading(false);
      setProfileError(true);
    });
  }, [author.id, profileKey]);

  const closeCard = useCallback(() => {
    cancelTimers();
    focusedRef.current = false;
    pinnedRef.current = false;
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const exitDuration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : EXIT_DURATION;
    if (!exitDuration) {
      setPresent(false);
      return;
    }
    exitTimerRef.current = window.setTimeout(() => {
      setPresent(false);
      exitTimerRef.current = undefined;
    }, exitDuration);
  }, [cancelTimers]);

  const closeAndRestoreFocus = useCallback(() => {
    closeCard();
    const trigger = triggerRef.current;
    if (trigger && document.activeElement !== trigger) {
      suppressFocusOpenRef.current = true;
      trigger.focus({ preventScroll: true });
    }
  }, [closeCard]);

  useEffect(() => {
    setProfileState({ key: profileKey, profile: getCachedProfile(profileKey) });
    setProfileLoading(false);
    setProfileError(false);
    cancelTimers();
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = undefined;
    openRef.current = false;
    pinnedRef.current = false;
    focusedRef.current = false;
    setOpen(false);
    setPresent(false);
  }, [profileKey, cancelTimers]);

  const scheduleClose = useCallback(() => {
    if (focusedRef.current || pinnedRef.current) return;
    if (openTimerRef.current !== undefined) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      if (!focusedRef.current && !pinnedRef.current) closeCard();
    }, CLOSE_DELAY);
  }, [closeCard]);

  const openCard = useCallback(() => {
    cancelTimers();
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = undefined;
    if (!openRef.current) setPosition(undefined);
    window.dispatchEvent(new CustomEvent(CARD_OPEN_EVENT, { detail: cardId }));
    openRef.current = true;
    setPresent(true);
    setOpen(true);
    requestProfile();
  }, [cancelTimers, cardId, requestProfile]);

  const handlePointerEnter = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch" || openRef.current) return;
    cancelTimers();
    prefetchPublicProfile(author.id, profileKey);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = undefined;
      openCard();
    }, OPEN_DELAY);
  }, [author.id, profileKey, cancelTimers, openCard]);

  const handleClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pinnedRef.current && openRef.current) {
      closeCard();
      return;
    }
    pinnedRef.current = true;
    openCard();
    cardRef.current?.focus({ preventScroll: true });
  }, [closeCard, openCard]);

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
    if (pinnedRef.current) closeCard();
    else scheduleClose();
  }, [closeCard, scheduleClose]);

  const handlePointerLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  useEffect(() => {
    return () => {
      cancelTimers();
      if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    };
  }, [cancelTimers]);

  useEffect(() => {
    if (cardRef.current) cardRef.current.inert = !open;
    if (open && position && pinnedRef.current && !cardRef.current?.contains(document.activeElement)) cardRef.current?.focus({ preventScroll: true });
  }, [open, position]);

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
    const closeForAnotherCard = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== cardId) closeCard();
    };
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target)) closeCard();
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
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
    window.addEventListener(CARD_OPEN_EVENT, closeForAnotherCard);
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener(CARD_OPEN_EVENT, closeForAnotherCard);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [cardId, closeCard, closeAndRestoreFocus, open, updatePosition]);

  const title = profile?.displayName ?? author.fullName;
  const identity = profile ? profileIdentity(profile) : { academicRole: (author.primaryPosition === "STUDENT" || author.academicProfileType === "student" ? "STUDENT" : author.primaryPosition === "LECTURER" || author.academicProfileType === "lecturer" ? "LECTURER" : "RESEARCHER") as "STUDENT" | "LECTURER" | "RESEARCHER", institutionName: author.institution, fptAffiliationVerified: false };
  const verified = identity.fptAffiliationVerified === true;
  const headline = profile?.headline || profile?.biography;
  const expertise = profile?.expertiseAreas?.slice(0, 3) ?? [];

  const card = present && profileState.key === profileKey && typeof document !== "undefined" ? createPortal(
    <>
    <div aria-hidden="true" data-state={open ? "open" : "closed"} className="forum-user-card-cloak" />
    <div
      ref={cardRef}
      id={cardId}
      role="dialog"
      aria-label={t("Author profile preview")}
      aria-hidden={!open || undefined}
      tabIndex={-1}
      data-state={open ? "open" : "closed"}
      className="forum-author-popover fixed z-[100] max-h-[calc(100dvh-1.5rem)] w-[min(39rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain text-foreground outline-none"
      style={position ? { top: position.top, left: position.left } : { visibility: "hidden", top: 12, left: 12 }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.stopPropagation()}
      onPointerEnter={cancelTimers}
      onPointerLeave={handlePointerLeave}
      onFocus={() => { focusedRef.current = true; cancelTimers(); }}
      onBlur={handleFocusOut}
    >
      <div className="forum-user-card-motion">
      <div className={cn("forum-user-card", coverSrc && "has-cover")}>
        <div className="forum-user-card-background" aria-hidden="true">{coverSrc ? <img src={coverSrc} alt="" className="forum-user-card-cover" /> : null}<div className="forum-user-card-wash" /></div>
        <div className="forum-user-card-content">
          <div className="forum-user-card-header">
            <Link to={profilePath} onClick={closeCard} className="forum-user-card-avatar rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("View profile")}>
              <ForumAuthorAvatar author={{ ...author, fullName: title, avatarUrl: avatarSrc ?? undefined, affiliationVerified: verified, fptAffiliationVerified: verified }} size="card" showVerifiedBadge={verified} />
            </Link>
            <div className="forum-user-card-identity min-w-0">
              <h2><Link to={profilePath} onClick={closeCard} className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</Link></h2>
              {profile?.publicHandle || author.publicHandle ? <p className="mt-0.5 truncate text-sm text-muted-foreground">@{profile?.publicHandle ?? author.publicHandle}</p> : null}
              <div className="mt-1"><AcademicIdentitySummary identity={identity} /></div>
            </div>
            {onFilterPosts ? <Button type="button" size="sm" variant="outline" className="forum-user-card-topic-filter h-8 gap-1.5 rounded-full" onClick={() => { closeCard(); onFilterPosts(); }}><Filter aria-hidden="true" className="h-3.5 w-3.5" />{authorTopicPostCount !== undefined ? `${authorTopicPostCount} ` : ""}{t("Posts in this topic")}</Button> : null}
          </div>
          <button type="button" aria-label={t("Close author profile preview")} title={t("Close author profile preview")} onClick={closeAndRestoreFocus} className="forum-user-card-close rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-4 w-4" /></button>
        {headline ? <p className="mt-3 line-clamp-2 text-sm leading-6">{headline}</p> : null}
        {profileLoading ? <div role="status" className="mt-3 h-8 rounded-md bg-muted/60" aria-label={t("Loading academic profile")} /> : null}
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
          {onReply ? <Button type="button" size="sm" variant="ghost" disabled={!canReply} className="h-8 gap-1.5 text-muted-foreground" onClick={() => { closeCard(); onReply(); }}><MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />{t("Reply")}</Button> : null}
        </div>
        </div>
      </div>
      </div>
    </div>
    </>,
    document.body,
  ) : null;

  return <>
    <ProfileTriggerLink
      ref={triggerRef}
      to={profilePath}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={present ? cardId : undefined}
      aria-label={t("View author profile")}
      onClick={handleClick}
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
