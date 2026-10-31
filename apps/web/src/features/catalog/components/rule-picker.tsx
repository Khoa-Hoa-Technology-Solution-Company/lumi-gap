import { useState } from "react";
import type { CatalogKeyword, TagRuleEffect, TaxonomyNode } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { taxonomyApi } from "../api/catalog.api";
import { draftKey, type RuleDraft } from "../utils/tag-rules";
import { AsyncPicker } from "./async-picker";
import { LevelBadge } from "./catalog-badges";
import { SELECT_CLASS } from "./catalog-ui";

type RuleOption =
  | { kind: "topic"; node: TaxonomyNode }
  | { kind: "keyword"; keyword: CatalogKeyword };

const optionId = (option: RuleOption) => (option.kind === "topic" ? `topic:${option.node.id}` : `keyword:${option.keyword.id}`);

async function searchRuleTargets(query: string): Promise<RuleOption[]> {
  const [nodes, keywords] = await Promise.all([
    taxonomyApi.listNodes({ q: query, status: "active", sort: "paperCount", pageSize: 8 }),
    taxonomyApi.listKeywords({ q: query, status: "active", sort: "paperCount", pageSize: 8 }),
  ]);
  return [
    ...nodes.data.map((node): RuleOption => ({ kind: "topic", node })),
    ...keywords.data.map((keyword): RuleOption => ({ kind: "keyword", keyword })),
  ];
}

/** One search box over taxonomy nodes (all levels) and catalogue keywords; the pick becomes an include/exclude rule. */
export function RulePicker({ existing, onAdd }: {
  existing: RuleDraft[];
  onAdd: (rule: RuleDraft) => void;
}) {
  const { t } = useI18n();
  const [effect, setEffect] = useState<TagRuleEffect>("include");
  const taken = new Set(existing.map(draftKey));

  function toDraft(option: RuleOption): RuleDraft {
    return option.kind === "topic"
      ? { ruleKind: "topic", targetId: option.node.id, effect, name: option.node.name, level: option.node.level }
      : { ruleKind: "keyword", targetId: option.keyword.id, effect, name: option.keyword.keywordName };
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        aria-label={t("Rule effect")}
        className={`${SELECT_CLASS} sm:w-32`}
        value={effect}
        onChange={(event) => setEffect(event.target.value as TagRuleEffect)}
      >
        <option value="include">{t("Include")}</option>
        <option value="exclude">{t("Exclude")}</option>
      </select>
      <div className="min-w-0 flex-1">
        <AsyncPicker<RuleOption>
          label={t("Add rule: search topics and keywords")}
          placeholder={t("Search topics, fields or keywords…")}
          cacheKey="tag-rule-targets"
          fetcher={searchRuleTargets}
          getKey={optionId}
          getGroup={(option) => (option.kind === "topic" ? t("Taxonomy") : t("Keywords"))}
          isDisabled={(option) =>
            taken.has(option.kind === "topic" ? `topic:${option.node.id}` : `keyword:${option.keyword.id}`)}
          onSelect={(option) => onAdd(toDraft(option))}
          renderOption={(option) =>
            option.kind === "topic" ? (
              <span className="flex flex-wrap items-center gap-2">
                <LevelBadge level={option.node.level} />
                <span className="min-w-0 flex-1 break-words font-medium">{option.node.name}</span>
                <span className="text-xs text-muted-foreground">{t("{{count}} papers", { count: option.node.paperCount })}</span>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words font-medium">{option.keyword.keywordName}</span>
                <span className="text-xs text-muted-foreground">{t("{{count}} papers", { count: option.keyword.paperCount })}</span>
              </span>
            )}
        />
      </div>
    </div>
  );
}
