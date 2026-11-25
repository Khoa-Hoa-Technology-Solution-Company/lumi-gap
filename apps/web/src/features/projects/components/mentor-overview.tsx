import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Compass,
  FileText,
  Inbox,
  Layers3,
  ListTodo,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { MentorWorkQuery, MentorWorkspaceData, NotificationItem } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { reviewsApi, type ReviewCenterItem } from "@/features/reviews";
import {
  getNotificationDestination,
  notificationsApi,
  useMarkNotificationRead,
} from "@/features/notifications";
import { academicSupportApi } from "../api/academic-support.api";
import { MentorWorkRows } from "./mentor-work-queue";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import "../mentor-overview.css";

const KNOWN_ARTIFACTS = new Set([
  "RESEARCH_PAPER",
  "LITERATURE_REVIEW",
  "RESEARCH_PROPOSAL",
  "METHODOLOGY",
  "SOFTWARE_RESEARCH_PROJECT",
  "MANUSCRIPT",
  "THESIS_CHAPTER",
  "THESIS_DRAFT",
  "GAP_ANALYSIS",
  "EVIDENCE_SYNTHESIS",
  "RESEARCH_PLAN",
  "GENERAL_REPORT",
]);

function formatRelativeTime(dateStr: string, language: string): string {
  try {
    const d = new Date(dateStr);
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
    const isVi = language === "vi";
    if (diffMins < 1) return isVi ? "Vừa xong" : "Just now";
    if (diffMins < 60) return isVi ? `${diffMins} phút trước` : `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return isVi ? `${diffHrs} giờ trước` : `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return isVi ? `${diffDays} ngày trước` : `${diffDays}d ago`;
    return d.toLocaleDateString(language, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function reviewStatusTone(status: string): string {
  if (status === "COMPLETED") return "done";
  if (["REQUESTED", "REVISION_REQUESTED"].includes(status)) return "attention";
  if (["DECLINED", "CANCELLED", "EXPIRED"].includes(status)) return "muted";
  return "active";
}

function reviewItemHref(item: ReviewCenterItem): string {
  if (item.assignment?.id && ["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED"].includes(item.status)) {
    return mentorWorkspaceDestination(`/reviews/${encodeURIComponent(item.assignment.id)}`);
  }
  return mentorWorkspaceDestination(`/review-requests/${encodeURIComponent(item.id)}`);
}

export function MentorOverview({ data, fetching, refresh, openWork }: {
  data: MentorWorkspaceData;
  fetching: boolean;
  refresh: () => void;
  openWork: (query: Partial<MentorWorkQuery>) => void;
}) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actorId = useAuthStore(state => state.user?.id);
  const markRead = useMarkNotificationRead();

  const reviewCenter = useQuery({
    queryKey: ["review-center", actorId],
    queryFn: () => reviewsApi.center(),
    enabled: Boolean(actorId),
    retry: false,
    staleTime: 30_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["review-templates", actorId],
    queryFn: () => reviewsApi.templates(),
    enabled: Boolean(actorId),
    retry: false,
    staleTime: 60_000,
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", actorId],
    queryFn: () => notificationsApi.list(),
    enabled: Boolean(actorId),
    retry: false,
    staleTime: 30_000,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ["academic-support", "opportunities", "overview", actorId],
    queryFn: () => academicSupportApi.opportunities({ page: 1, pageSize: 3 }),
    enabled: Boolean(actorId),
    retry: false,
    staleTime: 60_000,
  });

  const { summary } = data;
  const completedCount = summary.completed ?? 0;
  const waitingCount = summary.waiting ?? 0;
  const sharedResourcesCount = summary.sharedResources ?? 0;
  const totalStudents = summary.totalStudents ?? data.projects.reduce((acc, p) => acc + p.teamSize, 0);

  const reviewStats = useMemo(() => {
    const incoming = reviewCenter.data?.incoming ?? [];
    const sent = reviewCenter.data?.sent ?? [];
    const active = incoming.filter(i => ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED"].includes(i.status));
    const completed = new Map([...incoming, ...sent].filter(i => i.status === "COMPLETED").map(i => [i.id, i]));
    const spotlight = [...active, ...[...completed.values()]].slice(0, 4);
    return { activeCount: active.length, completedCount: completed.size, spotlight };
  }, [reviewCenter.data]);

  const notifications = useMemo(() => {
    const items = notificationsQuery.data ?? [];
    const unread = items.filter(n => !n.isRead).length;
    return { items: items.slice(0, 5), unread, total: items.length };
  }, [notificationsQuery.data]);

  const opportunities = opportunitiesQuery.data?.items ?? [];
  const opportunitiesTotal = opportunitiesQuery.data?.meta?.total ?? opportunities.length;
  const templatesCount = templatesQuery.data?.length ?? 0;

  const workloadTotal = summary.needsResponse + waitingCount + completedCount;
  const donePct = workloadTotal > 0 ? Math.round((completedCount / workloadTotal) * 100) : 0;
  const waitingPct = workloadTotal > 0 ? Math.round((waitingCount / workloadTotal) * 100) : 0;
  const pendingPct = workloadTotal > 0 ? Math.max(0, 100 - donePct - waitingPct) : 0;

  const handleRefreshAll = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: ["review-center"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["academic-support", "opportunities", "overview"] });
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead && item.type !== "SCREENING_DISCUSSION_MESSAGE") {
      markRead.mutate(item.id);
    }
    const destination = getNotificationDestination(item, false);
    navigate(destination ? mentorWorkspaceDestination(destination) : "/mentor-workspace?view=notifications");
  };

  const statistics = [
    {
      key: "needsResponse",
      icon: ListTodo,
      value: summary.needsResponse,
      hint: summary.manuscripts > 0
        ? t("mentorWorkspace.manuscriptSubset", { count: summary.manuscripts })
        : summary.needsResponse === 0
          ? t("mentorWorkspace.overview.allCaughtUpSub")
          : undefined,
      query: { status: "ACTIONABLE" } as const,
      highlight: summary.needsResponse > 0,
    },
    {
      key: "manuscripts",
      icon: FileText,
      value: summary.manuscripts,
      hint: reviewCenter.data
        ? t("mentorWorkspace.overview.reviewsSub", {
            inProgress: reviewStats.activeCount,
            completed: reviewStats.completedCount,
          })
        : undefined,
      query: { kind: "REVIEW", status: "ACTIONABLE" } as const,
      highlight: summary.manuscripts > 0,
    },
    {
      key: "projects",
      icon: Users,
      value: summary.projects,
      hint: summary.projects > 0
        ? t("mentorWorkspace.overview.studentsSub", {
            students: totalStudents,
            shared: sharedResourcesCount,
          })
        : undefined,
      href: "/mentor-workspace?view=projects",
      highlight: false,
    },
    {
      key: "invitations",
      icon: Inbox,
      value: summary.invitations,
      hint: opportunitiesTotal > 0
        ? t("mentorWorkspace.overview.opportunitiesSub", { count: opportunitiesTotal })
        : t("mentorWorkspace.overview.noNewInvitesSub"),
      href: "/mentor-workspace?view=incoming",
      highlight: summary.invitations > 0,
    },
  ];

  const recentWork = data.recentActivity ?? [];

  return (
    <div className="mentor-overview">
      <header className="mentor-overview-header">
        <div className="min-w-0">
          <h1>{t("mentorWorkspace.dashboardTitle")}</h1>
          <p className="mentor-overview-intro">{t("mentorWorkspace.dashboardHint")}</p>
        </div>
        <div className="mentor-overview-sync">
          <span role="status" aria-live="polite">
            {fetching ? (
              t("mentorWorkspace.updating")
            ) : (
              <>
                {t("mentorWorkspace.updatedAt")}{" "}
                <time dateTime={data.generatedAt}>
                  {new Date(data.generatedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}
                </time>
              </>
            )}
          </span>
          <Button
            size="icon"
            variant="outline"
            disabled={fetching}
            onClick={handleRefreshAll}
            aria-label={t("mentorWorkspace.refresh")}
          >
            <RefreshCw size={15} className={fetching ? "animate-spin" : undefined} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <nav className="mentor-overview-statistics" aria-label={t("mentorWorkspace.overview")}>
        {statistics.map(({ key, icon: Icon, value, hint, href, query, highlight }) => {
          const content = (
            <>
              <div className="mentor-stat-top">
                <span className="mentor-stat-label">
                  <Icon size={15} aria-hidden="true" />
                  <span>{t(`mentorWorkspace.metric.${key}`)}</span>
                </span>
                <ArrowRight size={13} className="mentor-stat-arrow" aria-hidden="true" />
              </div>
              <div className="mentor-stat-bottom">
                <strong data-highlight={highlight ? "true" : undefined}>{value}</strong>
                {hint ? <small className="mentor-stat-sub">{hint}</small> : null}
              </div>
            </>
          );
          return href ? (
            <Link key={key} to={href} className="mentor-stat-card">
              {content}
            </Link>
          ) : (
            <button key={key} type="button" className="mentor-stat-card" onClick={() => openWork(query!)}>
              {content}
            </button>
          );
        })}
      </nav>

      {summary.overdue > 0 || summary.blocked > 0 ? (
        <div className="mentor-overview-alerts" aria-label={t("mentorWorkspace.attentionFlags")}>
          {summary.overdue > 0 ? (
            <button type="button" onClick={() => openWork({ status: "OVERDUE", sort: "deadline" })}>
              <Clock3 size={15} aria-hidden="true" />
              <span>{t("mentorWorkspace.overdueRequests", { count: summary.overdue })}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : null}
          {summary.blocked > 0 ? (
            <button type="button" onClick={() => openWork({ status: "BLOCKED" })}>
              <ShieldAlert size={15} aria-hidden="true" />
              <span>{t("mentorWorkspace.blockedRequests", { count: summary.blocked })}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mentor-overview-columns">
        <div className="mentor-overview-main-col">
          <section className="mentor-overview-priorities" aria-labelledby="mentor-priorities-title">
            <header className="mentor-overview-section-heading">
              <div>
                <h2 id="mentor-priorities-title">{t("mentorWorkspace.priorities")}</h2>
                <p>{t("mentorWorkspace.prioritiesHint")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => openWork({ status: "ACTIONABLE" })}>
                {t("mentorWorkspace.allWork")}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </header>

            {data.items.length ? (
              <>
                <MentorWorkRows items={data.items} />
                <div className="mentor-overview-list-footer">
                  <span>{t("mentorWorkspace.showingWork", { shown: data.items.length, total: data.meta.total })}</span>
                  {data.meta.total > data.items.length ? (
                    <Button variant="ghost" size="sm" onClick={() => openWork({ status: "ACTIONABLE" })}>
                      {t("mentorWorkspace.viewAll")}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mentor-overview-empty">
                <CheckCircle2 size={26} aria-hidden="true" />
                <h3>{t("mentorWorkspace.emptyPriorities")}</h3>
                <p>{t("mentorWorkspace.caughtUpHint")}</p>
                <Button variant="outline" size="sm" onClick={() => openWork({ status: "ALL" })}>
                  {t("mentorWorkspace.browseWorkHistory")}
                </Button>
              </div>
            )}
          </section>

          <section className="mentor-overview-card-section" aria-labelledby="mentor-progress-title">
            <header className="mentor-overview-section-heading">
              <div>
                <h2 id="mentor-progress-title">{t("mentorWorkspace.overview.progressTitle")}</h2>
                <p>{t("mentorWorkspace.overview.progressHint")}</p>
              </div>
              <div className="mentor-section-inline-links">
                {templatesCount > 0 ? (
                  <Link className="mentor-inline-pill-link" to="/mentor-workspace?view=templates">
                    <Layers3 size={13} aria-hidden="true" />
                    <span>{t("mentorWorkspace.overview.templatesBadge", { count: templatesCount })}</span>
                  </Link>
                ) : null}
                <Link className="mentor-inline-text-link" to="/mentor-workspace?view=reviews">
                  <span>{t("mentorWorkspace.overview.openReviewCenter")}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </header>

            <div className="mentor-overview-surface">
              <div className="mentor-breakdown-grid">
                <button
                  type="button"
                  className="mentor-breakdown-cell"
                  onClick={() => openWork({ status: "ACTIONABLE" })}
                >
                  <span className="mentor-breakdown-dot" data-tone="pending" />
                  <div>
                    <strong>{summary.needsResponse}</strong>
                    <span>{t("mentorWorkspace.overview.statPending")}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="mentor-breakdown-cell"
                  onClick={() => openWork({ status: "WAITING" })}
                >
                  <span className="mentor-breakdown-dot" data-tone="waiting" />
                  <div>
                    <strong>{waitingCount}</strong>
                    <span>{t("mentorWorkspace.overview.statWaiting")}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="mentor-breakdown-cell"
                  onClick={() => openWork({ status: "DONE" })}
                >
                  <span className="mentor-breakdown-dot" data-tone="done" />
                  <div>
                    <strong>{completedCount}</strong>
                    <span>{t("mentorWorkspace.overview.statCompleted")}</span>
                  </div>
                </button>
                <Link className="mentor-breakdown-cell" to="/mentor-workspace?view=resources">
                  <span className="mentor-breakdown-dot" data-tone="shared" />
                  <div>
                    <strong>{sharedResourcesCount}</strong>
                    <span>{t("mentorWorkspace.overview.statShared")}</span>
                  </div>
                </Link>
              </div>

              {workloadTotal > 0 ? (
                <div className="mentor-progress-bar-wrap" aria-hidden="true">
                  <div className="mentor-progress-bar">
                    {donePct > 0 ? <span className="mentor-progress-seg" data-tone="done" style={{ width: `${donePct}%` }} /> : null}
                    {waitingPct > 0 ? <span className="mentor-progress-seg" data-tone="waiting" style={{ width: `${waitingPct}%` }} /> : null}
                    {pendingPct > 0 ? <span className="mentor-progress-seg" data-tone="pending" style={{ width: `${pendingPct}%` }} /> : null}
                  </div>
                </div>
              ) : null}

              {reviewStats.spotlight.length > 0 ? (
                <div className="mentor-subblock">
                  <h3 className="mentor-subblock-title">
                    <BookOpenCheck size={14} aria-hidden="true" />
                    <span>{t("mentorWorkspace.overview.academicReviews")}</span>
                  </h3>
                  <ul className="mentor-compact-list">
                    {reviewStats.spotlight.map(item => {
                      const typeKey = item.artifact.type;
                      const typeLabel = typeKey && KNOWN_ARTIFACTS.has(typeKey)
                        ? t(`reviewTemplates.artifact.${typeKey}`)
                        : typeKey?.replaceAll("_", " ") ?? t("reviewTemplates.anyArtifact");
                      return (
                        <li key={item.id}>
                          <Link to={reviewItemHref(item)} className="mentor-compact-row">
                            <div className="min-w-0 flex-1">
                              <div className="mentor-compact-row-top">
                                <span className="mentor-compact-title">{item.artifact.title}</span>
                                <span className="mentor-status-pill" data-tone={reviewStatusTone(item.status)}>
                                  {t(`reviewCenter.status.${item.status}`)}
                                </span>
                              </div>
                              <p className="mentor-compact-meta">
                                <span>{typeLabel}</span>
                                {item.artifact.revisionNumber ? (
                                  <>
                                    <span>·</span>
                                    <span>{t("reviewCenter.revision", { version: item.artifact.revisionNumber })}</span>
                                  </>
                                ) : null}
                                {item.requester?.fullName ? (
                                  <>
                                    <span>·</span>
                                    <span>{item.requester.fullName}</span>
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <ArrowUpRight size={15} className="mentor-compact-arrow" aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : recentWork.length > 0 ? (
                <div className="mentor-subblock">
                  <h3 className="mentor-subblock-title">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{t("mentorWorkspace.overview.recentCompleted")}</span>
                  </h3>
                  <ul className="mentor-compact-list">
                    {recentWork.map(item => (
                      <li key={item.id}>
                        <Link to={mentorWorkspaceDestination(item.href)} className="mentor-compact-row">
                          <div className="min-w-0 flex-1">
                            <div className="mentor-compact-row-top">
                              <span className="mentor-compact-title">{item.title}</span>
                              <span className="mentor-status-pill" data-tone={item.status === "DONE" ? "done" : "waiting"}>
                                {t(`mentorWorkspace.status.${item.status}`)}
                              </span>
                            </div>
                            <p className="mentor-compact-meta">
                              <span>{item.projectTitle}</span>
                              <span>·</span>
                              <span>{formatRelativeTime(item.updatedAt, language)}</span>
                            </p>
                          </div>
                          <ArrowUpRight size={15} className="mentor-compact-arrow" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          {notificationsQuery.data ? (
            <section className="mentor-overview-card-section" aria-labelledby="mentor-notifications-title">
              <header className="mentor-overview-section-heading">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 id="mentor-notifications-title">{t("mentorWorkspace.overview.notificationsTitle")}</h2>
                  {notifications.unread > 0 ? (
                    <Badge variant="secondary" className="text-xs font-semibold text-primary">
                      {t("mentorWorkspace.overview.unreadBadge", { count: notifications.unread })}
                    </Badge>
                  ) : null}
                </div>
                <Link className="mentor-inline-text-link" to="/mentor-workspace?view=notifications">
                  <span>{t("mentorWorkspace.overview.viewAllNotifications")}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </header>

              <div className="mentor-overview-surface">
                {notifications.items.length > 0 ? (
                  <ul className="mentor-notif-list">
                    {notifications.items.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="mentor-notif-row"
                          data-unread={!item.isRead ? "true" : undefined}
                          onClick={() => handleNotificationClick(item)}
                        >
                          <span className="mentor-notif-dot" data-unread={!item.isRead ? "true" : undefined} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="mentor-notif-top">
                              <span className="mentor-notif-title">{item.title}</span>
                              <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt, language)}</time>
                            </div>
                            {item.message ? <p className="mentor-notif-body">{item.message}</p> : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mentor-surface-empty">
                    <Bell size={18} aria-hidden="true" />
                    <span>{t("mentorWorkspace.overview.noNotifications")}</span>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <div className="mentor-overview-side-col">
          <section className="mentor-overview-teams" aria-labelledby="mentor-teams-title">
            <header className="mentor-overview-section-heading">
              <div>
                <h2 id="mentor-teams-title">{t("mentorWorkspace.recentTeams")}</h2>
                <p>{t("mentorWorkspace.recentTeamsHint")}</p>
              </div>
            </header>

            {data.projects.length ? (
              <div className="mentor-overview-team-panel">
                <ul className="mentor-overview-team-list">
                  {data.projects.slice(0, 4).map(project => {
                    const roleKey = project.mentorRole && ["PRIMARY", "SECONDARY", "UNASSIGNED"].includes(project.mentorRole)
                      ? `mentorWorkspace.overview.role.${project.mentorRole}`
                      : null;
                    return (
                      <li key={project.id}>
                        <div className="mentor-overview-team-heading">
                          <Link to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}`)}>
                            <span>{project.title}</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                          <div className="mentor-team-badges">
                            <Badge variant="secondary" className="text-xs font-medium">
                              {t(`mentorWorkspace.projectStatus.${project.status}`)}
                            </Badge>
                            {roleKey ? (
                              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                {t(roleKey)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <p>
                          <Users size={13} aria-hidden="true" />
                          <span>{t("mentorWorkspace.team", { name: project.teamLead, count: project.teamSize })}</span>
                        </p>

                        {project.researchStage || project.researchField ? (
                          <p>
                            <BookOpen size={13} aria-hidden="true" />
                            <span>
                              {[
                                project.researchStage ? t(`mentorWorkspace.stage.${project.researchStage}`) : null,
                                project.researchField,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          </p>
                        ) : null}

                        {(project.startedAt || (project.completedCount ?? 0) > 0 || (project.sharedCount ?? 0) > 0) ? (
                          <div className="mentor-team-pulse-pills">
                            {project.startedAt ? (
                              <span>
                                {t("mentorWorkspace.overview.sinceDate", {
                                  date: new Date(project.startedAt).toLocaleDateString(language, {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  }),
                                })}
                              </span>
                            ) : null}
                            {(project.completedCount ?? 0) > 0 ? (
                              <span>{t("mentorWorkspace.overview.completedShort", { count: project.completedCount ?? 0 })}</span>
                            ) : null}
                            {(project.sharedCount ?? 0) > 0 ? (
                              <span>{t("mentorWorkspace.overview.sharedShort", { count: project.sharedCount ?? 0 })}</span>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mentor-overview-team-footer">
                          <div className="mentor-team-footer-left">
                            <time dateTime={project.updatedAt}>
                              {t("mentorWorkspace.teamUpdated", {
                                date: new Date(project.updatedAt).toLocaleDateString(language, {
                                  day: "numeric",
                                  month: "short",
                                }),
                              })}
                            </time>
                            {project.canChat !== false ? (
                              <Link
                                className="mentor-team-chat-link"
                                to={mentorWorkspaceDestination(`/projects/${encodeURIComponent(project.id)}?tab=chat&channel=mentors`)}
                              >
                                <MessageSquare size={12} aria-hidden="true" />
                                <span>{t("mentorWorkspace.overview.chatShortcut")}</span>
                              </Link>
                            ) : null}
                          </div>
                          {project.pendingCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => openWork({ projectId: project.id, status: "ACTIONABLE" })}
                            >
                              {t("mentorWorkspace.pendingCount", { count: project.pendingCount })}
                              <ArrowRight size={13} aria-hidden="true" />
                            </button>
                          ) : (
                            <span>{t("mentorWorkspace.noRequests")}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {data.projectMeta.total > 0 ? (
                  <Link className="mentor-overview-all-teams" to="/mentor-workspace?view=projects">
                    <span>{t("mentorWorkspace.allTeams", { count: data.projectMeta.total })}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="mentor-overview-empty">
                <Users size={24} aria-hidden="true" />
                <h3>{t("mentorWorkspace.emptyProjects")}</h3>
                <p>{t("mentorWorkspace.startMentoringHint")}</p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/mentor-workspace?view=incoming">{t("mentorWorkspace.invitations")}</Link>
                </Button>
              </div>
            )}
          </section>

          {opportunitiesQuery.data ? (
            <section className="mentor-overview-opportunities" aria-labelledby="mentor-opportunities-title">
              <header className="mentor-overview-section-heading">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="mentor-opportunities-title">{t("mentorWorkspace.overview.opportunitiesTitle")}</h2>
                  {opportunitiesTotal > 0 ? (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {t("mentorWorkspace.overview.opportunitiesCount", { count: opportunitiesTotal })}
                    </Badge>
                  ) : null}
                </div>
              </header>

              <div className="mentor-overview-team-panel">
                {opportunities.length > 0 ? (
                  <ul className="mentor-opportunity-list">
                    {opportunities.map(item => (
                      <li key={item.id}>
                        <Link to="/mentor-workspace?view=discover" className="mentor-opportunity-row">
                          <div className="mentor-opportunity-head">
                            <span className="mentor-opportunity-title">{item.title}</span>
                            <ArrowUpRight size={14} className="mentor-compact-arrow" aria-hidden="true" />
                          </div>
                          {item.mentoringNeeds || item.summary ? (
                            <p className="mentor-opportunity-desc">{item.mentoringNeeds || item.summary}</p>
                          ) : null}
                          {item.researchAreas?.length ? (
                            <div className="mentor-opportunity-tags">
                              {item.researchAreas.slice(0, 3).map(area => (
                                <span key={area} className="mentor-opportunity-tag">{area}</span>
                              ))}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mentor-surface-empty">
                    <Compass size={17} aria-hidden="true" />
                    <span>{t("mentorWorkspace.overview.noOpportunities")}</span>
                  </div>
                )}
                <Link className="mentor-overview-all-teams" to="/mentor-workspace?view=discover">
                  <span>{t("mentorWorkspace.overview.exploreAllTeams")}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
