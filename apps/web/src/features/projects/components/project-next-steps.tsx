import { useState } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

export function ProjectNextSteps({ project, onAddPaper, onNavigate }: { project: IProject; onAddPaper: () => void; onNavigate: (tab: "members" | "gaps", settings?: boolean) => void }) {
  const { t } = useI18n();
  const userId = useAuthStore(state => state.user?.id);
  const [params, setParams] = useSearchParams();
  const key = `lumigap.project-next-steps.v1.${userId}.${project._id}`;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === "dismissed"; } catch { return false; } });
  if (project.accessRole !== "OWNER" || project.status === "ARCHIVED" || params.get("welcome") !== "1" || dismissed) return null;
  return <aside className="project-next-steps" aria-labelledby="project-next-steps-title" data-no-i18n>
    <div className="flex items-start justify-between gap-3"><div><h2 id="project-next-steps-title" className="text-lg font-semibold">{t("Your project is ready")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Choose a next step, or begin anywhere in your workspace.")}</p></div>
      <button type="button" className="project-next-steps-dismiss" aria-label={t("Dismiss next steps")} onClick={() => { setDismissed(true); try { localStorage.setItem(key, "dismissed"); } catch { /* Optional preference storage. */ } const next = new URLSearchParams(params); next.delete("welcome"); setParams(next, { replace: true }); }}><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
    <div className="project-next-steps-actions">
      {[{ label: "Define research objective", run: () => onNavigate("members", true) }, { label: "Invite teammates", run: () => onNavigate("members") }, { label: "Add first paper", run: onAddPaper }, { label: "Explore the research workspace", run: () => onNavigate("gaps") }].map(item => <button key={item.label} type="button" onClick={item.run}>{t(item.label)}<ArrowUpRight aria-hidden="true" /></button>)}
    </div>
  </aside>;
}
