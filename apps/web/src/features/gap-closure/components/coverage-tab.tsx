import { Fragment, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { CoverageCheckView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { apiErrorMessage, apiErrorStatus, formatRate, parseDoiLines } from "../closure-format";
import { useCoverageChecks, useCreateCoverageCheck } from "../hooks/use-gap-closure";

const TEXTAREA_CLASS = "min-h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs";

/** Coverage checks: how many reference DOIs from an independent source LumiGap and OpenAlex can find. */
export function CoverageTab() {
  const { t } = useI18n();
  const create = useCreateCoverageCheck();
  const list = useCoverageChecks();
  const [topic, setTopic] = useState("");
  const [referenceSource, setReferenceSource] = useState("");
  const [doiText, setDoiText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CoverageCheckView | null>(null);
  const dois = parseDoiLines(doiText);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreated(null);
    if (topic.trim().length < 2 || referenceSource.trim().length < 3 || dois.length === 0) {
      setError(t("Fill in the topic, where the reference list comes from, and at least one DOI."));
      return;
    }
    try {
      const result = await create.mutateAsync({ topic: topic.trim(), referenceSource: referenceSource.trim(), dois });
      setCreated(result);
      toast.success(t("Coverage check saved."));
    } catch (err) {
      const status = apiErrorStatus(err);
      const serverMessage = apiErrorMessage(err, "");
      const message = status === 503
        ? `${t("OpenAlex could not be reached, so nothing was saved. Try again in a few minutes.")} ${serverMessage}`.trim()
        : serverMessage || t("Could not run the coverage check.");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">{t("New coverage check")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("Take a reference list that did not come from the LumiGap search, for example the references of a survey or a list from an expert. We look up every DOI in the LumiGap corpus and in OpenAlex. The DOIs found in neither show how much of the literature the search cannot see (pHat).")}
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coverage-topic">{t("Topic")}</Label>
              <Input id="coverage-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} />
              <p className="text-[11px] text-muted-foreground">{t("Use the same topic as the gap, so closure checks of that gap find this coverage check.")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-source">{t("Where the reference list comes from")}</Label>
              <Input id="coverage-source" value={referenceSource} onChange={(event) => setReferenceSource(event.target.value)} maxLength={300} />
              <p className="text-[11px] text-muted-foreground">{t("For example: the reference list of a survey, with its DOI.")}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coverage-dois">{t("Reference DOIs (one per line)")}</Label>
            <textarea id="coverage-dois" value={doiText} onChange={(event) => setDoiText(event.target.value)} className={TEXTAREA_CLASS} />
            <p className="text-[11px] text-muted-foreground">{t("{{count}} DOIs after removing duplicates", { count: dois.length })}</p>
          </div>
          {error && <p role="alert" className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Button type="submit" disabled={create.isPending} className="gap-2">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {create.isPending ? t("Looking up DOIs...") : t("Run coverage check")}
          </Button>
        </form>
        {created && <CoverageResult coverage={created} highlight />}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("Coverage checks")}</h2>
        {list.isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
        {list.isError && <p role="alert" className="text-sm text-rose-600">{t("Could not load the coverage checks.")}</p>}
        {list.data && list.data.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No coverage check yet.")}</p>
        )}
        {list.data && list.data.length > 0 && <CoverageTable checks={list.data} />}
      </section>
    </div>
  );
}

function FoundMark({ found }: { found: boolean }) {
  const { t } = useI18n();
  return found
    ? <Check className="h-4 w-4 text-emerald-600" aria-label={t("Found")} />
    : <X className="h-4 w-4 text-rose-600" aria-label={t("Not found")} />;
}

function CoverageResult({ coverage, highlight }: { coverage: CoverageCheckView; highlight?: boolean }) {
  const { t } = useI18n();
  const foundLocal = coverage.items.filter((item) => item.foundLocal).length;
  const foundOpenAlex = coverage.items.filter((item) => item.foundOpenAlex).length;
  return (
    <div className={cn("space-y-3 rounded-2xl border p-4", highlight && "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5")}>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <Stat label={t("Reference DOIs")} value={String(coverage.m)} />
        <Stat label={t("Found in LumiGap")} value={String(foundLocal)} />
        <Stat label={t("Found in OpenAlex")} value={String(foundOpenAlex)} />
        <Stat label={t("Found in neither (x)")} value={String(coverage.x)} />
        <Stat label="pHat" value={formatRate(coverage.pHat)} />
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("pHat = {{value}} is the upper bound of {{x}} / {{m}} missing DOIs at {{confidence}}% confidence.", {
          value: formatRate(coverage.pHat),
          x: coverage.x,
          m: coverage.m,
          confidence: Math.round((1 - coverage.delta) * 100),
        })}
      </p>
      <CoverageItems coverage={coverage} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/70 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold">{value}</dd>
    </div>
  );
}

function CoverageItems({ coverage }: { coverage: CoverageCheckView }) {
  const { t } = useI18n();
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>{t("DOI")}</TableHead>
          <TableHead>{t("Title")}</TableHead>
          <TableHead className="text-center">{t("LumiGap")}</TableHead>
          <TableHead className="text-center">{t("OpenAlex")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coverage.items.map((item, index) => {
          const missing = !item.foundLocal && !item.foundOpenAlex;
          return (
            <TableRow key={`${item.position}-${item.doi}`} className={cn(missing && "bg-rose-50/70 dark:bg-rose-500/10")}>
              <TableCell>{index + 1}</TableCell>
              <TableCell className="break-all font-mono">{item.doi}</TableCell>
              <TableCell>{item.title ?? "-"}</TableCell>
              <TableCell className="text-center"><div className="flex justify-center"><FoundMark found={item.foundLocal} /></div></TableCell>
              <TableCell className="text-center"><div className="flex justify-center"><FoundMark found={item.foundOpenAlex} /></div></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CoverageTable({ checks }: { checks: CoverageCheckView[] }) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>{t("Topic")}</TableHead>
          <TableHead>{t("Reference source")}</TableHead>
          <TableHead className="text-right">m</TableHead>
          <TableHead className="text-right">x</TableHead>
          <TableHead className="text-right">pHat</TableHead>
          <TableHead>{t("Date")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {checks.map((check) => {
          const open = openId === check.id;
          return (
            <Fragment key={check.id}>
              <TableRow className="cursor-pointer" onClick={() => setOpenId(open ? null : check.id)}>
                <TableCell>
                  <button type="button" aria-expanded={open} aria-label={t("Show DOIs")} className="text-muted-foreground" onClick={(event) => { event.stopPropagation(); setOpenId(open ? null : check.id); }}>
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </TableCell>
                <TableCell className="font-semibold">{check.topic}</TableCell>
                <TableCell className="max-w-xs break-words">{check.referenceSource}</TableCell>
                <TableCell className="text-right">{check.m}</TableCell>
                <TableCell className="text-right">{check.x}</TableCell>
                <TableCell className="text-right font-semibold">{formatRate(check.pHat)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(check.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
              {open && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/30"><CoverageItems coverage={check} /></TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
