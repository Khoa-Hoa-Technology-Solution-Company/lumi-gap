import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Info, Plus, Search, X } from "lucide-react";
import type { InterestTopic } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoader, SectionErrorState, SkeletonList } from "@/components/loading";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { useInterestActions, useInterests, useInterestVocabulary } from "../hooks/use-personalization";
import { SettingsPageHeader, SettingsSection } from "@/features/settings/components/settings-primitives";

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
  const suggestions = (vocabulary.data ?? []).filter(
    (term) => !followedKeys.has(term.key) && !muted.some((item) => item.key === term.key),
  );

  const follow = (label: string) =>
    actions.follow.mutate(label, { onError: (error) => toast.error(failureMessage(error, t)) });
  const unfollow = (topic: InterestTopic) =>
    actions.unfollow.mutate(topic.key, {
      onSuccess: () =>
        toast(t("Stopped following {{topic}}", { topic: topic.label }), {
          action: { label: t("Undo"), onClick: () => follow(topic.label) },
        }),
      onError: (error) => toast.error(failureMessage(error, t)),
    });
  const mute = (topic: InterestTopic) =>
    actions.mute.mutate(topic.label, {
      onSuccess: () =>
        toast(t("{{topic}} is muted for For you", { topic: topic.label }), {
          action: {
            label: t("Undo"),
            onClick: () =>
              actions.unmute.mutate(topic.key, {
                onSuccess: () => {
                  if (topic.source === "followed") follow(topic.label);
                },
              }),
          },
        }),
      onError: (error) => toast.error(failureMessage(error, t, "mute")),
    });
  const unmute = (item: { key: string; label: string }) =>
    actions.unmute.mutate(item.key, {
      onSuccess: () => toast(t("{{topic}} is back in For you", { topic: item.label })),
      onError: (error) => toast.error(failureMessage(error, t)),
    });

  return (
    <section aria-labelledby="interests-heading" aria-busy={interests.isLoading}>
      <SettingsPageHeader
        title={t("Your interests")}
        description={t(
          "These topics shape your For you feed in the Research Forum and the communities suggested to you. Following a topic here does not change your academic profile.",
        )}
      />

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          {t("Unfollow stops following a topic you chose. Mute hides a topic from For you, even when it comes from your academic profile or your reading.")}
        </p>
      </div>

      {/* Searchable Topic Picker + Removable Followed Tags */}
      <SettingsSection title={t("Follow a topic")}>
        <div className="max-w-lg space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="interest-picker" className="sr-only">
              {t("Follow a topic")}
            </label>
            <Input
              id="interest-picker"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search topics used in communities")}
              className="h-10 pl-9"
              autoComplete="off"
            />
          </div>

          {debounced ? (
            <div className="space-y-2">
              {vocabulary.isFetching ? <InlineLoader label={t("Searching…")} /> : null}
              <ul className="flex flex-wrap gap-2" aria-label={t("Matching topics")}>
                {suggestions.map((term) => (
                  <li key={term.key}>
                    <button
                      type="button"
                      onClick={() => {
                        follow(term.label);
                        setQuery("");
                      }}
                      disabled={actions.follow.isPending}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <Plus aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                      <span>{term.label}</span>
                    </button>
                  </li>
                ))}
                {!vocabulary.isFetching && suggestions.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    {t("No topic matches. Topics come from research communities.")}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {followed.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {followed.map((topic) => (
                <span
                  key={topic.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary"
                >
                  <span>{topic.label}</span>
                  <button
                    type="button"
                    onClick={() => unfollow(topic)}
                    aria-label={`${t("Unfollow")} ${topic.label}`}
                    className="rounded-full p-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {interests.isLoading ? (
        <div className="pt-6">
          <SkeletonList items={3} />
        </div>
      ) : interests.error ? (
        <div className="pt-6">
          <SectionErrorState
            compact
            error={interests.error}
            title={t("Could not load your interests.")}
            onRetry={() => void interests.refetch()}
            retrying={interests.isFetching}
          />
        </div>
      ) : topics.length === 0 && muted.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{t("No interests yet")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("Follow a topic above, read and join discussions, or browse research communities to get started.")}
          </p>
          <Button asChild variant="outline" className="mt-4 min-h-10">
            <Link to="/communities">{t("Browse communities")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6 pt-6">
          <TopicGroup
            title={t("Followed")}
            topics={followed}
            t={t}
            renderActions={(topic) => (
              <>
                <RowButton label={t("Unfollow")} onClick={() => unfollow(topic)} />
                <RowButton label={t("Mute")} onClick={() => mute(topic)} />
              </>
            )}
          />
          <TopicGroup
            title={t("From your academic profile")}
            topics={fromProfile}
            t={t}
            renderActions={(topic) => (
              <>
                <Link
                  to="/settings/profile"
                  className="inline-flex min-h-6 items-center rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("Edit it in your academic profile")}
                </Link>
                <RowButton label={t("Mute")} onClick={() => mute(topic)} />
              </>
            )}
          />
          <TopicGroup
            title={t("From communities you joined")}
            topics={fromCommunities}
            t={t}
            renderActions={(topic) => (
              <>
                <RowButton label={t("Follow")} onClick={() => follow(topic.label)} />
                <RowButton label={t("Mute")} onClick={() => mute(topic)} />
              </>
            )}
          />
          <TopicGroup
            title={t("Inferred from what you read and discuss")}
            topics={inferred}
            t={t}
            renderActions={(topic) => (
              <>
                <RowButton label={t("Follow")} onClick={() => follow(topic.label)} />
                <RowButton label={t("Mute")} onClick={() => mute(topic)} />
              </>
            )}
          />
          {muted.length ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("Muted topics")}</h3>
              <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/80">
                {muted.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <RowButton label={t("Unmute")} onClick={() => unmute(item)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onClick}>
      {label}
    </Button>
  );
}

function TopicGroup({
  title,
  topics,
  t,
  renderActions,
}: {
  title: string;
  topics: InterestTopic[];
  t: Translate;
  renderActions: (topic: InterestTopic) => React.ReactNode;
}) {
  if (topics.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/80">
        {topics.map((topic) => (
          <li key={topic.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{topic.label}</p>
              <p className="text-xs text-muted-foreground">
                {topic.evidenceCount === 1
                  ? t("Based on 1 post")
                  : topic.evidenceCount > 1
                    ? t("Based on {{count}} posts", { count: topic.evidenceCount })
                    : t(topic.source === "inferred" ? "Based on your activity" : "No reading activity yet")}
                {topic.viaCommunity ? ` · ${t("via {{community}}", { community: topic.viaCommunity.name })}` : ""}
                {topic.lowConfidence ? ` · ${t("Early guess")}` : ""}
                {!topic.matchable ? ` · ${t("No discussions use this term yet")}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{renderActions(topic)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
