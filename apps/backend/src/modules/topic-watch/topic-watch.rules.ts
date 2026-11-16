import type { TopicWatchPhase } from "@trend/shared-types";

export const TOPIC_WATCH_DAILY_JOB = "topic-watch-daily";
export const TOPIC_WATCH_RUN_JOB = "topic-watch-run";

/** Backlog reads the works most worth having first; tracking reads the newest first. */
const BACKLOG_SORT = "cited_by_count:desc";
const TRACKING_SORT = "publication_date:desc";

/** Where a watch stands. Every field is stored, so the next run continues exactly here. */
export interface WatchPosition {
  phase: TopicWatchPhase;
  queryIndex: number;
  cursor: string | null;
  backlogInserted: number;
  backlogTargetPapers: number;
  windowFrom: string | null;
  windowStartedOn: string | null;
  lastWindowCompletedOn: string | null;
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBefore(day: string, days: number): string {
  return toDay(new Date(Date.parse(`${day}T00:00:00.000Z`) - days * 86_400_000));
}

/** Equal split of what is left, so a large entry cannot use up the day. One unit is the least an entry gets. */
export function fairShare(remaining: number, entriesLeft: number): number {
  return Math.max(1, Math.floor(remaining / Math.max(1, entriesLeft)));
}

function startOfQueries(position: WatchPosition): WatchPosition {
  return { ...position, queryIndex: 0, cursor: null };
}

/** For when a tag's rules changed: the stored cursor and window belong to queries that no longer exist. */
export function restartQueries(position: WatchPosition): WatchPosition {
  return { ...startOfQueries(position), windowFrom: null, windowStartedOn: null };
}

/**
 * Opens a tracking window when none is open. Null means there is nothing to read today: the entry was already caught
 * up today. The window reaches back past the last completed one, since OpenAlex can list a work days after its date.
 */
export function openWindow(position: WatchPosition, today: string, sinceDay: string, overlapDays: number): WatchPosition | null {
  if (position.phase !== "tracking" || position.windowFrom) return position;
  if (position.lastWindowCompletedOn === today) return null;
  return {
    ...startOfQueries(position),
    windowFrom: daysBefore(position.lastWindowCompletedOn ?? sinceDay, overlapDays),
    windowStartedOn: today,
  };
}

/** The OpenAlex request for the current position. */
export function pageRequest(position: WatchPosition, queries: readonly string[]): { filterExpression: string; sort: string; cursor: string } {
  const base = queries[position.queryIndex]!;
  const cursor = position.cursor ?? "*";
  return position.phase === "backlog"
    ? { filterExpression: base, sort: BACKLOG_SORT, cursor }
    : { filterExpression: `${base},from_publication_date:${position.windowFrom}`, sort: TRACKING_SORT, cursor };
}

/** New papers this watch may import from the next page, within the budget given to it. */
export function pageBudget(position: WatchPosition, budget: number): number {
  return position.phase === "backlog" ? Math.min(budget, Math.max(0, position.backlogTargetPapers - position.backlogInserted)) : budget;
}

function toTracking(position: WatchPosition): WatchPosition {
  return { ...startOfQueries(position), phase: "tracking", windowFrom: null, windowStartedOn: null };
}

/** A backlog with nothing left to import moves on, including a watch created with a target of 0. */
export function settleBacklog(position: WatchPosition): WatchPosition {
  return position.phase === "backlog" && position.backlogInserted >= position.backlogTargetPapers ? toTracking(position) : position;
}

export interface PageOutcome {
  inserted: number;
  nextCursor: string | null;
  isEmpty: boolean;
  /** The budget left out some of the page's missing works. The cursor stays, so the next run reads them. */
  cutShort: boolean;
}

/** Position after one page was imported. */
export function afterPage(position: WatchPosition, outcome: PageOutcome, queryCount: number): WatchPosition {
  const counted = position.phase === "backlog"
    ? { ...position, backlogInserted: position.backlogInserted + outcome.inserted }
    : position;
  if (outcome.cutShort) return settleBacklog(counted);
  if (outcome.nextCursor && !outcome.isEmpty) return settleBacklog({ ...counted, cursor: outcome.nextCursor });
  if (counted.queryIndex + 1 < queryCount) return settleBacklog({ ...counted, queryIndex: counted.queryIndex + 1, cursor: null });
  if (counted.phase === "backlog") return toTracking(counted);
  return {
    ...startOfQueries(counted),
    lastWindowCompletedOn: counted.windowStartedOn,
    windowFrom: null,
    windowStartedOn: null,
  };
}
