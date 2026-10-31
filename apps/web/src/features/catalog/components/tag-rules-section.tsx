import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { TagDetail, TagRuleEffect } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDelayedTagRefresh, useReplaceTagRules } from "../hooks/use-tags";
import { draftKey, draftsToInput, rulesToDrafts, sameRules, type RuleDraft } from "../utils/tag-rules";
import { LevelBadge } from "./catalog-badges";
import { apiErr } from "./catalog-ui";
import { RulePicker } from "./rule-picker";
import { RETAG_TOAST } from "./tag-dialogs";

function RuleList({ title, effect, rules, onRemove }: {
  title: string;
  effect: TagRuleEffect;
  rules: RuleDraft[];
  onRemove: (rule: RuleDraft) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-2" data-testid={`rules-${effect}`}>
      <h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">({rules.length})</span></h3>
      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {effect === "include" ? t("No include rules yet.") : t("No exclude rules.")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rules.map((rule) => (
            <li key={draftKey(rule)} className="flex items-center gap-2 px-3 py-2 text-sm">
              {rule.ruleKind === "topic" && rule.level ? (
                <LevelBadge level={rule.level} />
              ) : (
                <Badge variant="outline" className="font-normal">{t("Keyword")}</Badge>
              )}
              <span className="min-w-0 flex-1 break-words">{rule.name}</span>
              <button
                type="button"
                aria-label={t("Remove rule {{name}}", { name: rule.name })}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRemove(rule)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TagRulesSection({ tag }: { tag: TagDetail }) {
  const { t } = useI18n();
  const replaceRules = useReplaceTagRules();
  const scheduleRefresh = useDelayedTagRefresh();
  const saved = rulesToDrafts(tag.rules);
  const [drafts, setDrafts] = useState<RuleDraft[]>(saved);
  const dirty = !sameRules(drafts, saved);
  const archived = tag.status === "archived";

  function add(rule: RuleDraft) {
    setDrafts((current) => (current.some((item) => draftKey(item) === draftKey(rule)) ? current : [...current, rule]));
  }

  function remove(rule: RuleDraft) {
    setDrafts((current) => current.filter((item) => draftKey(item) !== draftKey(rule)));
  }

  async function save() {
    try {
      const result = await replaceRules.mutateAsync({ id: tag.id, rules: draftsToInput(drafts) });
      if (result && Array.isArray(result.rules)) setDrafts(rulesToDrafts(result.rules));
      toast.success(t(RETAG_TOAST));
      scheduleRefresh();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="tag-rules-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="tag-rules-heading" className="text-lg font-semibold">{t("Rules")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("A paper gets this tag when it matches any include rule and no exclude rule. Embedding similarity then adds close neighbours.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">{t("Unsaved changes")}</Badge> : null}
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setDrafts(saved)}>{t("Discard")}</Button>
          ) : null}
          <Button size="sm" onClick={save} disabled={!dirty || replaceRules.isPending}>
            {replaceRules.isPending ? t("Saving…") : t("Save rules")}
          </Button>
        </div>
      </div>

      {archived ? (
        <p className="text-sm text-muted-foreground">{t("This tag is archived. Restore it to apply its rules.")}</p>
      ) : null}

      <RulePicker existing={drafts} onAdd={add} />

      <div className="grid gap-4 md:grid-cols-2">
        <RuleList title={t("Include")} effect="include" rules={drafts.filter((rule) => rule.effect === "include")} onRemove={remove} />
        <RuleList title={t("Exclude")} effect="exclude" rules={drafts.filter((rule) => rule.effect === "exclude")} onRemove={remove} />
      </div>
    </section>
  );
}
