import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { canLeaveWorkspace } from "./workspace-common";
import { ResearchScreening } from "./research-screening";
import { ResearchEvidence } from "./research-evidence";
import { Button } from "@/components/ui/button";
import "../project-research.css";

export function ResearchLiterature({ projectId, readOnly, children }: { projectId: string; readOnly: boolean; children: ReactNode }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const change = async (value: string) => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.set("view", value); setParams(next, { replace: true }); };
  return <div className="research-workflow" data-no-i18n>
    {(view === "screening" || view === "evidence") && <Button type="button" variant="ghost" size="sm" className="mb-4" onClick={() => void change("library")}>{t("Back to papers")}</Button>}
    {view === "screening" ? <ResearchScreening projectId={projectId} readOnly={readOnly} /> : view === "evidence" ? <ResearchEvidence projectId={projectId} readOnly={readOnly} /> : children}
  </div>;
}
