import { Check } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

/** Same shape as the backend's normalizeTerm: lowercase, no diacritics, punctuation to spaces. */
export function normalizeTopic(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Community topics, the viewer's profile topics first (in the order given, which is by weight), the rest as listed. */
export function orderTopicsByProfile(communityTopics: readonly string[], profileKeys: readonly string[]): string[] {
  const rank = new Map(profileKeys.map((key, index) => [key, index]));
  return communityTopics
    .map((topic, index) => ({ topic, index, rank: rank.get(normalizeTopic(topic)) ?? Number.POSITIVE_INFINITY }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.topic);
}

interface TopicChipFilterProps {
  topics: readonly string[];
  selected: string | null;
  onSelect: (topic: string | null) => void;
}

/**
 * Single-select topic filter. Chips wrap instead of scrolling, the selected one is marked by `aria-pressed`, a check
 * mark and a stronger border (not colour alone), and clicking it again clears the filter.
 */
export function TopicChipFilter({ topics, selected, onSelect }: TopicChipFilterProps) {
  const { t } = useI18n();
  if (topics.length === 0) return null;
  const selectedKey = selected ? normalizeTopic(selected) : null;
  return <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter discussions by topic")}>
    {topics.map((topic) => {
      const active = selectedKey === normalizeTopic(topic);
      return <button key={topic} type="button" aria-pressed={active} onClick={() => onSelect(active ? null : topic)}
        className={cn("inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "border-2 border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" : "text-muted-foreground hover:border-blue-300 hover:text-foreground")}>
        {active ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}{topic}
      </button>;
    })}
  </div>;
}
