import { BookMarked, Search, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { PaperPickerSource } from "./project-paper-picker-dialog";

const sources = [
  { source: "search", title: "Find papers", icon: Search },
  { source: "library", title: "Add saved papers", icon: BookMarked },
  { source: "doi", title: "Add by DOI", icon: FileSearch },
] as const;

export function ProjectLiteratureEmpty({ readOnly, onAdd }: { readOnly: boolean; onAdd: (source: PaperPickerSource) => void }) {
  const { t } = useI18n();
  return <section className="project-literature-empty" aria-labelledby="literature-empty-title">
    <h3 id="literature-empty-title">{t("No papers yet")}</h3>
    <p>{t(readOnly ? "This project is read-only." : "Add a paper from search, your saved library or a DOI.")}</p>
    {!readOnly && <div>{sources.map(({ source, title, icon: Icon }) => <Button key={source} type="button" size="sm" variant={source === "search" ? "default" : "outline"} onClick={() => onAdd(source)}><Icon size={15} className="mr-2" aria-hidden="true" />{t(title)}</Button>)}</div>}
  </section>;
}
