import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { gapsApi } from "@/features/gaps/api/gaps.api";
import { useResearchCommand } from "../hooks/use-project-research";
import { WorkspaceError, canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";

export function ResearchGapProposal({ projectId, topic, onClose }: { projectId: string; topic: string; onClose: () => void }) {
  const { t } = useI18n(), command = useResearchCommand(projectId);
  const [form, setForm] = useState({ title: "", topic, establishedKnowledge: "", observedLimitation: "", missingEvidence: "", significanceExplanation: "", scope: "" });
  useUnsavedWorkspace(Object.entries(form).some(([key, value]) => key !== "topic" && Boolean(value.trim())) || form.topic !== topic);
  const fields = [["title", "Candidate title"], ["topic", "Research topic"], ["establishedKnowledge", "What the literature already establishes"], ["observedLimitation", "Gap claim"], ["missingEvidence", "What evidence is still missing"], ["significanceExplanation", "Why the gap might exist"], ["scope", "Research scope"]] as const;
  return <form className="research-form research-editor" data-no-i18n onSubmit={async e => {
    e.preventDefault();
    try { await command.mutateAsync(() => gapsApi.createCandidate({ ...form, projectId, gapType: "OTHER", gapConfidence: "LOW", researchPriority: "MODERATE" })); onClose(); } catch { /* Retain the proposal. */ }
  }}>
    <h3>{t("Propose a gap candidate")}</h3>
    <p className="research-help">{t("Describe an open question. Link supporting and contradictory evidence before recording team support.")}</p>
    {fields.map(([key, label]) => <label key={key}>{t(label)}<textarea required={key !== "scope"} minLength={key === "title" || key === "topic" ? 3 : key === "scope" ? 0 : 10} maxLength={key === "title" || key === "topic" ? 200 : key === "scope" ? 5000 : 10000} value={form[key]} onChange={e => setForm(value => ({ ...value, [key]: e.target.value }))} /></label>)}
    {command.isError && <WorkspaceError error={command.error} />}
    <div className="research-actions"><Button type="submit" disabled={command.isPending}>{t("Save candidate")}</Button><Button type="button" variant="ghost" onClick={() => { if (canLeaveWorkspace()) onClose(); }}>{t("Cancel")}</Button></div>
  </form>;
}
