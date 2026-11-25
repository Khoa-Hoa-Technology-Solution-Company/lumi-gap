import { useState } from "react";
import { compatibleManuscriptTemplates, MANUSCRIPT_DOCUMENT_TYPES, MANUSCRIPT_TEMPLATE_REGISTRY, type ManuscriptTemplate, type ManuscriptType } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Input } from "@/components/ui/input";

function TemplatePreview({ id, large = false }: { id: ManuscriptTemplate; large?: boolean }) {
  const { t } = useI18n(), [failed, setFailed] = useState(false);
  return failed ? <span className="writing-template-unavailable">{t("Preview unavailable. The source template can still be selected.")}</span>
    : <img className={large ? "writing-template-preview-large" : "writing-template-thumbnail"} src={MANUSCRIPT_TEMPLATE_REGISTRY[id].previewAsset} alt={large ? t("Compiled layout preview") : ""} loading="lazy" onError={() => setFailed(true)} />;
}

export function ManuscriptTemplates({ documentType, value, onChange }: { documentType: ManuscriptType; value: ManuscriptTemplate; onChange: (template: ManuscriptTemplate) => void }) {
  const { t } = useI18n(), [expanded, setExpanded] = useState(false), [search, setSearch] = useState("");
  const compatible = compatibleManuscriptTemplates(documentType);
  const canExpand = compatible.some(item => item.category === "PUBLISHER");
  const searchable = expanded && compatible.length >= 6;
  const visible = compatible.filter(item => (expanded || item.category !== "PUBLISHER") && (!searchable || `${t(item.name)} ${t(item.description)} ${item.keywords.join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const selected = MANUSCRIPT_TEMPLATE_REGISTRY[value];
  return <section className="writing-template-gallery" aria-label={t("Choose a starting template")}>
    <div className="writing-template-heading"><h3>{t("Choose a starting template")}</h3><span>{t(MANUSCRIPT_DOCUMENT_TYPES[documentType].label)}</span></div>
    {searchable ? <div className="writing-form-field">
      <label htmlFor="manuscript-template-search">{t("Search templates")}</label>
      <Input id="manuscript-template-search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Name, purpose or publisher…")} />
    </div> : null}
    <fieldset className="writing-template-options"><legend className="sr-only">{t("Choose a starting template")}</legend><div className="writing-template-grid">
      {visible.map(item => <label key={item.id} className={`writing-template-card${value === item.id ? " is-selected" : ""}`}>
        <input className="writing-template-radio" type="radio" required name="manuscript-template" value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} />
        <span className="writing-template-image"><TemplatePreview id={item.id} /></span>
        <span className="writing-template-copy"><strong>{t(item.name)}</strong>{item.id === MANUSCRIPT_DOCUMENT_TYPES[documentType].defaultTemplate ? <span className="writing-template-recommended">{t("Recommended")}</span> : null}<small>{t(item.description)}</small></span>
      </label>)}
    </div></fieldset>
    {!visible.length ? <p role="status">{t("No matching templates for this document type.")}</p> : null}
    {canExpand ? <button type="button" className="writing-template-expand" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setSearch(""); }}>{t(expanded ? "Show basic templates" : "More conference / journal templates")}</button> : null}
    <details className="writing-template-preview" key={value}><summary>{t("Preview selected template")}: {t(selected.name)}</summary><p>{t("Compiled from this starter with illustrative text. Check the venue's current author instructions before submitting.")}</p><TemplatePreview id={value} large /><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{t("Class documentation")}</a></details>
  </section>;
}
