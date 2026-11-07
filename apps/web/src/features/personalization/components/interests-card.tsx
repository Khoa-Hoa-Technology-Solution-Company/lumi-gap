import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { InterestTopic } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { useInterestActions, useInterests, useInterestVocabulary } from "../hooks/use-personalization";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Which limit a 409 refers to depends on the action that failed. */
function failureMessage(error: unknown, t: Translate, action: "follow" | "mute" = "follow"): string {
  const response = (error as { response?: { status?: number; data?: { error?: { message?: string } } } } | undefined)?.response;
  if (response?.status === 422) return t("No discussion or community uses this topic yet");
  if (response?.status === 409) return t(action === "mute" ? "You can mute up to 100 topics" : "You can follow up to 20 topics");
  return response?.data?.error?.message ?? t("Something went wrong. Please try again.");
}

/**
 * "Your interests": what "For you" is built from. Following and muting here only changes "For you"; the academic
 * profile (research interests used for reviewer and mentor matching) is never edited from this card.
 */
export function InterestsCard() {
  const { t } = useI18n();
  const interests = useInterests();
  const actions = useInterestActions();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const vocabulary = useInterestVocabulary(debounced, debounced.length > 0);

  const topics = interests.data?.topics ?? [];
  const muted = interests.data?.muted ?? [];
  const followed = topics.filter((topic) => topic.source === "followed");
  const fromProfile = topics.filter((topic) => topic.source === "profile");
  const fromCommunities = topics.filter((topic) => topic.source === "community");
  const inferred = topics.filter((topic) => topic.source === "inferred");
  const followedKeys = new Set(followed.map((topic) => topic.key));
  const suggestions = (vocabulary.data ?? []).filter((term) => !followedKeys.has(term.key) && !muted.some((item) => item.key === term.key));

  const follow = (label: string) => actions.follow.mutate(label, { onError: (error) => toast.error(failureMessage(error, t)) });
  const unfollow = (topic: InterestTopic) => actions.unfollow.mutate(topic.key, {
    onSuccess: () => toast(t("Stopped following {{topic}}", { topic: topic.label }), { action: { label: t("Undo"), onClick: () => follow(topic.label) } }),
    onError: (error) => toast.error(failureMessage(error, t)),
  });
  const mute = (topic: InterestTopic) => actions.mute.mutate(topic.label, {
    onSuccess: () => toast(t("{{topic}} is muted for For you", { topic: topic.label }), {
      action: { label: t("Undo"), onClick: () => actions.unmute.mutate(topic.key, { onSuccess: () => { if (topic.source === "followed") follow(topic.label); } }) },
    }),
    onError: (error) => toast.error(failureMessage(error, t, "mute")),
  });
  const unmute = (item: { key: string; label: string }) => actions.unmute.mutate(item.key, {
    onSuccess: () => toast(t("{{topic}} is back in For you", { topic: item.label })),
    onError: (error) => toast.error(failureMessage(error, t)),
  });

  return <section aria-labelledby="interests-heading" aria-busy={interests.isLoading} className="space-y-6">
    <header>
      <h2 id="interests-heading" className="text-xl font-bold">{t("Your interests")}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("These topics shape your For you feed in the Research Forum and the communities suggested to you. Following a topic here does not change your academic profile.")}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("Unfollow stops following a topic you chose. Mute hides a topic from For you, even when it comes from your academic profile or your reading.")}</p>
    </header>

    <div>
      <label htmlFor="interest-picker" className="text-sm font-semibold">{t("Follow a topic")}</label>
      <Input id="interest-picker" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search topics used in communities")} className="mt-2 max-w-md" autoComplete="off" />
      {debounced ? <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("Matching topics")}>
        {suggestions.map((term) => <li key={term.key}>
          <button type="button" onClick={() => { follow(term.label); setQuery(""); }} disabled={actions.follow.isPending}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-sm hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />{term.label}
          </button>
        </li>)}
        {!vocabulary.isFetching && suggestions.length === 0 ? <li className="text-sm text-muted-foreground">{t("No topic matches. Topics come from research communities.")}</li> : null}
      </ul> : null}
    </div>

    {interests.isLoading ? <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}</div>
      : interests.error ? <p role="alert" className="text-sm text-red-600">{t("Could not load your interests.")}</p>
        : topics.length === 0 && muted.length === 0 ? <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium">{t("No interests yet")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("Follow a topic above, read and join discussions, or browse research communities to get started.")}</p>
          <Button asChild variant="outline" className="mt-4 min-h-11"><Link to="/communities">{t("Browse communities")}</Link></Button>
        </div> : <>
          <TopicGroup title={t("Followed")} topics={followed} t={t} renderActions={(topic) => <>
            <RowButton label={t("Unfollow")} onClick={() => unfollow(topic)} />
            <RowButton label={t("Mute")} onClick={() => mute(topic)} />
          </>} />
          <TopicGroup title={t("From your academic profile")} topics={fromProfile} t={t} renderActions={(topic) => <>
            <Link to="/settings/profile" className="inline-flex min-h-6 items-center rounded text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Edit it in your academic profile")}</Link>
            <RowButton label={t("Mute")} onClick={() => mute(topic)} />
          </>} />
          <TopicGroup title={t("From communities you joined")} topics={fromCommunities} t={t} renderActions={(topic) => <>
            <RowButton label={t("Follow")} onClick={() => follow(topic.label)} />
            <RowButton label={t("Mute")} onClick={() => mute(topic)} />
          </>} />
          <TopicGroup title={t("Inferred from what you read and discuss")} topics={inferred} t={t} renderActions={(topic) => <>
            <RowButton label={t("Follow")} onClick={() => follow(topic.label)} />
            <RowButton label={t("Mute")} onClick={() => mute(topic)} />
          </>} />
          {muted.length ? <div>
            <h3 className="text-sm font-semibold">{t("Muted topics")}</h3>
            <ul className="mt-2 divide-y rounded-xl border">
              {muted.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-sm">{item.label}</span>
                <RowButton label={t("Unmute")} onClick={() => unmute(item)} />
              </li>)}
            </ul>
          </div> : null}
        </>}
  </section>;
}

function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" size="sm" variant="outline" className="min-h-8" onClick={onClick}>{label}</Button>;
}

function TopicGroup({ title, topics, t, renderActions }: { title: string; topics: InterestTopic[]; t: Translate; renderActions: (topic: InterestTopic) => React.ReactNode }) {
  if (topics.length === 0) return null;
  return <div>
    <h3 className="text-sm font-semibold">{title}</h3>
    <ul className="mt-2 divide-y rounded-xl border">
      {topics.map((topic) => <li key={topic.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{topic.label}</p>
          <p className="text-xs text-muted-foreground">
            {topic.evidenceCount === 1 ? t("Based on 1 post") : topic.evidenceCount > 1 ? t("Based on {{count}} posts", { count: topic.evidenceCount }) : t(topic.source === "inferred" ? "Based on your activity" : "No reading activity yet")}
            {topic.viaCommunity ? ` · ${t("via {{community}}", { community: topic.viaCommunity.name })}` : ""}
            {topic.lowConfidence ? ` · ${t("Early guess")}` : ""}
            {!topic.matchable ? ` · ${t("No discussions use this term yet")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{renderActions(topic)}</div>
      </li>)}
    </ul>
  </div>;
}
