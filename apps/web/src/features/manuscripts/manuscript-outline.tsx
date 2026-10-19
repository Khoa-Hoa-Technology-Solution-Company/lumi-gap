import { useCallback, useMemo, useSyncExternalStore } from "react";
import { ListTree } from "lucide-react";
import { useI18n } from "@/i18n";
import type { ManuscriptProvider } from "./collaboration-provider";
import { latexOutline } from "./latex-tools";

export function ManuscriptOutline({ provider, text = "", activeLine, onNavigate }: {
  provider?: ManuscriptProvider; text?: string; activeLine: number; onNavigate: (line: number) => void;
}) {
  const { t } = useI18n();
  const subscribe = useCallback((listener: () => void) => {
    provider?.text.observe(listener);
    return () => provider?.text.unobserve(listener);
  }, [provider]);
  const snapshot = useCallback(() => provider?.text.toString() ?? text, [provider, text]);
  const source = useSyncExternalStore(subscribe, snapshot);
  const headings = useMemo(() => latexOutline(source), [source]);
  const active = [...headings].reverse().find(heading => heading.line <= activeLine);
  return <section className="writing-outline" aria-label={t("File outline")}>
    <header><ListTree aria-hidden="true" /><h2>{t("File outline")}</h2></header>
    <nav aria-label={t("Sections in this file")}>{headings.length ? headings.map(heading => <button key={heading.line} title={heading.title} aria-current={active === heading ? "location" : undefined} style={{ paddingLeft: `${12 + Math.max(0, heading.depth - 1) * 12}px` }} onClick={() => onNavigate(heading.line)}>{heading.title}</button>) : <p>{t("Sections in the selected file appear here.")}</p>}</nav>
  </section>;
}
