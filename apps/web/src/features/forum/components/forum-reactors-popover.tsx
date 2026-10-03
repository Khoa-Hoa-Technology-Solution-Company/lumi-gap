import { useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import type { ForumReactionName, ForumReactionPeople, ForumReactionTarget, ForumReactionUser } from "../api/forum.api";
import { useForumReactionPeople } from "../hooks/use-forum";
import { FORUM_REACTIONS } from "../utils/forum-reactions";
import { formatForumNumber } from "../utils/forum-helpers";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumStatPopover } from "./forum-stat-popover";

type Counts = Record<ForumReactionName, number>;
type People = ForumReactionPeople["data"];
type PanelProps = { counts: Counts; people: People; filter?: ForumReactionName; onFilter: (reaction?: ForumReactionName) => void; loading?: boolean; error?: boolean; onRetry?: () => void; hasMore?: boolean; loadingMore?: boolean; onLoadMore?: () => void; missing?: number };

function PeoplePanel({ counts, people, filter, onFilter, loading, error, onRetry, hasMore, loadingMore, onLoadMore, missing = 0 }: PanelProps) {
  const { t, language } = useI18n();
  const panelId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = FORUM_REACTIONS.filter((reaction) => counts[reaction.value] > 0);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const tabs = [{ value: undefined, emoji: undefined, label: "All", count: total }, ...visible.map((reaction) => ({ ...reaction, count: counts[reaction.value] }))];
  return <>
    {total > 1 ? <div className="forum-reactor-tabs" role="tablist" aria-label={t("Reaction filters")}>
      {tabs.map((tab, index) => <button key={tab.value ?? "all"} ref={(node) => { tabRefs.current[index] = node; }} id={`${panelId}-tab-${tab.value ?? "all"}`} type="button" role="tab" aria-controls={panelId} aria-selected={filter === tab.value} tabIndex={filter === tab.value ? 0 : -1} aria-label={`${t(tab.label)} ${formatForumNumber(tab.count, language)}`} onClick={() => onFilter(tab.value)} onKeyDown={(event) => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : undefined;
        if (next !== undefined) { event.preventDefault(); onFilter(tabs[next]!.value); tabRefs.current[next]?.focus(); }
      }}>{tab.emoji ? <span aria-hidden="true">{tab.emoji}</span> : t(tab.label)}{tab.emoji ? <span className="tabular-nums text-muted-foreground">{formatForumNumber(tab.count, language)}</span> : null}</button>)}
    </div> : null}
    <div id={panelId} role={total > 1 ? "tabpanel" : undefined} aria-labelledby={total > 1 ? `${panelId}-tab-${filter ?? "all"}` : undefined} className="forum-reactor-list" onScroll={(event) => { const node = event.currentTarget; if (node.scrollHeight - node.clientHeight - node.scrollTop < 48 && hasMore && !loadingMore) onLoadMore?.(); }}>
      {loading ? <p role="status" className="forum-stat-popover-message">{t("Loading…")}</p> : <ul>
        {people.map((person) => {
          const reaction = FORUM_REACTIONS.find((item) => item.value === person.reaction)!;
          const identity = <><ForumAuthorAvatar author={person.user} size="xs" /><span className="min-w-0 truncate">{person.user.publicHandle ?? person.user.fullName}</span></>;
          return <li key={person.id} className="forum-reactor-row">
            {person.user.publicHandle ? <Link className="forum-reactor-identity hover:text-primary" to={`/${encodeURIComponent(person.user.publicHandle)}`} title={person.user.fullName}>{identity}</Link> : <span className="forum-reactor-identity" title={person.user.fullName}>{identity}</span>}
            <span aria-label={t(reaction.label)} title={t(reaction.label)} className="text-base">{reaction.emoji}</span>
          </li>;
        })}
      </ul>}
      {!loading && !error && !people.length ? <p className="forum-stat-popover-message">{t("No reactions yet")}</p> : null}
      {error ? <div role="alert" className="forum-stat-popover-message"><p>{t("Could not load reactions.")}</p><button type="button" className="mt-2 text-primary hover:underline" onClick={onRetry}>{t("Try again")}</button></div> : null}
      {hasMore && !error ? <button type="button" disabled={loadingMore} className="forum-reactor-more" onClick={onLoadMore}>{t(loadingMore ? "Loading…" : "Show more")}</button> : null}
      {missing > 0 ? <p className="forum-stat-popover-note">+{formatForumNumber(missing, language)} {t("more people reacted")}</p> : null}
    </div>
  </>;
}

function RemotePeople({ target, counts, filter, onFilter }: { target: ForumReactionTarget; counts: Counts; filter?: ForumReactionName; onFilter: PanelProps["onFilter"] }) {
  const query = useForumReactionPeople(target, filter);
  return <PeoplePanel counts={query.data?.pages[0]?.counts ?? counts} people={query.data?.pages.flatMap((page) => page.data) ?? []} filter={filter} onFilter={onFilter} loading={query.isLoading} error={query.isError || query.isFetchNextPageError} onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())} hasMore={query.hasNextPage} loadingMore={query.isFetchingNextPage} onLoadMore={() => void query.fetchNextPage()} />;
}

function PeopleContent({ target, counts, users, initialFilter }: { target?: ForumReactionTarget; counts: Counts; users?: Partial<Record<ForumReactionName, ForumReactionUser[]>>; initialFilter?: ForumReactionName }) {
  const [filter, setFilter] = useState(initialFilter);
  if (target) return <RemotePeople target={target} counts={counts} filter={filter} onFilter={setFilter} />;
  const people = FORUM_REACTIONS.filter((reaction) => !filter || filter === reaction.value).flatMap((reaction) => (users?.[reaction.value] ?? []).map((user) => ({ id: `${reaction.value}-${user.id}`, reaction: reaction.value, user })));
  const total = filter ? counts[filter] : Object.values(counts).reduce((sum, value) => sum + value, 0);
  return <PeoplePanel counts={counts} people={people} filter={filter} onFilter={setFilter} missing={Math.max(0, total - people.length)} />;
}

export function ForumReactorsPopover({ target, counts, users, initialFilter, trigger, triggerClassName, triggerLabel, title }: { target?: ForumReactionTarget; counts: Counts; users?: Partial<Record<ForumReactionName, ForumReactionUser[]>>; initialFilter?: ForumReactionName; trigger: ReactNode; triggerClassName?: string; triggerLabel?: string; title?: string }) {
  const { t } = useI18n();
  return <ForumStatPopover trigger={trigger} triggerClassName={triggerClassName} triggerLabel={triggerLabel} title={title} label={t("Who reacted")} className="forum-reactors-popover"><PeopleContent target={target} counts={counts} users={users} initialFilter={initialFilter} /></ForumStatPopover>;
}
