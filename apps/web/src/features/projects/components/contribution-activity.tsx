import { useMemo, useState } from "react";
import { Activity, CalendarDays, Info } from "lucide-react";
import type { ActivityCategory } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { contributionsApi } from "../api/contributions.api";
import { WorkspaceError, WorkspaceLoading, WorkspacePager } from "./workspace-common";
import { ContributionArtifactReference } from "./contribution-artifact-link";
import { contributionDate } from "../utils/contribution-date";

export const activityLabels: Record<ActivityCategory, string> = { PLAN: "Research plan", LITERATURE: "Literature", SCREENING: "Screening", EVIDENCE: "Evidence", GAP: "Research gaps", TASK: "Completed deliverables", DECISION: "Research decisions", MANUSCRIPT: "Manuscript revisions" };
export function heatmapDays(from: string, to: string) {
  const days: string[] = []; const end = new Date(`${to}T12:00:00Z`);
  for (const date = new Date(`${from}T12:00:00Z`); date <= end; date.setUTCDate(date.getUTCDate() + 1)) days.push(date.toISOString().slice(0, 10));
  return days;
}
export function heatmapCalendar(days: string[]): (string | null)[] {
  if (!days.length) return [];
  const offset = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(offset).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function ContributionActivityPanel({ projectId }: { projectId: string }) {
  const { t, language } = useI18n();
  const [from, setFrom] = useState(() => contributionDate(new Date(Date.now() - 90 * 86400000)));
  const [to, setTo] = useState(() => contributionDate());
  const [member, setMember] = useState(""); const [category, setCategory] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Ho_Chi_Minh");
  const [day, setDay] = useState<string | null>(null); const [page, setPage] = useState(1);
  const today = contributionDate(new Date(), timeZone);
  const offset = timeZone === "UTC" ? "Z" : "+07:00";
  const query = { from: `${from}T00:00:00${offset}`, to: `${to}T23:59:59.999${offset}`, timeZone, memberId: member || undefined, category: category || undefined, eventDay: day ?? undefined, page, pageSize: 20 };
  const result = useWorkspaceResource(projectId, "contribution-activity", () => contributionsApi.activity(projectId, query), query);
  const days = useMemo(() => heatmapDays(from, to), [from, to]);
  const calendar = useMemo(() => heatmapCalendar(days), [days]);
  const counts = new Map(result.data?.days.map(d => [d.day, d.count]));
  const activityCount = days.reduce((total, date) => total + (counts.get(date) ?? 0), 0);
  const activeDays = days.filter(date => (counts.get(date) ?? 0) > 0).length;
  const monthFormat = new Intl.DateTimeFormat(language, { month: "short", timeZone: "UTC" });
  const dateFormat = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const calendarDate = (date: string) => new Date(`${date}T12:00:00Z`);
  const weeks = Array.from({ length: calendar.length / 7 }, (_, index) => calendar.slice(index * 7, index * 7 + 7).find(Boolean));
  const change = (set: (v: string) => void, value: string) => { set(value); setPage(1); setDay(null); };

  return <div className="contribution-section contribution-activity-section">
    <div className="contribution-filters contribution-activity-filters">
      <label>{t("From date")}<input type="date" value={from} max={to} onChange={e => change(setFrom, e.target.value)} /></label>
      <label>{t("To date")}<input type="date" value={to} min={from} max={today} onChange={e => change(setTo, e.target.value)} /></label>
      <label>{t("Member")}<select value={member} onChange={e => change(setMember, e.target.value)}><option value="">{t("All members")}</option>{result.data?.members.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>{t("Category")}<select value={category} onChange={e => change(setCategory, e.target.value)}><option value="">{t("All categories")}</option>{Object.entries(activityLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
      <label>{t("Timezone")}<select value={timeZone} onChange={e => change(setTimeZone, e.target.value)}><option value="Asia/Ho_Chi_Minh">UTC+7 · {t("Vietnam")}</option><option value="UTC">UTC</option></select></label>
    </div>
    {result.isLoading ? <WorkspaceLoading /> : result.isError ? <WorkspaceError error={result.error} retry={() => void result.refetch()} /> : <>
      <section className="contribution-calendar-section" aria-label={t("Meaningful activity by day")}>
        <header className="contribution-calendar-header">
          <div><h3><CalendarDays size={19} aria-hidden="true" />{t("Meaningful activity by day")}</h3><p>{t("Select a day to filter the activity list.")}</p></div>
          <dl className="contribution-activity-summary"><div><dt>{t("Recorded activities")}</dt><dd>{activityCount.toLocaleString(language)}</dd></div><div><dt>{t("Active days")}</dt><dd>{activeDays.toLocaleString(language)}</dd></div></dl>
        </header>
        <div className="contribution-calendar-layout">
          <div className="contribution-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)))}</span>)}</div>
          <div className="contribution-heatmap-scroll">
            <div className="contribution-months" aria-hidden="true">{weeks.map((date, index) => {
              const previous = weeks[index - 1];
              return <span key={index}>{date && (!previous || date.slice(0, 7) !== previous.slice(0, 7)) ? monthFormat.format(calendarDate(date)) : ""}</span>;
            })}</div>
            <div className="contribution-heatmap">{calendar.map((date, index) => {
              if (!date) return <span className="heat-cell heat-padding" key={`pad-${index}`} aria-hidden="true" />;
              const count = counts.get(date) ?? 0;
              const label = `${date}: ${count} ${t("recorded activities")}`;
              return <button key={date} type="button" className={`heat-cell heat-level-${Math.min(count, 4)}`} title={`${dateFormat.format(calendarDate(date))}: ${count} ${t("recorded activities")}`} aria-label={label} aria-pressed={day === date} onClick={() => { setDay(day === date ? null : date); setPage(1); }} />;
            })}</div>
          </div>
        </div>
        <footer className="contribution-calendar-footer"><span>{days.length ? `${dateFormat.format(calendarDate(from))} – ${dateFormat.format(calendarDate(to))}` : ""}</span><div className="contribution-legend"><span>{t("Less activity")}</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`heat-cell heat-level-${level}`} aria-hidden="true" />)}<span>{t("More activity")}</span></div></footer>
      </section>
      <p className="contribution-note contribution-guidance"><Info size={16} aria-hidden="true" />{t("Recorded activity does not automatically determine contribution percentages.")}</p>
      <section className="contribution-history-section" aria-label={t("Recent activity")}>
        <header className="contribution-history-heading"><h3>{day ? `${t("Selected day")}: ${dateFormat.format(calendarDate(day))}` : t("Recent activity")}</h3>{day && <Button variant="outline" size="sm" onClick={() => { setDay(null); setPage(1); }}>{t("Clear day filter")}</Button>}</header>
        {!result.data?.items.length ? <div className="contribution-empty contribution-activity-empty"><Activity size={24} aria-hidden="true" /><p>{t(day ? "No recorded events for this day." : "Meaningful research actions will appear here as your team works.")}</p></div> : <ol className="contribution-timeline">{result.data.items.map(row => <li key={row.id}>
          <span className="contribution-actor-avatar" aria-hidden="true">{row.actor.name.trim().split(/\s+/).filter((_, index, parts) => index === 0 || index === parts.length - 1).map(part => part.charAt(0)).join("").toUpperCase()}</span>
          <div className="contribution-event-main"><strong>{row.actor.name}</strong><div className="contribution-event-detail"><span className="contribution-category">{t(activityLabels[row.category])}</span>{row.artifactVersion && <small className="contribution-version">v{row.artifactVersion}</small>}<ContributionArtifactReference projectId={projectId} link={row.link} /></div></div>
          <time dateTime={row.createdAt}>{new Intl.DateTimeFormat(language, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</time>
        </li>)}</ol>}
        <WorkspacePager data={result.data} page={page} onPage={setPage} />
      </section>
      <p className="contribution-note">{t("A manuscript revision records who saved it, not who authored every part of the shared text.")}</p>
    </>}
  </div>;
}
