import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AllocationShareInput, ContributionEvaluationRow, ContributionEvaluationRule, ContributionEvaluationSnapshot, EvaluationDecisionKind, EvaluationProposalInput, ManuscriptWritingReport } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { contributionEvaluationApi as api } from "../api/contribution-evaluation.api";
import { contributionsApi } from "../api/contributions.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceError, WorkspaceLoading, WorkspacePager } from "./workspace-common";
import { percentBasisPoints } from "../utils/contribution-percentage";

const reasonLabels = {
  AWAITING_PROPOSAL: "Evaluation not proposed", SOURCE_CHANGED: "Source work changed; propose a new revision", RULE_CHANGED: "Evaluation rules changed; confirm again",
  SOURCE_OUTSIDE_PERIOD: "Grouped work falls outside this period; choose a period covering the whole outcome",
  SOURCE_NOT_CONFIRMED: "Source work is not confirmed", MISSING_EVIDENCE: "Evidence is missing", PARTICIPATION_MISMATCH: "Named participants do not match",
  MEMBERSHIP_MISMATCH: "Participant membership needs review", AWAITING_WEIGHT: "Owner has not confirmed the weight", AWAITING_PARTICIPANTS: "Waiting for participant confirmations", DISPUTED: "An unresolved objection exists",
} as const;
const statusLabels = { ELIGIBLE: "Ready to calculate", PENDING: "Pending confirmation", DISPUTED: "Disputed", EXCLUDED: "Excluded from calculation" } as const;
function useRequestKey() {
  const attempt = useRef<{ hash: string; key: string }>();
  return (value: unknown) => { const hash = JSON.stringify(value); if (attempt.current?.hash !== hash) attempt.current = { hash, key: crypto.randomUUID() }; return attempt.current.key; };
}
function RuleEditor({ projectId, rule, close }: { projectId: string; rule: ContributionEvaluationRule | null; close: () => void }) {
  const { t } = useI18n(); const key = useRequestKey(); const [title, setTitle] = useState(rule?.title ?? ""); const [rationale, setRationale] = useState("");
  const [weight, setWeight] = useState(rule?.defaultWeight ?? 1); const [maximum, setMaximum] = useState(rule?.maxWeight ?? 100); const [dirty, setDirty] = useState(false);
  const save = useWorkspaceCommand(projectId, () => { const data = { title, rationale, defaultWeight: weight, maxWeight: maximum }; return api.createRule(projectId, { ...data, clientKey: key(data) }); });
  useUnsavedWorkspace(dirty || save.isPending);
  async function submit(e: FormEvent) { e.preventDefault(); if (save.isPending) return; try { await save.mutateAsync(); setDirty(false); close(); } catch { /* Keep draft and retry identity. */ } }
  return <form className="contribution-editor" onChange={() => setDirty(true)} onSubmit={e => void submit(e)}>
    <h3>{t("Publish evaluation rules")}</h3><p className="contribution-note">{t("New rules require fresh confirmations. Previous calculations keep their original rules.")}</p>
    <fieldset disabled={save.isPending} className="contribution-editor-fields"><label>{t("Title")}<input required minLength={3} maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>{t("Rule rationale")}<textarea required minLength={20} maxLength={5000} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
      <div className="coord-form-pair"><label>{t("Default outcome weight")}<input type="number" required min={1} max={maximum} step={1} value={weight} onChange={e => setWeight(Number(e.target.value))} /></label><label>{t("Maximum outcome weight")}<input type="number" required min={weight} max={100} step={1} value={maximum} onChange={e => setMaximum(Number(e.target.value))} /></label></div>
    </fieldset>{save.isError && <WorkspaceError error={save.error} />}<div className="contribution-actions"><Button disabled={save.isPending}>{t("Publish rule version")}</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={async () => { if (await canLeaveWorkspace()) close(); }}>{t("Cancel")}</Button></div>
  </form>;
}

function EvaluationEditor({ projectId, row, rule, people, close }: { projectId: string; row: ContributionEvaluationRow; rule: ContributionEvaluationRule; people: { id: string; name: string }[]; close: () => void }) {
  const { t } = useI18n(); const payload = row.evaluation?.payload; const key = useRequestKey();
  const [outcomeKey, setOutcomeKey] = useState(row.outcomeKey ?? ""); const [weight, setWeight] = useState(payload?.weight ?? rule.defaultWeight);
  const [rationale, setRationale] = useState(payload?.rationale ?? ""); const [retrospective, setRetrospective] = useState(payload?.retrospectiveWeight ?? true);
  const [sourceIds, setSourceIds] = useState(() => row.sources.map(s => s.id)); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [sourcePeople, setSourcePeople] = useState<Record<string, string[]>>(() => Object.fromEntries(row.sources.map(s => [s.id, s.participants])));
  const [sourceTitles, setSourceTitles] = useState<Record<string, string>>(() => Object.fromEntries(row.sources.map(s => [s.id, s.title])));
  const sourceList = useWorkspaceResource(projectId, "evaluation-source-picker", () => contributionsApi.work(projectId, { q, page, pageSize: 20, filter: "TEAM" }), { q, page });
  const participants = [...new Set(sourceIds.flatMap(id => sourcePeople[id] ?? []))].sort();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((payload?.participation ?? []).map(p => [p.userId, (p.basisPoints / 100).toFixed(2)])));
  const shares = participants.map(userId => ({ userId, basisPoints: percentBasisPoints(values[userId] ?? "") ?? -1 }));
  const valid = shares.length > 0 && shares.every(p => p.basisPoints >= 0) && shares.reduce((n, p) => n + p.basisPoints, 0) === 10000;
  const [dirty, setDirty] = useState(false);
  const [writingReportId, setWritingReportId] = useState(payload?.writingReference?.reportId);
  const save = useWorkspaceCommand(projectId, () => { const data: Omit<EvaluationProposalInput, "clientKey"> = { ruleId: rule.id, outcomeKey, expectedVersion: row.evaluation?.version ?? 0, contributionIds: sourceIds, weight, rationale, retrospectiveWeight: retrospective, participation: shares, ...(writingReportId ? { writingReportId } : {}) }; return api.propose(projectId, { ...data, clientKey: key(data) }); });
  useUnsavedWorkspace(dirty || save.isPending);
  async function submit(e: FormEvent) { e.preventDefault(); if (!valid || save.isPending) return; try { await save.mutateAsync(); setDirty(false); close(); } catch { /* Preserve user input. */ } }
  return <form className="contribution-editor" onChange={() => setDirty(true)} onSubmit={e => void submit(e)}><h3>{t("Propose outcome evaluation")}</h3><p className="contribution-note">{t("Group records for the same outcome. Each outcome earns points once, even when linked to many tasks or manuscript edits.")}</p>
    <fieldset disabled={save.isPending} className="contribution-editor-fields"><label>{t("Outcome code")}<input required pattern="[A-Z0-9][A-Z0-9_-]{1,99}" maxLength={100} readOnly={Boolean(row.outcomeKey)} placeholder={t("Example: METHOD-01")} value={outcomeKey} onChange={e => setOutcomeKey(e.target.value.toUpperCase())} /></label>
      <p>{t("Linked work records")}: {sourceIds.length}</p><ul>{sourceIds.map(id => <li key={id}>{sourceTitles[id]} {!row.sources.some(s => s.id === id) && <Button type="button" variant="ghost" onClick={() => { setSourceIds(ids => ids.filter(sourceId => sourceId !== id)); setDirty(true); }}>{t("Remove")}</Button>}</li>)}</ul>
      <details><summary>{t("Link another record for the same outcome")}</summary><label>{t("Search work records")}<input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></label>
        {sourceList.isLoading ? <WorkspaceLoading /> : sourceList.isError ? <WorkspaceError error={sourceList.error} retry={() => void sourceList.refetch()} /> : <>{sourceList.data?.items.filter(s => !sourceIds.includes(s.id) && ["SUBMITTED", "ACCEPTED", "SELF_RECORDED", "DISPUTED", "NEEDS_CHANGES"].includes(s.status)).map(s => <label className="evaluation-source-option" key={s.id}><input type="checkbox" disabled={sourceIds.length >= 100} onChange={e => { if (e.target.checked) { setSourceIds([...sourceIds, s.id]); setSourcePeople({ ...sourcePeople, [s.id]: s.participants.map(p => p.userId) }); setSourceTitles({ ...sourceTitles, [s.id]: s.title }); setDirty(true); } }} />{s.title}</label>)}<WorkspacePager data={sourceList.data} page={page} onPage={setPage} /></>}
      </details>
      <label>{t("Outcome weight")}<input type="number" required min={1} max={rule.maxWeight} step={1} value={weight} onChange={e => setWeight(Number(e.target.value))} /></label>
      <label>{t("Weight and participation rationale")}<textarea required minLength={20} maxLength={5000} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
      <label className="evaluation-source-option"><input type="checkbox" checked={retrospective} onChange={e => setRetrospective(e.target.checked)} />{t("Weight defined after the work was completed")}</label>
      <WritingParticipationSuggestions projectId={projectId} sourceIds={sourceIds} participants={participants} appliedId={writingReportId} onUse={report => { setValues(Object.fromEntries(participants.map(id => [id, ((report.result!.members.find(m => m.userId === id)?.suggestedBasisPoints ?? 0) / 100).toFixed(2)]))); setWritingReportId(report.id); setDirty(true); }} onRemove={() => { setWritingReportId(undefined); setDirty(true); }} />
      <fieldset><legend>{t("Participation in this outcome")}</legend>{participants.map(id => <label key={id}>{people.find(p => p.id === id)?.name ?? id}<input required inputMode="decimal" aria-label={`${t("Participation percentage")}: ${people.find(p => p.id === id)?.name ?? id}`} value={values[id] ?? ""} placeholder="0.00" onChange={e => setValues({ ...values, [id]: e.target.value })} /></label>)}<p role="status">{t("Total")}: {(shares.reduce((n, p) => n + Math.max(0, p.basisPoints), 0) / 100).toFixed(2)}%</p></fieldset>
    <p className="contribution-note">{t("Every named person must confirm this exact weight, evidence and participation. Sending the proposal is not an approval.")}</p>
    </fieldset>{save.isError && <WorkspaceError error={save.error} />}<div className="contribution-actions"><Button disabled={save.isPending || !valid}>{t("Send evaluation for confirmation")}</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={async () => { if (await canLeaveWorkspace()) close(); }}>{t("Cancel")}</Button></div>
  </form>;
}

export function WritingParticipationSuggestions({ projectId, sourceIds, participants, appliedId, onUse, onRemove }: { projectId: string; sourceIds: string[]; participants: string[]; appliedId?: string; onUse: (report: ManuscriptWritingReport) => void; onRemove: () => void }) {
  const { t } = useI18n(); const [chosen, setChosen] = useState("");
  const reports = useWorkspaceResource(projectId, "writing-suggestions", () => api.writingSuggestions(projectId, sourceIds), sourceIds, sourceIds.length > 0);
  const selected = reports.data?.find(r => r.id === (chosen || appliedId)) ?? reports.data?.[0];
  const allowed = selected?.result && selected.result.attributedWordUnits > 0 && selected.result.members.every(m => participants.includes(m.userId));
  return <details className="evaluation-writing-suggestions"><summary>{t("Suggest participation from manuscript writing")}</summary>
    <p className="contribution-note">{t("Link a manuscript snapshot as work evidence and calculate its writing report first. Suggestions concern writing only and still require team confirmation.")}</p>
    {reports.isLoading ? <WorkspaceLoading /> : reports.isError ? <WorkspaceError error={reports.error} retry={() => void reports.refetch()} /> : !reports.data?.length ? <p>{t("No writing report is linked to these work records.")}</p> : <>
      <label>{t("Writing report version")}<select value={selected?.id ?? ""} onChange={e => setChosen(e.target.value)}>{reports.data.map(r => <option key={r.id} value={r.id}>{r.title} · {r.snapshotLabel} · v{r.sourceVersion}</option>)}</select></label>
      {selected?.isStale && <p role="status">{t("The manuscript changed. This report still describes the saved version.")}</p>}
      {selected?.result && <><p>{t("Writing attribution coverage")}: {(selected.result.coverageBasisPoints / 100).toFixed(2)}%</p><p>{t("Unattributed words")}: {selected.result.unknownWordUnits / 1000}</p><ul>{selected.result.members.map(m => <li key={m.userId}>{m.name}: {((m.suggestedBasisPoints ?? 0) / 100).toFixed(2)}%</li>)}</ul><p className="contribution-note">{t("Writing suggestions are normalized over attributed words only. Unknown text stays visible and every participant must confirm before contribution scoring.")}</p></>}
      {!allowed && <p role="status">{t("Include every measured writer in the linked work records before using these suggestions.")}</p>}
      <Button type="button" variant="outline" disabled={!allowed} onClick={() => selected && onUse(selected)}>{t("Replace participation inputs with this writing suggestion")}</Button>
    </>}
    {appliedId && <p>{t("Writing evidence attached to this proposal")} <Button type="button" variant="ghost" onClick={onRemove}>{t("Remove writing reference")}</Button></p>}
  </details>;
}

export function EvaluationReview({ projectId, evaluationId, people: suppliedPeople = [] }: { projectId: string; evaluationId: string; people?: { id: string; name: string }[] }) {
  const { t, language } = useI18n(); const data = useWorkspaceResource(projectId, "evaluation-detail", () => api.detail(projectId, evaluationId), evaluationId);
  const [note, setNote] = useState(""); const [dirty, setDirty] = useState(false);
  const decide = useWorkspaceCommand(projectId, (input: { kind: EvaluationDecisionKind; decision: "APPROVE" | "DISPUTE" }) => api.decide(projectId, evaluationId, { ...input, payloadHash: data.data!.evaluation.payloadHash, note: input.decision === "DISPUTE" || input.kind === "RESOLUTION" ? note : "" }));
  useUnsavedWorkspace(dirty || decide.isPending);
  async function act(kind: EvaluationDecisionKind, decision: "APPROVE" | "DISPUTE") { if (decide.isPending) return; try { await decide.mutateAsync({ kind, decision }); if (decision === "DISPUTE" || kind === "RESOLUTION") { setDirty(false); setNote(""); } } catch { /* Review remains open on failure. */ } }
  if (data.isLoading) return <WorkspaceLoading />;
  if (data.isError) return <WorkspaceError error={data.error} retry={() => void data.refetch()} />;
  if (!data.data) return null;
  const { evaluation: e, rule } = data.data;
  const people = data.data.people ?? suppliedPeople;
  return <section className="contribution-detail"><header><h3>{e.payload.outcomeKey} · v{e.version}</h3><Badge variant="outline">{t("Confirmation of evaluation inputs")}</Badge></header>
    <p>{t("Policy")}: {rule.title} · v{rule.version}</p><p className="contribution-prose">{rule.rationale}</p><p>{t("Outcome weight")}: {e.payload.weight}</p><p className="contribution-prose">{e.payload.rationale}</p>
    {e.supersededById && <p className="evaluation-warning">{t("This revision is kept for history.")} <Link className="coord-inline-link" to={`/projects/${encodeURIComponent(projectId)}/contribution-review?evaluation=${encodeURIComponent(e.supersededById)}`}>{t("Review the latest evaluation revision")}</Link></p>}
    {e.approvalBlockedReason && <p role="status" className="evaluation-warning">{t(reasonLabels[e.approvalBlockedReason])}</p>}
    {Boolean(e.unresolvedObjections?.length) && <section><h4>{t("Unresolved objections")}</h4><p className="contribution-note">{t("A new revision keeps previous objections open until each objector accepts the correction.")}</p><ul>{e.unresolvedObjections!.map(o => <li key={o.userId}><strong>{people.find(p => p.id === o.userId)?.name ?? o.userId}</strong> · v{o.version}<p className="contribution-prose">{o.note}</p></li>)}</ul></section>}
    {e.payload.retrospectiveWeight && <p className="contribution-note">{t("Weight defined after the work was completed")}</p>}
    <ul>{e.payload.sources.map(s => <li key={s.id}><strong>{s.title}</strong> · v{s.version}<p className="contribution-prose">{s.evidence}</p></li>)}</ul>
    <ul className="evaluation-participants">{e.payload.participation.map(p => <li key={p.userId}><span>{people.find(person => person.id === p.userId)?.name ?? p.userId}</span><strong>{(p.basisPoints / 100).toFixed(2)}%</strong><span>{t(e.decisions.some(d => d.userId === p.userId && d.kind === "PARTICIPANT" && d.decision === "APPROVE") ? "Approved" : "Awaiting response")}</span></li>)}</ul>
    {e.payload.writingReference && <details><summary>{t("Writing evidence attached to this proposal")}</summary><p>{t("Writing attribution coverage")}: {(e.payload.writingReference.coverageBasisPoints / 100).toFixed(2)}%</p><p className="contribution-note">{t("Writing suggestions are normalized over attributed words only. Unknown text stays visible and every participant must confirm before contribution scoring.")}</p><ul>{e.payload.writingReference.suggestedParticipation.map(p => <li key={p.userId}>{people.find(person => person.id === p.userId)?.name ?? p.userId}: {(p.basisPoints / 100).toFixed(2)}%</li>)}</ul></details>}
    <p className="contribution-note">{t("Every named person must confirm this exact weight, evidence and participation. Sending the proposal is not an approval.")}</p>
    <div className="contribution-actions">{e.canApproveWeight && <Button variant="outline" disabled={decide.isPending} onClick={() => void act("WEIGHT", "APPROVE")}>{t("Confirm proposed weight as owner")}</Button>}{e.canApprove && <Button disabled={decide.isPending} onClick={() => void act("PARTICIPANT", "APPROVE")}>{t("Confirm my participation and evaluation inputs")}</Button>}</div>
    {(e.canChallenge || e.canResolveObjection) && <div className="contribution-response"><label>{t(e.canResolveObjection ? "Explain the objection or how this revision resolves it" : "Objection or missing contribution")}<textarea minLength={10} maxLength={2000} disabled={decide.isPending} value={note} onChange={event => { setNote(event.target.value); setDirty(true); }} /></label>{e.canChallenge && <Button variant="outline" disabled={decide.isPending || note.trim().length < 10} onClick={() => void act("CHALLENGE", "DISPUTE")}>{t("Dispute this evaluation")}</Button>}{e.canResolveObjection && <Button disabled={decide.isPending || note.trim().length < 10} onClick={() => void act("RESOLUTION", "APPROVE")}>{t("Accept this revision as resolving my objection")}</Button>}</div>}
    <details><summary>{t("Confirmation history")}</summary>{e.decisions.map((d, index) => <p key={index}>{people.find(p => p.id === d.userId)?.name ?? d.userId} · {t(d.kind === "RESOLUTION" ? "Objection resolved on this revision" : d.decision === "APPROVE" ? "Approved" : "Disputed")} · {new Date(d.createdAt).toLocaleString(language)}<span className="contribution-prose"> {d.note}</span></p>)}</details>
    {decide.isError && <WorkspaceError error={decide.error} />}
  </section>;
}

export function EvaluationSnapshotResult({ snapshot, shares }: { snapshot: ContributionEvaluationSnapshot; shares?: AllocationShareInput[] }) {
  const { t, language } = useI18n(); const names = new Map(snapshot.roster.map(p => [p.id, p.name]));
  return <section className="contribution-detail evaluation-result"><header><h3>{t("Suggested contribution shares")}</h3><Badge variant="outline">{t(snapshot.calculation.status === "INSUFFICIENT_DATA" ? "Insufficient confirmed data" : "Provisional")}</Badge></header>
    <p className="contribution-note">{t("Suggestions never change the team's proposed or agreed shares.")}</p>
    {snapshot.isStale && <p role="status" className="evaluation-warning">{t("Source data changed after this calculation. Keep this history or calculate a new snapshot.")}</p>}
    <p>{snapshot.coverage.eligible}/{snapshot.coverage.total} {t("registered outcomes included")}. {t("Coverage counts outcomes, not the percentage of total effort.")}</p>
    <dl className="evaluation-coverage" aria-label={t("Evaluation coverage")}>{([["eligible", "Confirmed outcomes"], ["pending", "Pending confirmation"], ["disputed", "Disputed"], ["excluded", "Excluded from calculation"]] as const).map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{snapshot.coverage[key]}</dd></div>)}</dl>
    <p>{t("Calculated at")}: {new Date(snapshot.calculatedAt).toLocaleString(language)} · {snapshot.rule.title} v{snapshot.rule.version}</p>
    {snapshot.calculation.status === "INSUFFICIENT_DATA" ? <p>{t("Confirm at least one outcome before a distribution can be suggested.")}</p> : <div className="evaluation-table-scroll" tabIndex={0} role="region" aria-label={t("Suggested contribution shares")}><table className={shares ? "evaluation-table evaluation-table--comparison" : "evaluation-table"}><caption className="sr-only">{t("Suggested contribution shares")}</caption><thead><tr><th>{t("Member")}</th><th>{t("Suggested percentage")}</th>{shares && <><th>{t("Proposed percentage")}</th><th>{t("Difference in percentage points")}</th></>}</tr></thead><tbody>{snapshot.calculation.scores.map(s => { const proposed = shares?.find(p => p.userId === s.userId && p.basisPoints >= 0 && p.basisPoints <= 10000); return <tr key={s.userId}><th scope="row">{names.get(s.userId) ?? s.userId}</th><td>{(s.basisPoints! / 100).toFixed(2)}%</td>{shares && <><td>{proposed ? `${(proposed.basisPoints / 100).toFixed(2)}%` : t("Not proposed")}</td><td>{proposed ? ((proposed.basisPoints - s.basisPoints!) / 100).toFixed(2) : "—"}</td></>}</tr>; })}</tbody></table></div>}
    <details><summary>{t("How these suggestions were calculated")}</summary><p>{t("Score = outcome weight × confirmed participation. Percentages use largest remainder rounding and always total 100%.")}</p>{snapshot.calculation.scores.map(s => <div key={s.userId}><h4>{names.get(s.userId) ?? s.userId}</h4><ul>{s.components.map(c => <li key={c.outcomeKey}>{c.outcomeKey}: {c.weight} × {(c.participationBasisPoints / 100).toFixed(2)}% = {Number(c.rawScore) / 10000} {t("points")}</li>)}</ul></div>)}<p>{t("Input fingerprint")}: <code className="evaluation-fingerprint">{snapshot.inputHash}</code></p></details>
    <details><summary>{t("Outcomes not included in this calculation")}</summary><ul>{snapshot.outcomes.filter(o => o.eligibility !== "ELIGIBLE").map((o, i) => <li key={o.outcomeId ?? i}>{o.title}: {o.reasons.map(r => t(reasonLabels[r])).join(" · ")}</li>)}</ul></details>
    {snapshot.outcomes.some(o => o.verificationMode === "SOLO_SELF_CONFIRMED") && <p className="contribution-note">{t("Single-participant result: self-acknowledged, without independent peer approval.")}</p>}
  </section>;
}

export function EvaluationComparison({ projectId, periodId, shares, selectedId, select }: { projectId: string; periodId: string; shares: AllocationShareInput[]; selectedId?: string | null; select?: (id: string | null) => void }) {
  const { t, language } = useI18n(); const [page, setPage] = useState(1); const history = useWorkspaceResource(projectId, "evaluation-snapshots", () => api.snapshots(projectId, periodId, page), { periodId, page });
  const latest = useWorkspaceResource(projectId, "evaluation-snapshots", () => api.snapshots(projectId, periodId, 1), { periodId, page: 1 });
  const id = selectedId ?? latest.data?.items[0]?.id;
  const snapshot = useWorkspaceResource(projectId, "evaluation-snapshot", () => api.snapshot(projectId, id!), id, Boolean(id));
  if (history.isLoading) return <WorkspaceLoading />;
  if (history.isError) return <WorkspaceError error={history.error} retry={() => void history.refetch()} />;
  if (!history.data?.items.length) return <p className="contribution-note">{t("Create an evaluation snapshot to compare suggestions with your proposal.")}</p>;
  return <section className="contribution-section"><label>{t("Evaluation snapshot")}<select aria-label={t("Evaluation snapshot")} value={selectedId ?? ""} onChange={e => select?.(e.target.value || null)} disabled={!select}><option value="">{t("Compare latest without attaching")}</option>{selectedId && !history.data.items.some(s => s.id === selectedId) && <option value={selectedId}>{t("Current selection")}</option>}{history.data.items.map(s => <option key={s.id} value={s.id}>{new Date(s.calculatedAt).toLocaleString(language)}{s.isStale ? ` · ${t("Source changed")}` : ""}</option>)}</select></label><WorkspacePager data={history.data} page={page} onPage={setPage} />{snapshot.isLoading || latest.isLoading ? <WorkspaceLoading /> : snapshot.isError || latest.isError ? <WorkspaceError error={snapshot.error ?? latest.error} retry={() => { void snapshot.refetch(); void latest.refetch(); }} /> : snapshot.data && <EvaluationSnapshotResult snapshot={snapshot.data} shares={shares} />}</section>;
}

export function ContributionEvaluationPanel({ projectId, isOwner, readOnly }: { projectId: string; isOwner: boolean; readOnly: boolean }) {
  const { t, language } = useI18n(); const [periodId, setPeriodId] = useState(""); const [page, setPage] = useState(1); const [ruleEditor, setRuleEditor] = useState(false); const [editing, setEditing] = useState<ContributionEvaluationRow | null>(null); const [reviewId, setReviewId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null); const [snapshotId, setSnapshotId] = useState<string | null>(null); const [historyPage, setHistoryPage] = useState(1); const requestKey = useRequestKey();
  const periods = useWorkspaceResource(projectId, "allocation-periods", () => contributionsApi.periods(projectId));
  const selected = periodId || periods.data?.[0]?.id;
  const board = useWorkspaceResource(projectId, "evaluation-board", () => api.board(projectId, selected!, page), { selected, page }, Boolean(selected));
  const history = useWorkspaceResource(projectId, "evaluation-snapshots", () => api.snapshots(projectId, selected!, historyPage), { periodId: selected, page: historyPage }, Boolean(selected));
  const run = useWorkspaceResource(projectId, "evaluation-run", () => api.run(projectId, runId!), runId, Boolean(runId));
  const selectedSnapshot = snapshotId ?? history.data?.items[0]?.id;
  const snapshot = useWorkspaceResource(projectId, "evaluation-snapshot", () => api.snapshot(projectId, selectedSnapshot!), selectedSnapshot, Boolean(selectedSnapshot));
  const calculate = useWorkspaceCommand(projectId, () => { const data = { periodId: selected!, ruleId: board.data!.rule!.id }; return api.calculate(projectId, { ...data, clientKey: requestKey({ ...data, previousRun: run.data?.status === "FAILED" || run.data?.status === "COMPLETED" ? runId : null }) }); });
  useEffect(() => { if (!runId || (run.data && run.data.status !== "QUEUED")) return; const timer = window.setInterval(() => { void run.refetch(); }, 2000); return () => window.clearInterval(timer); }, [runId, run.data?.status, run.refetch]);
  useEffect(() => { if (run.data?.status === "COMPLETED" && run.data.snapshotId) { setSnapshotId(run.data.snapshotId); void history.refetch(); } }, [run.data?.status, run.data?.snapshotId, history.refetch]);
  if (periods.isLoading) return <WorkspaceLoading />;
  if (periods.isError) return <WorkspaceError error={periods.error} retry={() => void periods.refetch()} />;
  if (!selected) return <p className="contribution-empty">{t("Create an allocation period first to define the scope of evaluation.")}</p>;
  if (board.isLoading) return <WorkspaceLoading />;
  if (board.isError || !board.data) return <WorkspaceError error={board.error} retry={() => void board.refetch()} />;
  const data = board.data;
  if (ruleEditor) return <RuleEditor projectId={projectId} rule={data.rule} close={() => setRuleEditor(false)} />;
  if (editing && data.rule) return <EvaluationEditor projectId={projectId} row={editing} rule={data.rule} people={data.roster} close={() => setEditing(null)} />;
  return <section className="contribution-section"><header className="evaluation-heading"><div><h3>{t("Contribution evaluation")}</h3><p className="contribution-note">{t("Confirmed outcomes explain the suggestion. Your team still decides the final allocation.")}</p></div><Badge variant="outline">{t("Provisional")}</Badge></header>
    <div className="contribution-filters"><label>{t("Allocation period")}<select value={selected} onChange={async e => { const id = e.target.value; if (await canLeaveWorkspace()) { setPeriodId(id); setPage(1); setHistoryPage(1); setReviewId(null); setRunId(null); setSnapshotId(null); } }}>{periods.data?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>{isOwner && !readOnly && <Button variant="outline" onClick={() => setRuleEditor(true)}>{t("Publish evaluation rules")}</Button>}</div>
    {data.rule ? <details><summary>{data.rule.title} · v{data.rule.version}</summary><p className="contribution-prose">{data.rule.rationale}</p><p>{t("Default outcome weight")}: {data.rule.defaultWeight} · {t("Maximum outcome weight")}: {data.rule.maxWeight}</p></details> : <p className="contribution-note">{t("The project owner needs to publish evaluation rules before work can be evaluated.")}</p>}
    <dl className="evaluation-coverage" aria-label={t("Evaluation coverage")}>{([["eligible", "Confirmed outcomes"], ["pending", "Pending confirmation"], ["disputed", "Disputed"], ["excluded", "Excluded from calculation"]] as const).map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{data.coverage[key]}</dd></div>)}</dl>
    <p className="contribution-note">{data.coverage.eligible}/{data.coverage.total} {t("registered outcomes included")}. {t("Unregistered work is not represented. Suggestions may change as records are reviewed.")}</p>
    {!data.items.length ? <p className="contribution-empty">{t("Document work in Work contributions, then return here to propose its weight and participation.")}</p> : <ul className="evaluation-outcomes">{data.items.map((row, index) => <li key={row.outcomeId ?? row.sources[0]?.id ?? index}><div><strong>{row.title}</strong><p><Badge variant="outline">{t(statusLabels[row.eligibility])}</Badge>{row.outcomeKey && <span> {row.outcomeKey}</span>}</p><ul className="contribution-note">{row.reasons.map(reason => <li key={reason}>{t(reasonLabels[reason])}</li>)}</ul></div><div className="contribution-actions">{row.evaluation && <Button variant="outline" onClick={async () => { if (await canLeaveWorkspace()) setReviewId(reviewId === row.evaluation!.id ? null : row.evaluation!.id); }}>{t("Review evaluation")}</Button>}{data.rule && !readOnly && (isOwner || row.sources.some(s => s.participants.includes(data.currentActorId))) && <Button variant="outline" onClick={async () => { if (await canLeaveWorkspace()) setEditing(row); }}>{t(row.evaluation ? "Revise evaluation" : "Propose evaluation")}</Button>}</div></li>)}</ul>}
    <WorkspacePager data={data} page={page} onPage={setPage} />
    {reviewId && <EvaluationReview key={reviewId} projectId={projectId} evaluationId={reviewId} people={data.roster} />}
    <div className="contribution-actions"><Button disabled={!data.rule || readOnly || calculate.isPending || Boolean(runId && (!run.data || run.data.status === "QUEUED"))} onClick={async () => { try { const result = await calculate.mutateAsync(); setRunId(result.id); } catch { /* Preserve retry identity. */ } }}>{t("Calculate suggestion snapshot")}</Button><Link className="coord-inline-link" to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&contributionTab=allocation`}>{t("Contribution allocation")}</Link></div>
    {runId && (!run.data || run.data.status === "QUEUED") && <p role="status">{t("Calculating confirmed outcomes. You can continue working while the snapshot is prepared.")}</p>}
    {run.data?.status === "FAILED" && <p role="alert">{t("Calculation failed. Check current rules and try creating a new snapshot.")}</p>}
    {(calculate.isError || run.isError || history.isError) && <WorkspaceError error={calculate.error ?? run.error ?? history.error} retry={() => { void run.refetch(); void history.refetch(); }} />}
    {history.data && history.data.items.length > 0 && <><label>{t("Calculation history")}<select value={selectedSnapshot ?? ""} onChange={e => setSnapshotId(e.target.value)}>{history.data.items.map(s => <option key={s.id} value={s.id}>{new Date(s.calculatedAt).toLocaleString(language)}</option>)}</select></label><WorkspacePager data={history.data} page={historyPage} onPage={setHistoryPage} /></>}
    {snapshot.isLoading ? <WorkspaceLoading /> : snapshot.isError ? <WorkspaceError error={snapshot.error} retry={() => void snapshot.refetch()} /> : snapshot.data && <EvaluationSnapshotResult snapshot={snapshot.data} />}
  </section>;
}
