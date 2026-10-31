import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TagCampaignPreflight } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { usePlanTagCampaign, useTagCampaignPreflight } from "../hooks/use-tag-campaigns";
import { CampaignStateBadge } from "./catalog-badges";
import { apiErr } from "./catalog-ui";

export const TAG_CAMPAIGN_DEFAULT_TARGET = 100;

const NOTICE_CLASS = "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300";
const BLOCK_CLASS = "rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400";

const count = (value: number) => value.toLocaleString("en");

/** The most works a campaign may sample: the server limit, and never more than OpenAlex has. */
export function maxCampaignTarget(preflight: Pick<TagCampaignPreflight, "maxTarget" | "population">): number {
  return Math.min(preflight.maxTarget, preflight.population);
}

export function defaultCampaignTarget(preflight: Pick<TagCampaignPreflight, "maxTarget" | "population">): number {
  return Math.min(TAG_CAMPAIGN_DEFAULT_TARGET, maxCampaignTarget(preflight));
}

/** The target as a whole number within 1..max, or undefined when the text is not one. */
export function parseCampaignTarget(value: string, max: number): number | undefined {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const number = Number(text);
  return number >= 1 && number <= max ? number : undefined;
}

/** Nights needed to embed the papers already waiting plus the new ones. Undefined when the rate is unknown. */
export function embeddingDays(backlog: TagCampaignPreflight["embeddingBacklog"], target: number): number | undefined {
  if (!(backlog.papersPerDay > 0)) return undefined;
  return Math.ceil((backlog.pendingPapers + target) / backlog.papersPerDay);
}

export function TagCampaignDialog({ tag, onClose }: {
  tag?: { id: string; name: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={Boolean(tag)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {tag ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{t("Plan an OpenAlex campaign")}</DialogTitle>
              <DialogDescription>
                {t("Samples works for “{{name}}” from OpenAlex. Planning only prepares the campaign: nothing is downloaded until you start it on the pipeline page.", { name: tag.name })}
              </DialogDescription>
            </DialogHeader>
            <TagCampaignForm key={tag.id} tag={tag} onClose={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TagCampaignForm({ tag, onClose }: { tag: { id: string; name: string }; onClose: () => void }) {
  const { t } = useI18n();
  const preflight = useTagCampaignPreflight(tag.id);

  if (preflight.data) return <TagCampaignBody tag={tag} preflight={preflight.data} onClose={onClose} />;

  if (preflight.isError && !preflight.isFetching) {
    return (
      <div className="space-y-4">
        <p role="alert" className="break-words text-sm text-destructive">{t(apiErr(preflight.error))}</p>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="button" onClick={() => void preflight.refetch()}>{t("Retry")}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("Checking OpenAlex…")}
    </p>
  );
}

function TagCampaignBody({ tag, preflight, onClose }: {
  tag: { id: string; name: string };
  preflight: TagCampaignPreflight;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const plan = usePlanTagCampaign(tag.id);
  const max = maxCampaignTarget(preflight);
  const [value, setValue] = useState(String(defaultCampaignTarget(preflight)));
  const target = parseCampaignTarget(value, max);
  const invalid = target === undefined;
  const blocked = !preflight.openAlexKeyConfigured || preflight.liveCampaign !== null;
  const days = embeddingDays(preflight.embeddingBacklog, target ?? 0);
  const perDay = count(preflight.embeddingBacklog.papersPerDay);
  const pending = count(preflight.embeddingBacklog.pendingPapers);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (target === undefined || blocked) return;
    try {
      await plan.mutateAsync(target);
      toast.success(t("Campaign planned for “{{name}}”. Start it on the pipeline page: nothing is downloaded until then.", { name: tag.name }));
      onClose();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("Works in OpenAlex (upper bound)")}</dt>
          <dd className="font-medium tabular-nums">{count(preflight.population)}</dd>
          <dd className="text-xs text-muted-foreground">{t("One work can match several queries, so the real number may be lower.")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Local papers")}</dt>
          <dd className="font-medium tabular-nums">{count(preflight.tag.paperCount)}</dd>
        </div>
      </dl>

      {preflight.queries.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("OpenAlex queries")}</p>
          <ul className="space-y-1.5">
            {preflight.queries.map((query) => (
              <li key={query.filterExpression} data-testid="campaign-query" className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-1.5">
                <code className="min-w-0 break-all font-mono text-[11px]">{query.filterExpression}</code>
                <span className="shrink-0 text-xs font-medium tabular-nums">{count(query.population)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {max < 1 ? (
        <p role="alert" className={BLOCK_CLASS}>{t("OpenAlex has no works for the include rules of this tag.")}</p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="tag-campaign-target" className="text-sm font-medium">{t("Works to sample")}</label>
          <Input
            id="tag-campaign-target"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            value={value}
            aria-invalid={invalid}
            aria-describedby="tag-campaign-target-hint"
            onChange={(event) => setValue(event.target.value)}
            className="max-w-[10rem]"
          />
          <p id="tag-campaign-target-hint" className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={invalid ? "alert" : undefined}>
            {invalid
              ? t("Enter a whole number from {{min}} to {{max}}.", { min: 1, max: count(max) })
              : t("The campaign takes a random sample of the works above. “Fetch from OpenAlex” takes the most cited works instead.")}
          </p>
          {days !== undefined && !invalid ? (
            <p className="text-xs text-muted-foreground" data-testid="campaign-estimate">
              {days === 1
                ? t("Embedding these papers takes about 1 day at {{perDay}} papers per night, with {{pending}} papers already waiting.", { perDay, pending })
                : t("Embedding these papers takes about {{days}} days at {{perDay}} papers per night, with {{pending}} papers already waiting.", { days: count(days), perDay, pending })}
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-2 empty:hidden">
        {preflight.liveCampaign ? (
          <div role="alert" className={BLOCK_CLASS} data-testid="notice-live">
            {t("A campaign for this tag is still in progress. Finish or cancel it on the pipeline page before planning another.")}{" "}
            <CampaignStateBadge state={preflight.liveCampaign.state} />
          </div>
        ) : null}
        {!preflight.openAlexKeyConfigured ? (
          <p role="alert" className={BLOCK_CLASS} data-testid="notice-key">
            {t("No OpenAlex API key is configured on the server, so a campaign cannot be planned yet.")}
          </p>
        ) : null}
        {!preflight.ingestWorkerOnline ? (
          <p className={NOTICE_CLASS} data-testid="notice-worker">
            {t("The ingest worker is offline. You can plan the campaign now, but it cannot start until the worker runs.")}
          </p>
        ) : null}
        {preflight.keywordRulesSkipped > 0 ? (
          <p className={NOTICE_CLASS} data-testid="notice-keywords">
            {t("{{count}} include rules on keywords are not used: the keywords are hidden or over the limit per tag.", { count: count(preflight.keywordRulesSkipped) })}
          </p>
        ) : null}
        {preflight.excludeRuleCount > 0 ? (
          <p className={NOTICE_CLASS} data-testid="notice-excludes">
            {t("OpenAlex cannot apply {{count}} exclude rules. Works they exclude may be imported, and are left untagged.", { count: count(preflight.excludeRuleCount) })}
          </p>
        ) : null}
      </div>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" disabled={invalid || blocked || plan.isPending}>
          {plan.isPending ? t("Planning…") : t("Plan campaign")}
        </Button>
      </DialogFooter>
    </form>
  );
}
