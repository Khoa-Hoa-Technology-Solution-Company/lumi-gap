import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ResearchGapItem } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { GapExpertValidationPanel } from "@/features/gaps/components/gap-expert-validation";
import { ResearchGapEvaluation } from "./research-gap-evaluation";
import { canLeaveWorkspace } from "./workspace-common";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";

export function ResearchGapDrawer({ gap: initialGap, projectId, open, onClose }: { gap: ResearchGapItem; projectId: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const packet = useResearchResource(projectId, ["gap", initialGap.id], () => researchApi.gap(projectId, initialGap.id), open);
  const gap: ResearchGapItem = packet.data ? { ...initialGap, ...packet.data.gap, analysisId: packet.data.gap.analysisId ?? undefined, scope: packet.data.gap.scope ?? undefined, validationStatus: packet.data.gap.validationStatus as ResearchGapItem["validationStatus"], origin: packet.data.gap.origin as ResearchGapItem["origin"] } : initialGap;
  const close = async () => { if ((await canLeaveWorkspace())) onClose(); };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
    <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-white px-5 py-6 sm:px-8" data-no-i18n>
      <header className="flex items-start justify-between gap-5"><div><p className="text-xs text-muted-foreground">{t(gap.origin === "HUMAN" ? "Human proposal" : "AI-suggested candidate")}</p><Dialog.Title className="mt-2 text-xl font-semibold leading-snug">{gap.title}</Dialog.Title><Dialog.Description className="sr-only">{t("Candidate claim, evidence, team assessment and revision history")}</Dialog.Description></div><Button variant="ghost" size="icon" aria-label={t("Close details")} onClick={close}><X size={18} /></Button></header>
      <div className="mt-6 space-y-4 text-sm leading-7"><div><h3 className="font-semibold">{t("Gap claim")}</h3><p className="whitespace-pre-wrap">{gap.description}</p></div><div><h3 className="font-semibold">{t("Why the gap might exist")}</h3><p className="whitespace-pre-wrap text-muted-foreground">{gap.rationale}</p></div></div>
      <div className="mt-6"><ResearchGapEvaluation key={gap.id} projectId={projectId} gapId={gap.id} /></div>
      <details className="mt-6"><summary className="cursor-pointer text-sm font-medium">{t("External expert opinions")}</summary><p className="my-3 text-sm leading-6 text-muted-foreground">{t("Expert opinions apply to the reviewed revision. They are optional and do not establish scientific proof.")}</p><GapExpertValidationPanel gap={gap} canRequestReview={Boolean(packet.data?.canRequestExpertReview)} /></details>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
