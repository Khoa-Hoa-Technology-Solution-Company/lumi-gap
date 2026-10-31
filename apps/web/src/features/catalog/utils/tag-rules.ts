import type { TagRule, TagRuleEffect, TagRuleInput, TagRuleKind, TaxonomyLevel } from "@trend/shared-types";

/** One rule being edited on the tag page; `targetId` is a taxonomy node id or a keyword id. */
export interface RuleDraft {
  ruleKind: TagRuleKind;
  targetId: string;
  effect: TagRuleEffect;
  name: string;
  level?: TaxonomyLevel;
}

export function draftKey(rule: Pick<RuleDraft, "ruleKind" | "targetId">): string {
  return `${rule.ruleKind}:${rule.targetId}`;
}

export function rulesToDrafts(rules: TagRule[]): RuleDraft[] {
  const drafts: RuleDraft[] = [];
  for (const rule of rules) {
    const targetId = rule.ruleKind === "topic" ? rule.researchTopicId : rule.keywordId;
    if (!targetId) continue;
    drafts.push({
      ruleKind: rule.ruleKind,
      targetId,
      effect: rule.effect,
      name: rule.target?.name ?? targetId,
      level: rule.target?.level,
    });
  }
  return drafts;
}

export function draftsToInput(drafts: RuleDraft[]): TagRuleInput[] {
  return drafts.map((draft): TagRuleInput =>
    draft.ruleKind === "topic"
      ? { ruleKind: "topic", researchTopicId: draft.targetId, effect: draft.effect }
      : { ruleKind: "keyword", keywordId: draft.targetId, effect: draft.effect },
  );
}

/** Order-insensitive comparison, used for the "unsaved changes" indicator. */
export function sameRules(a: RuleDraft[], b: RuleDraft[]): boolean {
  if (a.length !== b.length) return false;
  const signature = (rule: RuleDraft) => `${draftKey(rule)}:${rule.effect}`;
  const left = a.map(signature).sort();
  const right = b.map(signature).sort();
  return left.every((value, index) => value === right[index]);
}

/** Search link into the literature page filtered by a taxonomy node. */
export const NODE_FILTER_KEYS = {
  domain: "domainIds",
  field: "fieldIds",
  subfield: "subfieldIds",
  topic: "topicIds",
} as const satisfies Record<TaxonomyLevel, string>;

export function nodeSearchHref(node: { name: string; level: TaxonomyLevel; openalexId: string | null }): string {
  const params = new URLSearchParams({ q: node.name });
  if (node.openalexId) params.set("tag", `${NODE_FILTER_KEYS[node.level]}:${node.openalexId}`);
  params.set("tagLabel", node.name);
  return `/literature?${params.toString()}`;
}

export function tagSearchHref(tag: { id: string; name: string }): string {
  // No query text: the tag name rarely appears in paper text, so browse every paper carrying the tag instead.
  const params = new URLSearchParams({ tag: `tagIds:${tag.id}`, tagLabel: tag.name });
  return `/literature?${params.toString()}`;
}
