import { useMemo, useState } from "react";
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
export function ContributionActivityPanel({ projectId }: { projectId: string }) {
  const { t, language } = useI18n();
  const [from, setFrom] = useState(() => contributionDate(new Date(Date.now() - 90 * 86400000))); const [to, setTo] = useState(() => contributionDate());
  const [member, setMember] = useState(""); const [category, setCategory] = useState(""); const [timeZone, setTimeZone] = useState("Asia/Ho_Chi_Minh"); const [day, setDay] = useState<string | null>(null); const [page, setPage] = useState(1);
  const today = contributionDate(new Date(), timeZone);
  const offset = timeZone === "UTC" ? "Z" : "+07:00";
  const query = { from: `${from}T00:00:00${offset}`, to: `${to}T23:59:59.999${offset}`, timeZone, memberId: member || undefined, category: category || undefined, eventDay: day ?? undefined, page, pageSize: 20 };
  const result = useWorkspaceResource(projectId, "contribution-activity", () => contributionsApi.activity(projectId, query), query);
  const days = useMemo(() => heatmapDays(from, to), [from, to]); const counts = new Map(result.data?.days.map(d => [d.day, d.count]));
  const selectedItems = result.data?.items;
  const change = (set: (v: string) => void, value: string) => { set(value); setPage(1); setDay(null); };
  return <div className="contribution-section">
    <p className="contribution-note">{t("Recorded activity does not automatically determine contribution percentages.")}</p>
    <div className="contribution-filters"><label>{t("From date")}<input type="date" value={from} max={to} onChange={e => change(setFrom, e.target.value)} /></label><label>{t("To date")}<input type="date" value={to} min={from} max={today} onChange={e => change(setTo, e.target.value)} /></label>
      <label>{t("Member")}<select value={member} onChange={e => change(setMember, e.target.value)}><option value="">{t("All members")}</option>{result.data?.members.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>{t("Category")}<select value={category} onChange={e => change(setCategory, e.target.value)}><option value="">{t("All categories")}</option>{Object.entries(activityLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
      <label>{t("Timezone")}<select value={timeZone} onChange={e => change(setTimeZone, e.target.value)}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+7)</option><option value="UTC">UTC</option></select></label></div>
    {result.isLoading ? <WorkspaceLoading /> : result.isError ? <WorkspaceError error={result.error} retry={() => void result.refetch()} /> : <>
      <div className="contribution-heatmap-scroll"><div className="contribution-heatmap" aria-label={t("Meaningful activity by day")}>{days.map(date => { const count = counts.get(date) ?? 0; const label = `${date}: ${count} ${t("recorded activities")}`; return <button key={date} type="button" className={`heat-cell heat-level-${Math.min(count, 4)}`} title={label} aria-label={label} aria-pressed={day === date} onClick={() => { setDay(day === date ? null : date); setPage(1); }} />; })}</div></div>
      <div className="contribution-legend"><span>{t("Less activity")}</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`heat-cell heat-level-${level}`} aria-hidden="true" />)}<span>{t("More activity")}</span><span>{timeZone}</span></div>
      <h3>{day ? `${t("Selected day")}: ${day} · ${counts.get(day) ?? 0}` : t("Recent activity")}</h3>{day && <Button variant="ghost" size="sm" onClick={() => { setDay(null); setPage(1); }}>{t("Clear day filter")}</Button>}
      {!selectedItems?.length && <p className="contribution-empty">{t(day ? "No recorded events for this day." : "Meaningful research actions will appear here as your team works.")}</p>}
      <ol className="contribution-timeline">{selectedItems?.map(row => <li key={row.id}><div><strong>{row.actor.name}</strong><span>{t(activityLabels[row.category])}</span>{row.artifactVersion && <small>v{row.artifactVersion}</small>}<ContributionArtifactReference projectId={projectId} link={row.link} /></div><time dateTime={row.createdAt}>{new Intl.DateTimeFormat(language, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</time></li>)}</ol>
      <WorkspacePager data={result.data} page={page} onPage={setPage} />
      <p className="contribution-note">{t("A manuscript revision records who saved it, not who authored every part of the shared text.")}</p>
    </>}
  </div>;
}
