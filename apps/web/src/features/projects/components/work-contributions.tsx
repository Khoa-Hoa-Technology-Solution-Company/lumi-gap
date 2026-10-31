import { useRef, useState, type FormEvent } from "react";
import {
  contributionCategories,
  creditRoles,
  inferContributionCategoryFromRoles,
  type ContributionArtifactLink,
  type ContributionCategoryKey,
  type ContributionInput,
  type CreditRole,
  type WorkContribution,
  type WorkspaceLink,
  type WorkspacePerson,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, WorkspaceArtifactPicker, WorkspaceError, WorkspaceLoading, WorkspacePager, useUnsavedWorkspace } from "./workspace-common";
import { ContributionArtifactReference } from "./contribution-artifact-link";
import { contributionDate } from "../utils/contribution-date";
import { CONTRIBUTION_CATEGORY_META } from "../utils/contribution-percentage";

export const creditLabels: Record<CreditRole, string> = { CONCEPTUALIZATION: "Conceptualization", DATA_CURATION: "Data curation", FORMAL_ANALYSIS: "Formal analysis", FUNDING_ACQUISITION: "Funding acquisition", INVESTIGATION: "Investigation", METHODOLOGY: "Methodology", PROJECT_ADMINISTRATION: "Project administration", RESOURCES: "Resources", SOFTWARE: "Software", SUPERVISION: "Supervision", VALIDATION: "Validation", VISUALIZATION: "Visualization", WRITING_ORIGINAL_DRAFT: "Writing - original draft", WRITING_REVIEW_EDITING: "Writing - review and editing" };
export const contributionStatusLabels: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Pending acknowledgement", ACCEPTED: "Acknowledged by a peer", NEEDS_CHANGES: "Changes requested", DISPUTED: "Disputed", SELF_RECORDED: "Self-recorded", CONFIRMED: "Legacy academic confirmation", PENDING_CONFIRMATION: "Legacy pending confirmation", REJECTED: "Legacy rejected" };
const historyActionLabels: Record<string, string> = { CREATED: "Record created", CORRECTED: "Record corrected", SUBMITTED: "Submitted for acknowledgement", ACKNOWLEDGE: "Roles acknowledged", ACCEPT: "Acknowledged by a peer", NEEDS_CHANGES: "Changes requested", DISPUTE: "Disputed", PROPOSED: "Legacy pending confirmation", CONFIRMED: "Legacy academic confirmation", REJECTED: "Legacy rejected" };

function ContributionEditor({ projectId, currentUserId, existing, readOnly, close, saved }: { projectId: string; currentUserId: string; existing?: WorkContribution; readOnly: boolean; close: () => void; saved: (record: WorkContribution) => void }) {
  const { t } = useI18n(); const [dirty, setDirty] = useState(false); const attempt = useRef<{ content: string; key: string }>(); const saving = useRef(false);
  const [title, setTitle] = useState(existing?.title ?? ""); const [description, setDescription] = useState(existing?.description ?? ""); const [evidence, setEvidence] = useState(existing?.evidence ?? "");
  const [category, setCategory] = useState<ContributionCategoryKey>(existing?.category ?? "EXECUTION_VALIDATION");
  const [date, setDate] = useState(existing ? contributionDate(existing.workDate) : contributionDate()); const [source, setSource] = useState<ContributionInput["source"]>(existing?.source === "WORKSPACE" ? "WORKSPACE" : "MANUAL");
  const [participants, setParticipants] = useState<{ userId: string; roles: CreditRole[] }[]>(existing?.participants.map(p => ({ userId: p.userId, roles: p.roles })) ?? [{ userId: currentUserId, roles: [] }]);
  const [refs, setRefs] = useState<ContributionArtifactLink[]>(existing?.evidenceRefs ?? []); const [link, setLink] = useState<WorkspaceLink | null>(null); const [reason, setReason] = useState("");
  const [taskSearch, setTaskSearch] = useState(""); const [taskId, setTaskId] = useState("");
  const tasks = useWorkspaceResource(projectId, "contribution-task-choices", () => workspaceApi.tasks(projectId, { q: taskSearch, page: 1, pageSize: 50 }), taskSearch);
  const people = useWorkspaceResource(projectId, "contribution-people", () => workspaceApi.people(projectId));
  const save = useWorkspaceCommand(projectId, (input: ContributionInput & { clientKey?: string; expectedVersion?: number; correctionReason?: string }) => contributionsApi.save(projectId, input, existing?.id));
  useUnsavedWorkspace(dirty || save.isPending);
  async function submit(e: FormEvent) { e.preventDefault(); if (readOnly || saving.current) return; const input = { title, description, category, source, workDate: `${date}T00:00:00+07:00`, participants, evidence, evidenceRefs: refs }; const content = JSON.stringify(input); if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() }; saving.current = true; try { const record = await save.mutateAsync({ ...input, ...(existing ? { expectedVersion: existing.version, correctionReason: reason } : { clientKey: attempt.current.key }) }); setDirty(false); saved(record); } finally { saving.current = false; } }
  const roster = new Map<string, WorkspacePerson>(people.data?.items.map(p => [p.id, p])); existing?.participants.forEach(p => { if (!roster.has(p.userId)) roster.set(p.userId, { id: p.userId, name: p.name }); });
  return <form className="contribution-editor" onChange={() => setDirty(true)} onSubmit={e => void submit(e).catch(() => undefined)}>
    <h3>{t(existing ? "Create a visible correction" : "Record work contribution")}</h3>
    <fieldset disabled={readOnly || save.isPending} className="contribution-editor-fields">
    <label>{t("Title")}<input required minLength={3} maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>{t("Contribution category")}<select value={category} onChange={e => setCategory(e.target.value as ContributionCategoryKey)}>{contributionCategories.map(cat => <option key={cat} value={cat}>{t(CONTRIBUTION_CATEGORY_META[cat].title)} — {t(CONTRIBUTION_CATEGORY_META[cat].examples)}</option>)}</select></label>
    <label>{t("Description")}<textarea required minLength={20} maxLength={5000} rows={4} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <div className="coord-form-pair"><label>{t("Work date")}<input type="date" required max={contributionDate()} value={date} onChange={e => setDate(e.target.value)} /></label><label>{t("Source")}<select value={source} onChange={e => setSource(e.target.value as ContributionInput["source"])}><option value="MANUAL">{t("Offline or external work")}</option><option value="WORKSPACE">{t("Work in LumiGap")}</option></select></label></div>
    <fieldset><legend>{t("Participants and CRediT roles")}</legend>{[...roster.values()].map(p => {
      const selected = participants.find(v => v.userId === p.id);
      return <div className="contribution-person" key={p.id}><label><input type="checkbox" checked={Boolean(selected)} disabled={p.id === currentUserId} onChange={e => setParticipants(e.target.checked ? [...participants, { userId: p.id, roles: [] }] : participants.filter(v => v.userId !== p.id))} />{p.name}</label>{selected && <div className="contribution-role-options">{creditRoles.map(role => <label key={role}><input type="checkbox" checked={selected.roles.includes(role)} onChange={e => setParticipants(participants.map(v => v.userId !== p.id ? v : { ...v, roles: e.target.checked ? [...v.roles, role] : v.roles.filter(r => r !== role) }))} />{t(creditLabels[role])}</label>)}</div>}</div>;
    })}</fieldset>
    {people.isError && <WorkspaceError error={people.error} retry={() => void people.refetch()} />}
    <p className="contribution-note">{t("CRediT describes types of work, not percentages or authorship eligibility.")} <a href="https://credit.niso.org/contributor-roles/" target="_blank" rel="noreferrer">CRediT</a></p>
    <label>{t("Explanatory evidence")}<textarea rows={3} maxLength={5000} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
    <WorkspaceArtifactPicker projectId={projectId} value={link} onChange={setLink} /><Button type="button" size="sm" variant="outline" disabled={!link} onClick={() => { if (link && !refs.some(r => r.id === link.id && r.kind === link.kind)) setRefs([...refs, link]); setLink(null); setDirty(true); }}>{t("Add evidence reference")}</Button>
    <label>{t("Find a related task")}<input type="search" value={taskSearch} maxLength={200} onChange={e => setTaskSearch(e.target.value)} /></label><label>{t("Related task")}<select aria-label={t("Related task")} value={taskId} onChange={e => setTaskId(e.target.value)}><option value="">{t("Choose a task")}</option>{tasks.data?.items.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><Button type="button" variant="outline" size="sm" disabled={!taskId} onClick={() => { if (!refs.some(r => r.kind === "TASK" && r.id === taskId)) setRefs([...refs, { kind: "TASK", id: taskId }]); setTaskId(""); setDirty(true); }}>{t("Link task deliverable")}</Button>{tasks.isError && <WorkspaceError error={tasks.error} retry={() => void tasks.refetch()} />}
    <ul>{refs.map((r, i) => <li key={`${r.kind}:${r.id}`}><ContributionArtifactReference projectId={projectId} link={r} /><Button type="button" size="sm" variant="ghost" onClick={() => { setRefs(refs.filter((_, index) => index !== i)); setDirty(true); }}>{t("Remove reference")}</Button></li>)}</ul>
    {existing && <label>{t("Correction reason")}<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
    {save.isError && <WorkspaceError error={save.error} />}
    </fieldset>
    <div className="contribution-actions"><Button type="submit" disabled={readOnly || save.isPending}>{t("Save draft")}</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={async () => { if (!save.isPending && await canLeaveWorkspace()) close(); }}>{t("Cancel")}</Button></div>
  </form>;
}

export function WorkDetail({ projectId, item, currentUserId, readOnly, edit }: { projectId: string; item: WorkContribution; currentUserId: string; readOnly: boolean; edit?: () => void }) {
  const { t } = useI18n(); const [note, setNote] = useState("");
  const submit = useWorkspaceCommand(projectId, () => contributionsApi.submit(projectId, item.id, item.version));
  const review = useWorkspaceCommand(projectId, (decision: string) => contributionsApi.review(projectId, item.id, { expectedVersion: item.version, decision, note }));
  useUnsavedWorkspace(Boolean(note.trim()) || review.isPending);
  const viewer = item.viewerId || currentUserId;
  const creator = item.createdBy.id === viewer, responded = item.reviews.some(r => r.version === item.version && r.userId === viewer);
  const acknowledge = item.reviewActions.includes("ACKNOWLEDGE"), accept = item.reviewActions.includes("ACCEPT");
  const resolvedCategory = item.category ?? inferContributionCategoryFromRoles(item.participants.flatMap(p => p.roles));
  return <article className="contribution-detail"><header><h3>{item.title}</h3><Badge variant="outline">{t(CONTRIBUTION_CATEGORY_META[resolvedCategory]?.title ?? resolvedCategory)}</Badge><Badge variant="outline">{t(contributionStatusLabels[item.status] ?? item.status)}</Badge><small>v{item.version}</small></header>
    <p className="contribution-prose">{item.description}</p><p>{t("Source")}: {t(item.source === "MANUAL" ? "Offline or external work" : item.source === "WORKSPACE" ? "Work in LumiGap" : "Legacy academic record")} · {contributionDate(item.workDate)}</p>
    <ul className="contribution-participants">{item.participants.map(p => <li key={p.userId}><strong>{p.name}</strong><span>{p.roles.map(role => t(creditLabels[role] ?? role)).join(", ") || t("No role specified")}</span><small>{p.userId === item.createdBy.id ? t("Declared by record creator") : item.reviews.some(r => r.version === item.version && r.userId === p.userId && r.decision === "ACKNOWLEDGE") ? t("Roles acknowledged") : t("Attribution awaiting acknowledgement")}</small></li>)}</ul>
    <h4>{t("Evidence and deliverables")}</h4><p className="contribution-prose">{item.evidence || t("No explanatory evidence provided")}</p>{item.evidenceRefs.map(r => <ContributionArtifactReference projectId={projectId} link={r} detail={item.evidenceRefDetails?.find(d => d.kind === r.kind && d.id === r.id)} key={`${r.kind}:${r.id}`} />)}
    <p className="contribution-note">{t("Acknowledgement confirms reported work, not its scientific quality or relative effort.")}</p>
    {!readOnly && creator && item.canManage && <div className="contribution-actions">{edit && <Button variant="outline" onClick={async () => { if (await canLeaveWorkspace()) edit?.(); }}>{t(item.status === "DRAFT" ? "Edit draft" : "Create a visible correction")}</Button>}{item.status === "DRAFT" && <Button disabled={submit.isPending} onClick={() => submit.mutate()}>{t("Submit for acknowledgement")}</Button>}</div>}
    {!readOnly && item.reviewActions.length > 0 && <div className="contribution-response"><label>{t("Review feedback")}<textarea value={note} disabled={review.isPending} maxLength={2000} onChange={e => setNote(e.target.value)} /></label><div className="contribution-actions">{!responded && (acknowledge || accept) && <Button disabled={review.isPending} onClick={() => review.mutate(acknowledge ? "ACKNOWLEDGE" : "ACCEPT", { onSuccess: () => setNote("") })}>{t(acknowledge ? "Acknowledge my roles" : "Acknowledge as independent peer")}</Button>}{item.reviewActions.includes("NEEDS_CHANGES") && <Button variant="outline" disabled={review.isPending || note.trim().length < 10} onClick={() => review.mutate("NEEDS_CHANGES", { onSuccess: () => setNote("") })}>{t("Request changes")}</Button>}{item.reviewActions.includes("DISPUTE") && <Button variant="outline" disabled={review.isPending || note.trim().length < 10} onClick={() => review.mutate("DISPUTE", { onSuccess: () => setNote("") })}>{t("Challenge attribution")}</Button>}</div></div>}
    {(submit.isError || review.isError) && <WorkspaceError error={submit.error ?? review.error} />}
    <h4>{t("Review feedback")}</h4><ul>{item.reviews.map((r, i) => <li key={`${r.userId}:${r.version}:${i}`}><strong>{r.name}</strong> · v{r.version} · {t(r.decision === "ACKNOWLEDGE" ? "Roles acknowledged" : r.decision === "ACCEPT" ? "Acknowledged by a peer" : r.decision === "DISPUTE" ? "Disputed" : "Changes requested")}<p>{r.note}</p><time dateTime={r.createdAt}>{r.createdAt.slice(0, 10)}</time></li>)}</ul>
    <details><summary>{t("Revision history")}</summary>{item.history.map(h => <div className="contribution-history-item" key={h.id}><strong>v{h.version} · {t(historyActionLabels[h.action] ?? h.action)}</strong><p>{h.note}</p><time>{h.createdAt.slice(0, 10)}</time><details><summary>{t("Recorded snapshot")}</summary><pre>{JSON.stringify(h.snapshot, null, 2)}</pre></details></div>)}</details>
  </article>;
}

export function WorkContributionsPanel({ projectId, currentUserId, readOnly }: { projectId: string; currentUserId: string; readOnly: boolean }) {
  const { t } = useI18n(); const [q, setQ] = useState(""); const [filter, setFilter] = useState("TEAM"); const [page, setPage] = useState(1); const [selected, setSelected] = useState<string | null>(null); const [editor, setEditor] = useState<"new" | WorkContribution | null>(null);
  const list = useWorkspaceResource(projectId, "work-contributions", () => contributionsApi.work(projectId, { q, filter, page, pageSize: 20 }), { q, filter, page });
  const detail = useWorkspaceResource(projectId, "work-contribution-detail", () => contributionsApi.detail(projectId, selected!), selected, Boolean(selected));
  if (editor) return <ContributionEditor key={typeof editor === "string" ? "new" : `${editor.id}:${editor.version}`} projectId={projectId} currentUserId={list.data?.currentActorId ?? currentUserId} existing={typeof editor === "string" ? undefined : editor} readOnly={readOnly} close={() => setEditor(null)} saved={record => { setSelected(record.id); setEditor(null); }} />;
  return <div className="contribution-section"><div className="contribution-filters"><label>{t("Search contributions")}<input type="search" value={q} maxLength={200} onChange={e => { setQ(e.target.value); setPage(1); }} /></label><label>{t("Show")}<select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="TEAM">{t("Team contributions")}</option><option value="MINE">{t("My contributions")}</option><option value="PENDING">{t("Pending acknowledgements")}</option><option value="DISPUTED">{t("Disputed records")}</option></select></label>{!readOnly && <Button disabled={!list.data?.currentActorId} onClick={async () => { if (await canLeaveWorkspace()) setEditor("new"); }}>{t("Record work contribution")}</Button>}</div>
    {list.isLoading ? <WorkspaceLoading /> : list.isError ? <WorkspaceError error={list.error} retry={() => void list.refetch()} /> : <>{!list.data?.items.length && <p className="contribution-empty">{t("Record literature synthesis, experiments, analysis or other work, including work done outside LumiGap.")}</p>}<ul className="contribution-list">{list.data?.items.map(item => { const cat = item.category ?? inferContributionCategoryFromRoles(item.participants.flatMap(p => p.roles)); return <li key={item.id}><button type="button" aria-pressed={selected === item.id} onClick={async () => { if (item.id === selected || await canLeaveWorkspace()) setSelected(item.id); }}><span><strong>{item.title}</strong><small>{t(CONTRIBUTION_CATEGORY_META[cat]?.title ?? cat)} · {item.participants.map(p => p.name).join(", ")} · {contributionDate(item.workDate)}</small></span><Badge variant="outline">{t(contributionStatusLabels[item.status] ?? item.status)}</Badge></button></li>; })}</ul><WorkspacePager data={list.data} page={page} onPage={setPage} /></>}
    {selected && (detail.isLoading ? <WorkspaceLoading /> : detail.isError ? <WorkspaceError error={detail.error} retry={() => void detail.refetch()} /> : detail.data && <WorkDetail key={detail.data.id} projectId={projectId} item={detail.data} currentUserId={currentUserId} readOnly={readOnly} edit={() => setEditor(detail.data!)} />)}
  </div>;
}
