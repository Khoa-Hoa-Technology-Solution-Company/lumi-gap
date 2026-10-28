import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useToggleTrendFollow, useTrendFollows } from "../hooks/use-trends";
import { getTopicTrendTarget } from "../trend-navigation";
import { verdictLabel } from "./trend-verdict-badge";
import { DEFAULT_TREND_YEAR_FROM, DEFAULT_TREND_YEAR_TO } from "../../../pages/trends.insights";

/** The user's followed trend topics with their last verdict; renders nothing until the user follows one. */
export function FollowedTopicsPanel() {
  const { t, language } = useI18n();
  const { data: follows } = useTrendFollows();
  const toggle = useToggleTrendFollow();
  if (!follows || follows.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-5 shadow-sm" aria-labelledby="followed-topics-title">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-blue-600" />
        <h2 id="followed-topics-title" className="text-sm font-bold text-slate-900 dark:text-white">{t("Followed topics")}</h2>
        <span className="text-xs text-slate-500">{t("Each topic is checked daily over {{yearFrom}}–{{yearTo}}; you are notified when its trend verdict changes.", { yearFrom: DEFAULT_TREND_YEAR_FROM, yearTo: DEFAULT_TREND_YEAR_TO })}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {follows.map((follow) => (
          <li key={follow.id} className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 py-1 pl-3 pr-1 text-xs">
            <Link to={getTopicTrendTarget(follow.topic, follow.openalexTopicId)} className="font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600">{follow.topic}</Link>
            <span className="text-slate-500" title={follow.lastCheckedAt ? t("Checked {{date}}", { date: new Date(follow.lastCheckedAt).toLocaleDateString(language) }) : undefined}>
              {follow.lastVerdict ? verdictLabel(follow.lastVerdict, t) : t("Not checked yet")}
            </span>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
              aria-label={t("Unfollow {{topic}}", { topic: follow.topic })}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ topic: follow.topic, followId: follow.id }, { onError: () => toast.error(t("Could not update the followed topic.")) })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
