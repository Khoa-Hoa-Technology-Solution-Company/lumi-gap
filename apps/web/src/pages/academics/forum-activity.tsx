import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, BadgeCheck, BookOpen, CheckCircle2, Heart, List, MessageSquare, Reply, Settings2, UserRound } from "lucide-react";
import type { ForumActivityFilter, PublicForumActivityItem } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { useAcademicAvatar, useAcademicCover, usePublicAcademicProfile, usePublicAcademicProfileByHandle } from "@/features/academic-profile/hooks/use-academic-profile";
import { stripMarkdown } from "@/features/forum/utils/forum-helpers";
import { FORUM_REACTIONS } from "@/features/forum/utils/forum-reactions";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";

const filters: Array<{ value: ForumActivityFilter; label: string; icon: typeof List }> = [
  { value: "all", label: "All activity", icon: List },
  { value: "topics", label: "Topics", icon: MessageSquare },
  { value: "replies", label: "Replies", icon: Reply },
  { value: "reactions", label: "Reactions given", icon: Heart },
];
const itemHref = (item: PublicForumActivityItem) => `/forum/${encodeURIComponent(item.topicSlug)}${item.postNumber > 1 ? `/${item.postNumber}` : ""}`;

function ActivityItem({ item, compact = false }: { item: PublicForumActivityItem; compact?: boolean }) {
  const { t, language } = useI18n();
  const reaction = FORUM_REACTIONS.find((entry) => entry.value === item.reaction);
  const Icon = item.kind === "topic" ? MessageSquare : item.kind === "reply" ? Reply : Heart;
  const label = item.kind === "topic" ? "Created a topic" : item.kind === "reply" ? "Posted a reply" : "Reacted to a post";
  return <article className={`profile-activity-item ${compact ? "is-compact" : ""}`}>
    {!compact ? <span className={`profile-activity-kind is-${item.kind}`} aria-hidden="true">{reaction ? reaction.emoji : <Icon />}</span> : null}
    <div className="min-w-0 flex-1">
      <div className="profile-activity-item-meta">
        {!compact ? <span>{t(label)}</span> : null}
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" })}</time>
        {item.reactionCount > 0 ? <span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="h-3.5 w-3.5 text-rose-500" />{item.reactionCount}</span> : null}
        {item.accepted ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300" title={t("Accepted by question author")}><CheckCircle2 className="h-3.5 w-3.5" />{t("Accepted response")}</span> : null}
      </div>
      <Link to={itemHref(item)} className="profile-activity-topic">{item.topicTitle}</Link>
      {!compact && item.excerpt ? <p className="profile-activity-excerpt">{stripMarkdown(item.excerpt)}</p> : null}
      {item.communityName && item.communitySlug ? <Link to={`/forum?community=${encodeURIComponent(item.communitySlug)}`} className="profile-activity-community">{item.communityName}</Link> : null}
    </div>
  </article>;
}

export function ForumActivityPage({ summary = false }: { summary?: boolean }) {
  const { t, language } = useI18n();
  const { handle = "", userId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewerId = useAuthStore((state) => state.user?.id);
  const byHandle = usePublicAcademicProfileByHandle(handle);
  const byId = usePublicAcademicProfile(handle ? "" : userId);
  const profileQuery = handle ? byHandle : byId;
  const profile = profileQuery.data;
  const avatar = useAcademicAvatar(profile?.avatarUrl);
  const cover = useAcademicCover(profile?.coverUrl);
  const selectedFilter = filters.find((entry) => entry.value === searchParams.get("filter"))?.value ?? "all";
  const rawPage = Number(searchParams.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
  const activity = useQuery({
    queryKey: ["academic-profile", "forum-activity", profile?.userId, viewerId ?? "anonymous", summary ? "all" : selectedFilter, summary ? 1 : page],
    queryFn: ({ signal }) => academicProfileApi.forumActivity(profile!.userId, summary ? "all" : selectedFilter, summary ? 1 : page, signal),
    enabled: Boolean(profile), staleTime: 30_000,
  });
  const base = profile?.publicHandle ? `/u/${encodeURIComponent(profile.publicHandle)}` : `/academics/${encodeURIComponent(userId)}`;
  if (profile?.publicHandle && handle && handle !== profile.publicHandle) return <Navigate to={`${base}/${summary ? "summary" : "activity"}${summary ? "" : `?${searchParams}`}`} replace />;
  if (profileQuery.isLoading) return <div className="profile-forum-workspace"><div className="profile-forum-page animate-pulse h-[600px]" role="status" aria-label={t("Loading academic profile")} /></div>;
  if (profileQuery.isError || !profile) return <div className="profile-forum-workspace"><div className="profile-forum-page py-16 text-center"><h1 className="text-xl font-semibold">{t("Academic profile unavailable")}</h1><Button variant="outline" className="mt-4" onClick={() => void profileQuery.refetch()}>{t("Retry")}</Button></div></div>;
  const stats = activity.data?.stats;
  const statisticItems = stats ? [
    { value: stats.topicsCreated, label: "Topics created", filter: "topics" },
    { value: stats.repliesCreated, label: "Replies posted", filter: "replies" },
    { value: stats.reactionsGiven, label: "Reactions given", filter: "reactions", heart: true },
    { value: stats.reactionsReceived, label: "Reactions received", heart: true },
    { value: stats.acceptedResponses, label: "Accepted responses" },
    { value: stats.topicViews, label: "Views on topics" },
  ] : [];
  const number = (value: number) => new Intl.NumberFormat(language, { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
  const date = (value: string) => new Date(value).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" });
  return <div className="profile-forum-workspace">
    <div className="profile-forum-page">
      <Link to="/forum" className="profile-forum-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("Research Forum")}</Link>
      <header>
        <div className={`profile-forum-cover ${cover ? "has-image" : ""}`}>
          {cover ? <img src={cover} alt="" /> : <BookOpen aria-hidden="true" />}
        </div>
        <div className="profile-forum-identity">
          <div className="profile-forum-avatar">{avatar ? <img src={avatar} alt={profile.displayName} /> : <span>{profile.displayName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>}</div>
          <div className="min-w-0 flex-1">
            <h1>{profile.displayName}{profile.verificationStatus === "VERIFIED" ? <BadgeCheck className="h-5 w-5 text-emerald-600" aria-label={t("Academic identity verified")} /> : null}</h1>
            {profile.publicHandle ? <p className="profile-forum-handle">@{profile.publicHandle}</p> : null}
            {profile.affiliation.institutionName ? <p className="mt-1 text-sm text-muted-foreground">{[profile.affiliation.positionTitle ?? profile.positionTitle, profile.affiliation.institutionName].filter(Boolean).join(" · ")}</p> : null}
            {profile.headline || profile.biography ? <p className="profile-forum-bio">{profile.headline || profile.biography}</p> : null}
          </div>
          {viewerId === profile.userId ? <Button asChild variant="outline" className="rounded-full"><Link to="/settings/profile"><Settings2 className="h-4 w-4" />{t("Edit profile")}</Link></Button> : <Button asChild variant="outline" className="rounded-full"><Link to={base}><UserRound className="h-4 w-4" />{t("Academic profile")}</Link></Button>}
        </div>
        <div className="profile-forum-meta">
          <span>{t("Joined")} <time dateTime={stats?.joinedAt ?? profile.createdAt}>{date(stats?.joinedAt ?? profile.createdAt)}</time></span>
          {stats?.lastContributionAt ? <span>{t("Last contribution")} <time dateTime={stats.lastContributionAt}>{date(stats.lastContributionAt)}</time></span> : null}
          <span>{t("Community points")} <strong>{number(profile.points)}</strong></span>
        </div>
        <nav className="profile-forum-tabs" aria-label={t("Member profile navigation")}>
          <Link to={`${base}/summary`} aria-current={summary ? "page" : undefined}><UserRound />{t("Summary")}</Link>
          <Link to={`${base}/activity`} aria-current={!summary ? "page" : undefined}><Activity />{t("Activity")}</Link>
          <Link to={base}><BookOpen />{t("Academic profile")}</Link>
        </nav>
      </header>
      {activity.isLoading ? <div role="status" className="space-y-5 py-8" aria-label={t("Loading forum activity")}><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-32 animate-pulse rounded bg-muted" /></div> : activity.isError ? <div role="alert" className="py-10 text-center"><p>{t("Could not load forum activity.")}</p><Button variant="outline" className="mt-4" onClick={() => void activity.refetch()}>{t("Retry")}</Button></div> : summary ? <>
        <section className="profile-forum-statistics" aria-labelledby="member-statistics">
          <h2 id="member-statistics">{t("Statistics")}</h2>
          <div className="profile-forum-stats">{statisticItems.map((item) => {
            const content = <><strong>{number(item.value)}</strong>{item.heart ? <Heart className="h-4 w-4 text-rose-500" aria-hidden="true" /> : null}<span>{t(item.label)}</span></>;
            return item.filter ? <Link key={item.label} to={`${base}/activity?filter=${item.filter}`}>{content}</Link> : <div key={item.label}>{content}</div>;
          })}</div>
        </section>
        <div className="profile-forum-top-grid">{([{ title: "Top replies", items: activity.data?.topReplies ?? [], filter: "replies" }, { title: "Top topics", items: activity.data?.topTopics ?? [], filter: "topics" }]).map((section) => <section key={section.title}>
          <h2>{t(section.title)}</h2>
          {section.items.length ? section.items.map((item) => <ActivityItem key={item.id} item={item} compact />) : <p className="py-5 text-sm text-muted-foreground">{t("No forum contributions yet.")}</p>}
          <Link to={`${base}/activity?filter=${section.filter}`} className="profile-forum-view-all">{t("View all")}</Link>
        </section>)}</div>
      </> : <div className="profile-forum-activity-layout">
        <nav className="profile-activity-filters" aria-label={t("Activity filters")}>{filters.map(({ value, label, icon: Icon }) => <Link key={value} to={`${base}/activity${value === "all" ? "" : `?filter=${value}`}`} aria-current={selectedFilter === value ? "page" : undefined}><Icon aria-hidden="true" />{t(label)}</Link>)}</nav>
        <section className="min-w-0" aria-label={t("Forum activity")}>
          <div className="profile-activity-feed-heading"><h2>{t(filters.find((entry) => entry.value === selectedFilter)!.label)}</h2><span>{number(activity.data?.meta.total ?? 0)}</span></div>
          {activity.data?.items.length ? activity.data.items.map((item) => <ActivityItem key={`${item.kind}-${item.id}`} item={item} />) : <div className="profile-activity-empty"><MessageSquare aria-hidden="true" /><p>{t("No activity to show in this section.")}</p><Link to="/forum">{t("Explore discussions")}</Link></div>}
          {(activity.data?.meta.totalPages ?? 1) > 1 ? <nav className="profile-activity-pagination" aria-label={t("Activity pages")}>
            <Button variant="outline" disabled={page <= 1} onClick={() => { const params = new URLSearchParams(searchParams); params.set("page", String(page - 1)); setSearchParams(params); }}>{t("Previous")}</Button>
            <span>{page} / {activity.data?.meta.totalPages}</span>
            <Button variant="outline" disabled={page >= (activity.data?.meta.totalPages ?? 1)} onClick={() => { const params = new URLSearchParams(searchParams); params.set("page", String(page + 1)); setSearchParams(params); }}>{t("Next")}</Button>
          </nav> : null}
        </section>
      </div>}
    </div>
  </div>;
}
