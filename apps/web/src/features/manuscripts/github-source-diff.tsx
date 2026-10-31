import { useMemo } from "react";
import { useI18n } from "@/i18n";
import { decodeRepositoryContent, type RepositoryFile } from "./manuscript-github-client";
import type { SyncChange } from "./remote-sync-plan";

function text(file?: RepositoryFile) {
  if (!file) return [];
  if (file.content.length > 350_000 || /\.(png|jpe?g|webp|pdf|svg|eps)$/.test(file.path)) return;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(decodeRepositoryContent(file.content));
    if (decoded.includes("\0")) return;
    return decoded.split("\n");
  } catch { return; }
}

/** Focus on the differing range, including changes beyond the first screen. */
export function GithubSourceDiff({ change }: { change: SyncChange }) {
  const { t } = useI18n();
  const preview = useMemo(() => {
    const local = text(change.local), remote = text(change.remote);
    if (!local || !remote) return;
    let prefix = 0, suffix = 0;
    while (prefix < local.length && prefix < remote.length && local[prefix] === remote[prefix]) prefix++;
    while (suffix < local.length - prefix && suffix < remote.length - prefix && local[local.length - suffix - 1] === remote[remote.length - suffix - 1]) suffix++;
    return { local, remote, prefix, suffix };
  }, [change.local, change.remote]);
  const renderVersion = (label: string, lines: string[], present: boolean, added: boolean) => {
    const start = Math.max(0, preview!.prefix - 2), end = Math.min(lines.length, lines.length - preview!.suffix + 2);
    const indices = Array.from({ length: Math.min(60, end - start) }, (_, i) => start + i);
    if (end - start > 60) indices.splice(30, 30, -1, ...Array.from({ length: 30 }, (_, i) => end - 30 + i));
    return <section className="writing-source-version" aria-label={label}>
      <h4>{added ? "+ " : "− "}{label}</h4>
      {!present ? <p className="writing-small">{t("File absent on this side")}</p> : <div className="writing-source-lines" tabIndex={0} aria-label={label + ": " + change.path}>{indices.map(index => index < 0 ? <div key="omitted" className="writing-source-omitted">{t("Unchanged or long sections omitted")}</div> : <div key={index} className={index >= preview!.prefix && index < lines.length - preview!.suffix ? added ? "writing-source-added" : "writing-source-removed" : ""}>
        <span className="writing-source-line-number" aria-hidden="true">{index + 1}</span><code>{lines[index]!.slice(0, 2000)}{lines[index]!.length > 2000 ? "…" : ""}</code>
      </div>)}</div>}
    </section>;
  };
  return <section className="writing-diff-preview" role="region" aria-label={t("Source comparison")}>
    <p className="writing-small">{t("GitHub version (−) and LumiGap version (+). Highlighted lines differ; surrounding lines provide context.")}</p>
    {preview ? <>{renderVersion("GitHub", preview.remote, Boolean(change.remote), false)}{renderVersion("LumiGap", preview.local, Boolean(change.local), true)}</> : <p className="writing-small">{t("Preview unavailable for binary, large or non-UTF8 files. Download the source to inspect it.")}</p>}
    {change.merged ? <details><summary>{t("Merged result")}</summary><pre>{(() => { try { return new TextDecoder("utf-8", { fatal: true }).decode(decodeRepositoryContent(change.merged.content)).slice(0, 8000); } catch { return t("Preview unavailable for binary, large or non-UTF8 files. Download the source to inspect it."); } })()}</pre></details> : null}
  </section>;
}
