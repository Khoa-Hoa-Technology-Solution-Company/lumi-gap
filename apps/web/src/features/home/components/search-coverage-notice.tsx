import { useState } from "react";
import { Link } from "react-router-dom";
import { DatabaseZap, Loader2 } from "lucide-react";
import type { SearchCoverageHint, TopicBackfillRequestResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  backfillErrorCode,
  backfillErrorStatus,
  isLiveRun,
  useRequestTopicBackfill,
  useTopicBackfillRun,
} from "@/features/topic-backfill";
import { LITERATURE_PATH, withTagFilter } from "../utils/home-search";

interface SearchCoverageNoticeProps {
  /** meta.understanding.coverage of the current response. */
  coverage: SearchCoverageHint;
  authenticated: boolean;
  /** Where a guest goes to sign in; returns to the current search. */
  signInHref: string;
}

interface Failure {
  code?: string;
  status?: number;
}

/** Codes that mean the offer should not be shown at all. */
const HIDDEN_CODES = new Set(["TOPIC_NOT_THIN", "TOPIC_BACKFILL_DISABLED"]);

/**
 * Shown above the results when the query is exactly a catalogue entry the corpus holds few papers of. A signed-in user
 * can ask for more papers from OpenAlex; the notice follows the import until it finishes. State resets when the target
 * changes (the `key`), so a new search never shows the previous import.
 */
export function SearchCoverageNotice(props: SearchCoverageNoticeProps) {
  return <CoverageNoticeBody key={`${props.coverage.targetKind}:${props.coverage.targetId}`} {...props} />;
}

function CoverageNoticeBody({ coverage, authenticated, signInHref }: SearchCoverageNoticeProps) {
  const { t, language } = useI18n();
  const request = useRequestTopicBackfill();
  const [result, setResult] = useState<TopicBackfillRequestResult>();
  const [failure, setFailure] = useState<Failure>();
  const polled = useTopicBackfillRun(result?.run.id, result?.run);
  const run = polled.data ?? result?.run;

  if (failure?.code && HIDDEN_CODES.has(failure.code)) return null;

  function start() {
    setFailure(undefined);
    setResult(undefined);
    request.mutate(
      { targetKind: coverage.targetKind, targetId: coverage.targetId },
      {
        onSuccess: setResult,
        onError: (error) => setFailure({ code: backfillErrorCode(error), status: backfillErrorStatus(error) }),
      },
    );
  }

  const format = (value: number) => value.toLocaleString(language);
  const summary = coverage.localPapers > 0
    ? t("LumiGap has {{count}} papers on {{name}}.", { count: format(coverage.localPapers), name: coverage.name })
    : t("LumiGap has no papers on {{name}} yet.", { name: coverage.name });
  const works = coverage.openalexWorks !== null && coverage.openalexWorks !== undefined
    ? t("OpenAlex lists {{works}} works.", { works: format(coverage.openalexWorks) })
    : null;

  const inserted = run?.insertedCount ?? 0;
  // Imported papers get their embeddings later, so a text search may miss them; the entry's own list always has them.
  const papersHref = `${LITERATURE_PATH}?${withTagFilter(new URLSearchParams(), { ...coverage.filter, label: coverage.name })}`;
  const viewPapers = <Button asChild size="sm"><Link to={papersHref}>{t("View these papers")}</Link></Button>;
  const live = request.isPending || isLiveRun(run);
  const cooldown = Boolean(result && !result.created && result.run.state === "completed");
  const runFailed = run?.state === "failed";
  const dailyLimit = failure?.code === "TOPIC_BACKFILL_DAILY_LIMIT";
  const hourlyLimit = !dailyLimit && failure?.status === 429;
  const requestFailed = Boolean(failure) && !dailyLimit && !hourlyLimit;

  let status: JSX.Element | null = null;
  let action: JSX.Element | null = null;
  if (live) {
    status = (
      <p role="status" className="search-coverage-status">
        <Loader2 className="search-coverage-spinner" aria-hidden="true" />
        <span>{t("Fetching papers from OpenAlex…")}</span>
        {inserted > 0 ? <span className="search-coverage-progress">{t("{{count}} new papers so far", { count: format(inserted) })}</span> : null}
      </p>
    );
  } else if (dailyLimit) {
    status = <p role="alert" className="search-coverage-status">{t("The daily limit for fetching papers has been reached. Please try again tomorrow.")}</p>;
  } else if (hourlyLimit) {
    status = <p role="alert" className="search-coverage-status">{t("Too many fetch requests. Please wait a while and try again.")}</p>;
  } else if (runFailed || requestFailed) {
    status = <p role="alert" className="search-coverage-status">{t("Could not fetch papers. Please try again later.")}</p>;
    action = <Button size="sm" variant="outline" onClick={start}>{t("Retry")}</Button>;
  } else if (run?.state === "completed") {
    if (cooldown) {
      status = (
        <p role="status" className="search-coverage-status">
          <span>{t("This topic was updated recently.")}</span>
          {inserted > 0 ? <span className="search-coverage-progress">{t("Added {{count}} new papers.", { count: format(inserted) })}</span> : null}
        </p>
      );
      if (inserted > 0) action = viewPapers;
    } else if (inserted > 0) {
      status = <p role="status" className="search-coverage-status">{t("Added {{count}} new papers.", { count: format(inserted) })}</p>;
      action = viewPapers;
    } else {
      status = <p role="status" className="search-coverage-status">{t("No new papers were found for this topic.")}</p>;
    }
  } else if (authenticated) {
    action = <Button size="sm" onClick={start}>{t("Fetch more papers")}</Button>;
  } else {
    action = <Button asChild size="sm"><Link to={signInHref}>{t("Sign in to fetch more papers")}</Link></Button>;
  }

  return (
    <div className="search-coverage" data-testid="search-coverage">
      <DatabaseZap className="search-coverage-icon" aria-hidden="true" />
      <div className="search-coverage-body">
        <p className="search-coverage-summary">{summary}{works ? ` ${works}` : ""}</p>
        {status}
      </div>
      {action ? <div className="search-coverage-actions">{action}</div> : null}
    </div>
  );
}
