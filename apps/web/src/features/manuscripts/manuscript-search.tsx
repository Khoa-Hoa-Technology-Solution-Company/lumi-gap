import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";

export function ManuscriptSearch({ project, manuscript, user, beforeSearch, onSelect }: { project: string; manuscript: string; user: string; beforeSearch: () => Promise<void>; onSelect: (file: string, line: number) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""), [term, setTerm] = useState(""), [matchCase, setMatchCase] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setTerm(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const search = useQuery({ queryKey: ["manuscript-search", user, project, manuscript, term, matchCase], queryFn: async ({ signal }) => { await beforeSearch(); return manuscriptsApi.search(project, manuscript, term, matchCase, signal); }, enabled: term.length >= 2, retry: false, staleTime: 0 });
  return <div className="writing-project-search"><Input autoFocus aria-label={t("Search all source files")} placeholder={t("Search all source files")} maxLength={200} value={query} onChange={event => setQuery(event.target.value)} />
    <label className="writing-search-case"><input type="checkbox" checked={matchCase} onChange={event => setMatchCase(event.target.checked)} />{t("Match case")}</label>
    {query.trim().length < 2 ? <p className="writing-small">{t("Enter at least 2 characters.")}</p> : term !== query.trim() || search.isFetching ? <p role="status">{t("Searching…")}</p> : search.error ? <p role="alert" className="writing-error">{t("Search unavailable. Wait for source sync and try again.")}</p> : search.data ? <><p className="writing-small" role="status">{search.data.matches.length}{search.data.truncated ? "+" : ""} {t("matching lines")}</p><ol className="writing-search-results">{search.data.matches.map(match => <li key={`${match.fileId}:${match.line}`}><button onClick={() => onSelect(match.fileId, match.line)}><strong>{match.path}:{match.line}</strong><code>{match.text}</code></button></li>)}</ol></> : null}
  </div>;
}
