import { useState } from "react";
import { Loader2, Play, Plus, Sigma, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  CalibrationLabelSource,
  CalibrationQuestionResult,
  ClosureCalibrationMode,
  ClosureCalibrationView,
  ClosureJudgeKind,
  QuestionFacets,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { apiErrorMessage, apiErrorStatus, compactFacets, formatRate } from "../closure-format";
import {
  useAddCalibrationQuestion,
  useClosureCalibration,
  useClosureCalibrations,
  useComputeCalibration,
  useCreateClosureCalibration,
  useDeleteCalibrationQuestion,
  useRunCalibration,
} from "../hooks/use-gap-closure";
import { FacetInputs } from "./facet-inputs";

const SELECT_CLASS = "h-9 w-full rounded-md border bg-background px-3 text-sm";

/** Message for a failed request; a 403 explains the missing capability instead of a bare error. */
function useFriendlyError() {
  const { t } = useI18n();
  return (error: unknown, fallback: string): string => {
    if (apiErrorStatus(error) === 403) {
      return `${t("You do not have the research-gap validation capability, which is needed for this action.")} ${apiErrorMessage(error, "")}`.trim();
    }
    return apiErrorMessage(error, fallback);
  };
}

function useJudgeNames(): Record<ClosureJudgeKind, string> {
  const { t } = useI18n();
  return { AI: t("AI judge"), HUMAN: t("Human judge") };
}

function useModeNames(): Record<ClosureCalibrationMode, string> {
  const { t } = useI18n();
  return { IN_SITU: t("In situ (B = epsHat)"), TRANSFER: t("Transfer (B = epsHat + pHat)") };
}

/** Calibrations: questions known to be answered, run through the procedure to measure how often it misses (epsHat). */
export function CalibrationsTab() {
  const { t } = useI18n();
  const list = useClosureCalibrations();
  const judgeNames = useJudgeNames();
  const modeNames = useModeNames();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t("Calibrations")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("A calibration is a set of questions that are known to be answered, each with the DOI of a paper that answers it. We run the same procedure on them. The share the procedure fails to close is its miss rate (epsHat).")}
          </p>
        </div>
        {list.isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
        {list.isError && <p role="alert" className="text-sm text-rose-600">{t("Could not load the calibrations.")}</p>}
        {list.data && list.data.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No calibration yet.")}</p>
        )}
        {list.data && list.data.length > 0 && (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("Name")}</TableHead>
                <TableHead>{t("Domain")}</TableHead>
                <TableHead>{t("Judge")}</TableHead>
                <TableHead>{t("Mode")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Missed / questions")}</TableHead>
                <TableHead className="text-right">epsHat</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((item) => (
                <TableRow key={item.id} className={cn(selectedId === item.id && "bg-muted/50")}>
                  <TableCell className="font-semibold">{item.name}</TableCell>
                  <TableCell>{item.domain}</TableCell>
                  <TableCell>{judgeNames[item.judgeKind]}</TableCell>
                  <TableCell>{modeNames[item.mode]}</TableCell>
                  <TableCell><CalibrationStatusBadge status={item.status} /></TableCell>
                  <TableCell className="text-right">{item.status === "COMPUTED" ? `${item.misses} / ${item.n}` : "-"}</TableCell>
                  <TableCell className="text-right font-semibold">{item.epsHat !== undefined && item.epsHat !== null ? formatRate(item.epsHat) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>{t("Open")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <CreateCalibrationForm onCreated={(created) => setSelectedId(created.id)} />

      {selectedId && <CalibrationDetail id={selectedId} />}
    </div>
  );
}

function CalibrationStatusBadge({ status }: { status: ClosureCalibrationView["status"] }) {
  const { t } = useI18n();
  const names = { DRAFT: t("Draft"), RUNNING: t("Running"), COMPUTED: t("Computed") };
  return <Badge variant={status === "COMPUTED" ? "default" : "outline"} className="text-[10px] uppercase">{names[status]}</Badge>;
}

function CreateCalibrationForm({ onCreated }: { onCreated: (calibration: ClosureCalibrationView) => void }) {
  const { t } = useI18n();
  const friendly = useFriendlyError();
  const judgeNames = useJudgeNames();
  const modeNames = useModeNames();
  const create = useCreateClosureCalibration();
  const canCreate = useAuthStore((state) => state.user?.systemRole === "ADMIN" || Boolean(state.user?.capabilities?.includes("GAP_VALIDATION")));
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [judgeKind, setJudgeKind] = useState<ClosureJudgeKind>("AI");
  const [mode, setMode] = useState<ClosureCalibrationMode>("TRANSFER");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 3 || domain.trim().length < 2) {
      setError(t("Give the calibration a name and a research domain."));
      return;
    }
    try {
      const created = await create.mutateAsync({ name: name.trim(), domain: domain.trim(), judgeKind, mode });
      toast.success(t("Calibration created. Add questions next."));
      setName("");
      setDomain("");
      onCreated(created);
    } catch (err) {
      const message = friendly(err, t("Could not create the calibration."));
      setError(message);
      toast.error(message);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{t("New calibration")}</h2>
      {!canCreate && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          {t("Creating a calibration needs the research-gap validation capability, which verified experts have. You can still read every calibration.")}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="calibration-name">{t("Name")}</Label>
            <Input id="calibration-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calibration-domain">{t("Domain")}</Label>
            <Input id="calibration-domain" value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calibration-judge">{t("Judge")}</Label>
            <select id="calibration-judge" value={judgeKind} onChange={(event) => setJudgeKind(event.target.value as ClosureJudgeKind)} className={SELECT_CLASS}>
              <option value="AI">{judgeNames.AI}</option>
              <option value="HUMAN">{judgeNames.HUMAN}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calibration-mode">{t("Mode")}</Label>
            <select id="calibration-mode" value={mode} onChange={(event) => setMode(event.target.value as ClosureCalibrationMode)} className={SELECT_CLASS}>
              <option value="TRANSFER">{modeNames.TRANSFER}</option>
              <option value="IN_SITU">{modeNames.IN_SITU}</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("In situ: the questions are searched in the same sources as the checks, so a witness missing from them already counts as a miss and no coverage check is needed. Choose it only when the questions and their witness DOIs come from a survey or an expert, not from a LumiGap search, and are in the same field as the gaps. Transfer adds pHat from a coverage check and is the safe default. The mode cannot be changed later.")}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("The judge kind must match the checks it will be used for: an AI calibration only applies to checks decided on AI labels, a human calibration to checks where a person confirmed every label.")}
        </p>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Button type="submit" disabled={create.isPending} className="gap-2">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("Create calibration")}
        </Button>
      </form>
    </section>
  );
}

function CalibrationDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const friendly = useFriendlyError();
  const judgeNames = useJudgeNames();
  const modeNames = useModeNames();
  const userId = useAuthStore((state) => state.user?.id);
  const query = useClosureCalibration(id);
  const run = useRunCalibration(id);
  const compute = useComputeCalibration(id);
  const remove = useDeleteCalibrationQuestion(id);
  const calibration = query.data;
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!calibration) return <p role="alert" className="text-sm text-rose-600">{t("Could not load the calibration.")}</p>;

  const questions = calibration.questions ?? [];
  const isCreator = calibration.createdById === userId;
  const editable = isCreator && calibration.status !== "COMPUTED";
  const resultNames: Record<CalibrationQuestionResult, string> = { PENDING: t("Pending"), FOUND: t("Closed (found)"), MISSED: t("Missed") };

  const runAction = async (action: "run" | "compute") => {
    setActionError(null);
    try {
      if (action === "run") {
        await run.mutateAsync();
        toast.success(t("Calibration started. Each question runs as a closure check in the background."));
      } else {
        await compute.mutateAsync();
        toast.success(t("epsHat computed."));
      }
    } catch (err) {
      const message = friendly(err, action === "run" ? t("Could not start the calibration.") : t("Could not compute epsHat."));
      setActionError(message);
      toast.error(message);
    }
  };

  const removeQuestion = async (questionId: string) => {
    try {
      await remove.mutateAsync(questionId);
    } catch (err) {
      toast.error(friendly(err, t("Could not remove the question.")));
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{calibration.name}</h2>
          <p className="text-xs text-muted-foreground">{calibration.domain} · {judgeNames[calibration.judgeKind]} · {modeNames[calibration.mode]} · <CalibrationStatusBadge status={calibration.status} /></p>
        </div>
        {isCreator && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={run.isPending || calibration.status === "COMPUTED" || questions.length === 0} onClick={() => void runAction("run")}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("Run questions")}
            </Button>
            <Button type="button" size="sm" className="gap-1.5" disabled={compute.isPending || questions.length === 0} onClick={() => void runAction("compute")}>
              {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sigma className="h-4 w-4" />}
              {t("Compute epsHat")}
            </Button>
          </div>
        )}
      </div>

      {!isCreator && <p className="text-xs text-muted-foreground">{t("Only the creator of a calibration can change it. You can read it.")}</p>}
      {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{actionError}</p>}
      {calibration.status === "RUNNING" && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Questions are running. Results appear here by themselves; compute epsHat when none is pending.")}</p>
      )}

      {calibration.status === "COMPUTED" && calibration.epsHat !== undefined && calibration.epsHat !== null && (
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/50 p-4 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <p className="font-semibold">
            {t("epsHat = {{value}}", { value: formatRate(calibration.epsHat) })}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("The procedure missed {{misses}} of {{n}} questions that are known to be answered. {{value}} is the upper bound of that rate at {{confidence}}% confidence.", {
              misses: calibration.misses,
              n: calibration.n,
              value: formatRate(calibration.epsHat),
              confidence: Math.round((1 - calibration.delta) * 100),
            })}
          </p>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No question yet.")}</p>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>{t("Question")}</TableHead>
              <TableHead>{t("Witness DOI")}</TableHead>
              <TableHead>{t("Label source")}</TableHead>
              <TableHead>{t("Result")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="min-w-48">
                  {question.question}
                  {question.witnessQuote && <span className="mt-1 block italic text-muted-foreground">{question.witnessQuote}</span>}
                </TableCell>
                <TableCell className="break-all font-mono">{question.witnessDoi}</TableCell>
                <TableCell>
                  {question.labelSource === "EXPERT_VALIDATION" ? t("Expert validation") : t("Survey")}
                  {question.labelSourceRef && <span className="block break-all text-muted-foreground">{question.labelSourceRef}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px] uppercase", question.result === "MISSED" && "border-rose-400 text-rose-700 dark:text-rose-300", question.result === "FOUND" && "border-emerald-400 text-emerald-700 dark:text-emerald-300")}>
                    {resultNames[question.result]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {editable && question.result === "PENDING" && (
                    <Button type="button" size="icon" variant="ghost" aria-label={t("Remove question")} title={t("Remove question")} disabled={remove.isPending} onClick={() => void removeQuestion(question.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editable && <AddQuestionForm calibrationId={id} />}
    </section>
  );
}

function AddQuestionForm({ calibrationId }: { calibrationId: string }) {
  const { t } = useI18n();
  const friendly = useFriendlyError();
  const add = useAddCalibrationQuestion(calibrationId);
  const [question, setQuestion] = useState("");
  const [facets, setFacets] = useState<QuestionFacets>({});
  const [witnessDoi, setWitnessDoi] = useState("");
  const [witnessQuote, setWitnessQuote] = useState("");
  const [labelSource, setLabelSource] = useState<CalibrationLabelSource>("SURVEY");
  const [labelSourceRef, setLabelSourceRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (question.trim().length < 10 || witnessDoi.trim().length < 5) {
      setError(t("Write the question as a full sentence and give the DOI of a paper that answers it."));
      return;
    }
    try {
      await add.mutateAsync({
        question: question.trim(),
        facets: compactFacets(facets),
        witnessDoi: witnessDoi.trim(),
        witnessQuote: witnessQuote.trim() || undefined,
        labelSource,
        labelSourceRef: labelSourceRef.trim() || undefined,
      });
      toast.success(t("Question added."));
      setQuestion("");
      setFacets({});
      setWitnessDoi("");
      setWitnessQuote("");
      setLabelSourceRef("");
    } catch (err) {
      const message = friendly(err, t("Could not add the question."));
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border border-dashed p-4">
      <h3 className="text-sm font-bold">{t("Add a question")}</h3>
      <div className="space-y-1.5">
        <Label htmlFor="cal-question">{t("Question")}</Label>
        <textarea id="cal-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <FacetInputs value={facets} onChange={setFacets} idPrefix="cal-facet" disabled={add.isPending} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cal-doi">{t("Witness DOI")}</Label>
          <Input id="cal-doi" value={witnessDoi} onChange={(event) => setWitnessDoi(event.target.value)} />
          <p className="text-[11px] text-muted-foreground">{t("A paper known to answer the question.")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-quote">{t("Witness quote (optional)")}</Label>
          <Input id="cal-quote" value={witnessQuote} onChange={(event) => setWitnessQuote(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-source">{t("Where the label comes from")}</Label>
          <select id="cal-source" value={labelSource} onChange={(event) => setLabelSource(event.target.value as CalibrationLabelSource)} className={SELECT_CLASS}>
            <option value="SURVEY">{t("Survey")}</option>
            <option value="EXPERT_VALIDATION">{t("Expert validation")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-ref">{t("Reference of the label (optional)")}</Label>
          <Input id="cal-ref" value={labelSourceRef} onChange={(event) => setLabelSourceRef(event.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <Button type="submit" size="sm" disabled={add.isPending} className="gap-1.5">
        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t("Add question")}
      </Button>
    </form>
  );
}
