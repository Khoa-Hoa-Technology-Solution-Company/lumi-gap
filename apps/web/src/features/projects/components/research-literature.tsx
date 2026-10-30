import { CollaborativeLibrary } from "./collaborative-library";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { canLeaveWorkspace } from "./workspace-common";
import { ScreeningWorkspace } from "./screening-workspace";
import { ResearchEvidence } from "./research-evidence";
import { Button } from "@/components/ui/button";
import "../project-research.css";

export function ResearchLiterature({ projectId, readOnly, children, onAddPaper }: { projectId: string; readOnly: boolean; children: ReactNode; onAddPaper?: () => void }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "library";
  const change = async (value: string) => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.set("view", value); setParams(next, { replace: true }); };
  return <div className="research-workflow" data-no-i18n>
    <nav className="flex flex-wrap gap-2 mb-4" aria-label={t("Literature workspace")}><Button variant={view === "library" ? "default" : "ghost"} onClick={() => void change("library")}>{t("Shared Library")}</Button><Button variant={view === "evidence" ? "default" : "ghost"} onClick={() => void change("evidence")}>{t("Evidence Matrix")}</Button><Button variant={view === "organize" ? "default" : "ghost"} onClick={() => void change("organize")}>{t("Notes & Sources")}</Button><Button variant={view === "screening" ? "default" : "ghost"} onClick={() => void change("screening")}>{t("Review Workflow")}</Button></nav>
    {(view === "evidence") && <Button type="button" variant="ghost" size="sm" className="mb-4" onClick={() => void change("library")}>{t("Back to papers")}</Button>}
    {view === "screening" ? <ScreeningWorkspace key={projectId} projectId={projectId} readOnly={readOnly} /> : view === "evidence" ? <ResearchEvidence projectId={projectId} readOnly={readOnly} /> : view === "library" ? <CollaborativeLibrary key={projectId} projectId={projectId} readOnly={readOnly} onAdd={onAddPaper} /> : children}
  </div>;
}
