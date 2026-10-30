import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { TopicBackfillRun, TopicBackfillTargetKind } from "@trend/shared-types";
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
import { backfillErrorCode, useAdminRequestTopicBackfill } from "@/features/topic-backfill";
import { apiErr } from "./catalog-ui";

export const BACKFILL_MIN_PAPERS = 1;
export const BACKFILL_MAX_PAPERS = 1000;
export const BACKFILL_DEFAULT_PAPERS = 100;

export interface BackfillTarget {
  kind: TopicBackfillTargetKind;
  id: string;
  name: string;
}

/** The budget as a whole number in range, or undefined when the text is not one. */
export function parseBackfillBudget(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const number = Number(text);
  return number >= BACKFILL_MIN_PAPERS && number <= BACKFILL_MAX_PAPERS ? number : undefined;
}

export function BackfillDialog({ target, onClose, onStarted }: {
  target?: BackfillTarget;
  onClose: () => void;
  /** Called with the run once the request was accepted (new or attached to a live one). */
  onStarted?: (run: TopicBackfillRun, created: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {target ? <BackfillForm key={`${target.kind}:${target.id}`} target={target} onClose={onClose} onStarted={onStarted} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BackfillForm({ target, onClose, onStarted }: {
  target: BackfillTarget;
  onClose: () => void;
  onStarted: ((run: TopicBackfillRun, created: boolean) => void) | undefined;
}) {
  const { t } = useI18n();
  const request = useAdminRequestTopicBackfill();
  const [value, setValue] = useState(String(BACKFILL_DEFAULT_PAPERS));
  const budget = parseBackfillBudget(value);
  const invalid = budget === undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (budget === undefined) return;
    try {
      const result = await request.mutateAsync({ targetKind: target.kind, targetId: target.id, maxNewPapers: budget });
      toast.success(result.created
        ? t("Import started for “{{name}}”. It runs in the background.", { name: target.name })
        : t("An import for “{{name}}” is already running.", { name: target.name }));
      onStarted?.(result.run, result.created);
      onClose();
    } catch (error) {
      toast.error(backfillErrorCode(error) === "TAG_HAS_NO_INCLUDE_RULES" ? t("Add an include rule first.") : t(apiErr(error)));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <DialogHeader className="text-left">
        <DialogTitle>{t("Fetch from OpenAlex")}</DialogTitle>
        <DialogDescription>
          {t("Imports papers for “{{name}}” from OpenAlex into LumiGap. It runs in the background and may take a few minutes.", { name: target.name })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="backfill-max-papers" className="text-sm font-medium">{t("New papers to import")}</label>
        <Input
          id="backfill-max-papers"
          type="number"
          inputMode="numeric"
          min={BACKFILL_MIN_PAPERS}
          max={BACKFILL_MAX_PAPERS}
          step={1}
          value={value}
          aria-invalid={invalid}
          aria-describedby="backfill-max-papers-hint"
          onChange={(event) => setValue(event.target.value)}
          className="max-w-[10rem]"
        />
        <p id="backfill-max-papers-hint" className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={invalid ? "alert" : undefined}>
          {invalid
            ? t("Enter a whole number from {{min}} to {{max}}.", { min: BACKFILL_MIN_PAPERS, max: BACKFILL_MAX_PAPERS })
            : t("The import stops after this many new papers. Papers already in LumiGap are skipped.")}
        </p>
      </div>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="submit" disabled={invalid || request.isPending}>
          {request.isPending ? t("Starting…") : t("Start import")}
        </Button>
      </DialogFooter>
    </form>
  );
}
