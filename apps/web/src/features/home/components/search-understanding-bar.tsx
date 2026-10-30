import { Sparkles, Tag, X } from "lucide-react";
import type { DetectedTag, DetectedTagFilterKey, DetectedTagKind, SearchUnderstanding } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { homeTagFilter, withAutoTagsOff, withAutoTagsOn, withoutTagFilter, withTagFilter } from "../utils/home-search";

const MAX_SUGGESTED_TAGS = 5;

interface SearchUnderstandingBarProps {
  /** meta.understanding of the current response; undefined while loading or when the backend omits it. */
  understanding: SearchUnderstanding | undefined;
  /** Current URL state; the pinned tag and `autoTags=false` are read from it. */
  searchParams: URLSearchParams;
  /** Receives the next URL state; the page decides how to navigate. */
  onChange: (next: URLSearchParams) => void;
}

export function SearchUnderstandingBar({ understanding, searchParams, onChange }: SearchUnderstandingBarProps) {
  const { t, language } = useI18n();
  const pinned = homeTagFilter(searchParams);
  const autoTagsOff = searchParams.get("autoTags") === "false";

  const kindLabel = (kind: DetectedTagKind) => t(kind === "topic" ? "Topic" : kind === "keyword" ? "Keyword" : kind === "tag" ? "Tag" : kind === "subfield" ? "Research subfield" : kind === "field" ? "Research field" : "Research domain");
  const pinnedText = (key: DetectedTagFilterKey, name: string) => t(
    key === "topicIds" ? "Filtered by topic: {{name}}" : key === "keywordIds" ? "Filtered by keyword: {{name}}" : key === "tagIds" ? "Filtered by tag: {{name}}" : key === "subfieldIds" ? "Filtered by subfield: {{name}}" : key === "fieldIds" ? "Filtered by field: {{name}}" : "Filtered by domain: {{name}}",
    { name },
  );

  if (pinned) {
    const text = pinnedText(pinned.key, pinned.label);
    return <div className="search-understanding" data-testid="search-understanding">
      <span className="search-understanding-chip" data-variant="active"><Tag aria-hidden="true" /><span>{text}</span>
        <button type="button" className="search-understanding-remove" aria-label={t("Remove filter: {{name}}", { name: pinned.label })} onClick={() => onChange(withoutTagFilter(searchParams))}><X aria-hidden="true" /></button>
      </span>
    </div>;
  }

  if (understanding?.mode === "filter" && understanding.appliedTag && !autoTagsOff) {
    const tag = understanding.appliedTag;
    return <div className="search-understanding" data-testid="search-understanding">
      <span className="search-understanding-chip" data-variant="active"><Sparkles aria-hidden="true" /><span>{t("Showing papers in {{name}} ({{count}} papers)", { name: tag.name, count: tag.paperCount.toLocaleString(language) })}</span>
        <button type="button" className="search-understanding-remove" aria-label={t("Search all papers instead")} title={t("Search all papers instead")} onClick={() => onChange(withAutoTagsOff(searchParams))}><X aria-hidden="true" /></button>
      </span>
      <span className="search-understanding-hint">{t("Detected from your query")}</span>
    </div>;
  }

  if (understanding?.mode === "boost" && !autoTagsOff && understanding.detectedTags.length > 0) {
    const tags: DetectedTag[] = understanding.detectedTags.slice(0, MAX_SUGGESTED_TAGS);
    const note = understanding.fellBack ? t("Too few papers in {{name}}, showing broader results.", { name: tags[0]!.name }) : null;
    return <div className="search-understanding" data-testid="search-understanding">
      <div className="search-understanding-row">
        <span className="search-understanding-label">{t("Related topics:")}</span>
        <ul className="search-understanding-list">
          {tags.map((tag) => <li key={`${tag.kind}:${tag.id}`}>
            <button type="button" className="search-understanding-chip" data-variant="suggestion" aria-label={t("Filter results by {{kind}}: {{name}}", { kind: kindLabel(tag.kind), name: tag.name })} onClick={() => onChange(withTagFilter(searchParams, { key: tag.filter.key, value: tag.filter.value, label: tag.name }))}>
              <span>{tag.name}</span><span className="search-understanding-kind">{kindLabel(tag.kind)}</span>
            </button>
          </li>)}
        </ul>
      </div>
      {note ? <span className="search-understanding-hint">{note}</span> : null}
    </div>;
  }

  if (autoTagsOff) {
    return <div className="search-understanding" data-testid="search-understanding">
      <button type="button" className="search-understanding-link" onClick={() => onChange(withAutoTagsOn(searchParams))}>{t("Detect topic again")}</button>
    </div>;
  }

  return null;
}
