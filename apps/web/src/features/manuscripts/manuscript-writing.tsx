import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { ManuscriptWritingReport } from "@trend/shared-types";
import { manuscriptsApi } from "./manuscripts.api";
import { useAuthStore } from "@/stores/auth-store";

export function WritingReportResult({ report }: { report: ManuscriptWritingReport }) {
  const { t, language } = useI18n(), result = report.result;
  if (!result) return null;
  const words = (units: number) => (units / 1000).toLocaleString(language, { maximumFractionDigits: 3 });
  return <div className="writing-contribution-result">
    <p className="writing-small">{report.snapshotLabel} · v{report.sourceVersion}{report.calculatedAt ? ` · ${new Date(report.calculatedAt).toLocaleString(language)}` : ""}</p>
    {report.isStale && <p role="status" className="writing-notice">{t("The manuscript changed. This report still describes the saved version.")}</p>}
    <p><strong>{result.totalWords.toLocaleString(language)} {t("prose words")}</strong> · {(result.coverageBasisPoints / 100).toFixed(2)}% {t("with recorded attribution")}</p>
    <progress max={10000} value={result.coverageBasisPoints} aria-label={t("Writing attribution coverage")} />
    <p className="writing-small">{t("Unattributed words")}: {words(result.unknownWordUnits)}</p>
    {result.members.length ? <ul className="writing-contributor-list">{result.members.map(member => <li key={member.userId}><div><strong>{member.name}</strong><span>{words(member.retainedWordUnits)} {t("word equivalents")}</span></div><div><span>{(member.overallBasisPoints / 100).toFixed(2)}% {t("of all prose")}</span><progress max={10000} value={member.overallBasisPoints} aria-label={`${member.name}: ${(member.overallBasisPoints / 100).toFixed(2)}%`} /></div></li>)}</ul> : <p>{t("No attributable writing yet. New edits will be tracked from now on; old text is not assigned to its uploader.")}</p>}
    <details><summary>{t("How writing attribution works")}</summary><p>{t("Only retained prose is counted. Mixed words are divided by character ownership. Deleted text, comments, bibliography and common LaTeX commands do not add writing credit.")}</p><p>{t("Recorded insertion does not prove intellectual authorship: pasted or AI text may be included. Research, analysis and review must be evaluated separately.")}</p><p>{t("Writing suggestions are normalized over attributed words only. Unknown text stays visible and every participant must confirm before contribution scoring.")}</p></details>
  </div>;
}

export function ManuscriptWriting({ projectId, manuscriptId, canWrite, prepare, currentVersion }: { projectId: string; manuscriptId: string; canWrite: boolean; prepare: () => Promise<string>; currentVersion?: number }) {
  const { t } = useI18n(), client = useQueryClient();
  const [page, setPage] = useState(1), [selectedId, setSelectedId] = useState<string | null>(null), [created, setCreated] = useState(false);
  const userId = useAuthStore(state => state.user?.id);
  const key = ["manuscript-writing", userId, projectId, manuscriptId];
  const history = useQuery({ queryKey: [...key, page], queryFn: () => manuscriptsApi.writingReports(projectId, manuscriptId, page), refetchInterval: query => query.state.data?.items.some(r => r.status === "QUEUED") ? 2000 : false });
  const id = selectedId ?? history.data?.items[0]?.id;
  const detail = useQuery({ queryKey: [...key, "report", id], queryFn: () => manuscriptsApi.writingReport(projectId, manuscriptId, id!), enabled: Boolean(id), refetchInterval: query => query.state.data?.status === "QUEUED" ? 1500 : false });
  const calculate = useMutation({ mutationFn: async () => manuscriptsApi.requestWritingReport(projectId, manuscriptId, await prepare()), onSuccess: async report => { setSelectedId(report.id); setCreated(false); setPage(1); client.setQueryData([...key, "report", report.id], report); await client.invalidateQueries({ queryKey: key }); } });
  const retry = useMutation({ mutationFn: async () => manuscriptsApi.requestWritingReport(projectId, manuscriptId, detail.data!.snapshotId), onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); } });
  const draft = useMutation({ mutationFn: () => manuscriptsApi.writingContribution(projectId, manuscriptId, id!), onMutate: () => { setSelectedId(id!); }, onSuccess: () => { setCreated(true); } });
  const busy = calculate.isPending || draft.isPending || retry.isPending;
  const pending = busy || detail.data?.status === "QUEUED";
  function selectReport(next: string | null, nextPage = page) {
    if (busy) return;
    setSelectedId(next); setPage(nextPage); setCreated(false);
    calculate.reset(); draft.reset(); retry.reset();
  }
  return <section className="writing-context writing-contributions"><h2>{t("Writing contributions")}</h2><p className="writing-small">{t("See which retained text each account contributed. This is writing evidence, not the final project contribution percentage.")}</p>
    {canWrite && <Button size="sm" disabled={pending} onClick={() => calculate.mutate()}>{t(calculate.isPending ? "Saving a version for analysis…" : "Save version and calculate writing")}</Button>}
    {(history.isLoading || (id && detail.isLoading)) && <p role="status">{t("Loading writing evidence…")}</p>}
    {(history.isError || detail.isError || calculate.isError || draft.isError || retry.isError) && <div role="alert"><p className="writing-error">{t("Could not complete writing analysis. Your manuscript is preserved.")}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (calculate.isError && canWrite) calculate.mutate(); else if (draft.isError && canWrite) draft.mutate(); else if (retry.isError && canWrite) retry.mutate(); else { void history.refetch(); if (id) void detail.refetch(); } }}>{t("Try again")}</Button></div>}
    {history.data?.items.length ? <label>{t("Writing report version")}<select disabled={busy} value={id ?? ""} onChange={e => selectReport(e.target.value)}>{selectedId && !history.data.items.some(r => r.id === selectedId) && detail.data && <option value={selectedId}>{detail.data.snapshotLabel}</option>}{history.data.items.map(report => <option value={report.id} key={report.id}>{report.snapshotLabel} · v{report.sourceVersion}</option>)}</select></label> : !history.isLoading && <p>{t("Save a version to calculate a reproducible writing report.")}</p>}
    {history.data && (page > 1 || history.data.hasNext) && <div className="writing-pagination"><Button size="sm" variant="outline" disabled={busy || page === 1} onClick={() => selectReport(null, page - 1)}>{t("Previous")}</Button><span>{page}</span><Button size="sm" variant="outline" disabled={busy || !history.data.hasNext} onClick={() => selectReport(null, page + 1)}>{t("Next")}</Button></div>}
    {detail.data?.status === "QUEUED" && <p role="status">{t("Tracing retained words and their edit history. You can continue writing.")}</p>}
    {detail.data?.status === "FAILED" && <div role="alert"><p>{t("Writing analysis was interrupted. Retry this saved version.")}</p>{canWrite && <Button size="sm" disabled={busy} onClick={() => retry.mutate()}>{t("Try again")}</Button>}</div>}
    {detail.data?.status === "COMPLETED" && <><WritingReportResult report={{ ...detail.data, isStale: detail.data.isStale || (currentVersion !== undefined && currentVersion !== detail.data.sourceVersion) }} />{canWrite && Boolean(detail.data.result?.attributedWordUnits) && <Button size="sm" variant="outline" disabled={busy || created} onClick={() => draft.mutate()}>{t(created ? "Contribution draft created" : "Create contribution draft from this report")}</Button>}{created && <p><Link to={`/projects/${projectId}?tab=contributions`}>{t("Open contributions to review and submit")}</Link></p>}</>}
  </section>;
}
