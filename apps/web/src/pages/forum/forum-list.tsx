import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  MessageSquare,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ForumPostView,
  useCommunities,
  useForumPosts,
} from "@/features/forum";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";

const PAGE_SIZE = 20;

function postMatchesQuery(post: ForumPostView, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const searchableText = [
    post.title,
    post.content,
    post.author.fullName,
    post.community?.name,
    ...post.tags,
    ...post.references.flatMap((reference) => [reference.title, reference.doi]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(normalizedQuery);
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d ago`;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "R";
}

function LinkedResearch({ post }: { post: ForumPostView }) {
  const reference = post.references[0];

  if (reference) {
    const title = reference.title || reference.doi || "Research reference";
    return (
      <div className="mt-4 flex min-w-0 items-start gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/55">
        <div className="mt-0.5 rounded-md border border-blue-100 bg-white p-1.5 text-blue-600 dark:border-blue-900/60 dark:bg-slate-950 dark:text-blue-400">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {reference.doi ? `DOI: ${reference.doi}` : "Linked academic reference"}
          </p>
        </div>
        {reference.verified ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified
          </span>
        ) : null}
      </div>
    );
  }

  const links = [
    post.linkedPaperId ? "Paper" : null,
    post.linkedResearchGapId ? "Research gap" : null,
    post.linkedProjectId ? "Project" : null,
  ].filter(Boolean);

  if (!links.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {links.map((label) => (
        <span key={label} className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
          <Link2 className="h-3.5 w-3.5" />
          {label} linked
        </span>
      ))}
    </div>
  );
}

function DiscussionRow({ post }: { post: ForumPostView }) {
  const isQuestion = post.type === "question";
  const isAccepted = Boolean(post.acceptedCommentId);
  const isVerifiedLecturer = post.author.academicVerificationStatus === "VERIFIED";

  return (
    <article className="group grid grid-cols-[42px_minmax(0,1fr)] gap-3 px-4 py-5 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/35 sm:grid-cols-[52px_minmax(0,1fr)] sm:gap-4 sm:px-5">
      <div className="flex flex-col items-center pt-1 text-slate-400" aria-label={`${post.voteScore} votes`}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
        <span className="my-0.5 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{post.voteScore}</span>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "h-5 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide",
              isQuestion
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300",
            )}
          >
            {isQuestion ? "Question" : "Discussion"}
          </Badge>
          {isAccepted ? (
            <Badge className="h-5 rounded border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700 shadow-none hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Accepted answer
            </Badge>
          ) : null}
          {post.community ? (
            <span className="ml-auto max-w-full truncate text-[11px] font-medium text-slate-500">
              {post.community.name}
            </span>
          ) : null}
        </div>

        <Link to={`/forum/${post.id}`} className="mt-2 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <h2 className="text-base font-bold leading-snug tracking-[-0.01em] text-slate-950 transition-colors group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300 sm:text-lg">
            {post.title}
          </h2>
        </Link>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{post.content}</p>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">
            {getInitials(post.author.fullName)}
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{post.author.fullName}</span>
          {isVerifiedLecturer ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verified Lecturer
            </span>
          ) : post.author.academicTitle ? (
            <span>{post.author.academicTitle}</span>
          ) : null}
          {post.author.institution ? <span className="truncate">· {post.author.institution}</span> : null}
          <span>· {formatRelativeTime(post.createdAt)}</span>
        </div>

        <LinkedResearch post={post} />

        {post.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 6).map((item) => (
              <span key={item} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                #{item}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {post.commentCount} {post.commentCount === 1 ? "response" : "responses"}
          </span>
          {post.references.length ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <BookOpen className="h-3.5 w-3.5" />
              {post.references.length} {post.references.length === 1 ? "reference" : "references"}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ForumListSkeleton() {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Loading discussions">
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid animate-pulse grid-cols-[42px_1fr] gap-4 px-5 py-6">
          <div className="h-16 rounded-lg bg-slate-100 dark:bg-slate-900" />
          <div className="space-y-3">
            <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-900" />
            <div className="h-5 w-4/5 rounded bg-slate-100 dark:bg-slate-900" />
            <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-900" />
            <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-900" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ForumListPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [tag, setTag] = useState("");
  const { data, isLoading, isError } = useForumPosts({
    page,
    pageSize: PAGE_SIZE,
    type: type || undefined,
    communityId: communityId || undefined,
    tag: tag || undefined,
  });
  const { data: communities } = useCommunities();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));

  const visiblePosts = useMemo(
    () => data?.data.filter((post) => postMatchesQuery(post, query)) ?? [],
    [data?.data, query],
  );
  const quickTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of data?.data ?? []) {
      for (const postTag of post.tags) {
        counts.set(postTag, (counts.get(postTag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 4)
      .map(([postTag]) => postTag);
  }, [data?.data]);
  const hasFilters = Boolean(query || type || communityId || tag);

  const resetFilters = () => {
    setQuery("");
    setType("");
    setCommunityId("");
    setTag("");
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{t("Academic exchange")}</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{t("Research Forum")}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            {t("Questions and evidence-led discussions connected to papers, research gaps, and projects.")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            <Link to="/communities"><Users className="mr-2 h-4 w-4" />{t("Communities")}</Link>
          </Button>
          {isAuthed ? (
            <Button asChild>
              <Link to="/forum/new"><Plus className="mr-2 h-4 w-4" />{t("New post")}</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section aria-label={t("Discussion filters")} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-zinc-950">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_190px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search discussions, keywords, or DOI")}
              className="h-10 pl-9 shadow-none"
            />
          </div>
          <select
            aria-label={t("Community")}
            className="h-10 rounded-md border bg-transparent px-3 text-sm"
            value={communityId}
            onChange={(event) => { setCommunityId(event.target.value); setPage(1); }}
          >
            <option value="">{t("All communities")}</option>
            {communities?.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
          </select>
          <select
            aria-label={t("Post type")}
            className="h-10 rounded-md border bg-transparent px-3 text-sm"
            value={type}
            onChange={(event) => { setType(event.target.value); setPage(1); }}
          >
            <option value="">{t("All post types")}</option>
            <option value="question">{t("Questions")}</option>
            <option value="discussion">{t("Discussions")}</option>
          </select>
        </div>
        <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2">
          {quickTags.length ? <span className="text-xs font-medium text-slate-500">{t("Quick tags:")}</span> : null}
          {quickTags.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setTag(tag === item ? "" : item); setPage(1); }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  tag === item
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:text-slate-400",
                )}
              >
                {item}
              </button>
            ))}
          {hasFilters ? (
            <button type="button" onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <X className="h-3.5 w-3.5" /> {t("Clear filters")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-zinc-950" aria-live="polite">
        {isLoading ? (
          <ForumListSkeleton />
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">{t("Could not load discussions.")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("Please check the backend connection and try again.")}</p>
          </div>
        ) : visiblePosts.length ? (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {visiblePosts.map((post) => <DiscussionRow key={post.id} post={post} />)}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">{t("No discussions match these filters.")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("Try a broader keyword or clear one of the filters.")}</p>
            {hasFilters ? <Button variant="outline" className="mt-5" onClick={resetFilters}>{t("Clear filters")}</Button> : null}
          </div>
        )}

        {data?.meta ? (
          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {t("Showing discussions")} {data.data.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, data.meta.total)} {t("of")} {data.meta.total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" />{t("Previous")}
              </Button>
              <span className="min-w-20 text-center font-medium text-slate-700 dark:text-slate-200">
                {t("Page")} {page} / {data.meta.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((current) => current + 1)}>
                {t("Next")}<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
