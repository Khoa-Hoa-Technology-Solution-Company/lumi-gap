import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookMarked, BookOpen, CheckCircle2, ExternalLink, FileCode2, FileText, Search } from "lucide-react";
import type { ManuscriptReference } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

export type BibliographyMode = "bibtex" | "natbib" | "biblatex" | "manual" | "unconfigured";

export interface BibliographySetupInfo {
  mode: BibliographyMode;
  supportedCommands: Array<"\\cite" | "\\citep" | "\\citet" | "\\autocite" | "\\parencite" | "\\textcite">;
  bibFiles: string[];
  warning: string | null;
}

export function detectBibliographySetup(texSources: string[], bibFilePaths: string[]): BibliographySetupInfo {
  const combined = texSources.join("\n");
  const usesBiblatex = /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}|\\addbibresource\s*\{|\\printbibliography\b/.test(combined);
  const usesNatbib = /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bnatbib\b[^}]*\}|\\bibliographystyle\s*\{\s*(?:plainnat|abbrvnat|unsrtnat|elsarticle-harv|agsm|apa)\s*\}/.test(combined);
  const usesBibtex = /\\bibliography\s*\{[^}]+\}|\\bibliographystyle\s*\{[^}]+\}/.test(combined);
  const usesManualThebibliography = /\\begin\s*\{thebibliography\}/.test(combined);

  if (usesBiblatex) {
    return {
      mode: "biblatex",
      supportedCommands: ["\\cite", "\\autocite", "\\parencite", "\\textcite"],
      bibFiles: bibFilePaths.length ? bibFilePaths : ["references.bib"],
      warning: null,
    };
  }
  if (usesNatbib) {
    return {
      mode: "natbib",
      supportedCommands: ["\\cite", "\\citep", "\\citet"],
      bibFiles: bibFilePaths.length ? bibFilePaths : ["references.bib"],
      warning: null,
    };
  }
  if (usesBibtex) {
    return {
      mode: "bibtex",
      supportedCommands: ["\\cite"],
      bibFiles: bibFilePaths.length ? bibFilePaths : ["references.bib"],
      warning: null,
    };
  }
  if (usesManualThebibliography) {
    return {
      mode: "manual",
      supportedCommands: ["\\cite"],
      bibFiles: bibFilePaths,
      warning:
        "Bản thảo đang sử dụng môi trường \\begin{thebibliography} thủ công. LumiGap vẫn lưu mục BibTeX vào references.bib mà không ghi đè preamble của bạn; để tự động biên dịch từ references.bib, hãy thay bằng \\bibliographystyle{plain} và \\bibliography{references}.",
    };
  }
  return {
    mode: "unconfigured",
    supportedCommands: ["\\cite"],
    bibFiles: bibFilePaths.length ? bibFilePaths : ["references.bib"],
    warning:
      "Tệp LaTeX chưa khai báo \\bibliography{references} hoặc \\printbibliography. LumiGap vẫn chèn lệnh \\cite{...} và cập nhật references.bib an toàn mà không tự ý sửa cấu trúc preamble của bạn.",
  };
}

export function extractCitedKeysFromTex(texSources: string[]): Set<string> {
  const keys = new Set<string>();
  for (const text of texSources) {
    for (const match of text.matchAll(/\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g)) {
      for (const raw of match[1]!.split(",")) {
        const key = raw.trim();
        if (key && key !== "*") keys.add(key);
      }
    }
  }
  return keys;
}

export function extractKeysFromBib(bibContent?: string): Set<string> {
  const keys = new Set<string>();
  if (!bibContent) return keys;
  for (const match of bibContent.matchAll(/@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,/g)) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return keys;
}

function screeningLabel(status?: string) {
  if (status === "INCLUDED") return "Đã chọn";
  if (status === "EXCLUDED") return "Đã loại";
  if (status === "BACKGROUND") return "Tài liệu nền";
  if (status === "NEEDS_RESOLUTION" || status === "CONSENSUS_REQUIRED" || status === "CONSENSUS_IN_PROGRESS" || status === "ADJUDICATING") return "Cần thống nhất";
  return "Chưa quyết định";
}

function evidenceLabel(ref: ManuscriptReference) {
  const status = ref.evidenceStatus ?? "NOT_STARTED";
  const count = ref.extractionCount ?? 0;
  const verified = ref.verifiedCount ?? 0;
  if (status === "COMPLETED") return `Bằng chứng: Đã đối chiếu (${verified}/${count})`;
  if (status === "AI_SUGGESTED") return `Bằng chứng: AI gợi ý · Cần kiểm chứng (${count})`;
  if (status === "IN_PROGRESS") return `Bằng chứng: Đang phân tích (${count})`;
  return "Bằng chứng: Chưa phân tích";
}

export function ManuscriptCitationPicker({
  open,
  onOpenChange,
  projectId,
  references,
  isLoading,
  citedKeys,
  bibKeys,
  compiledSuccess,
  bibSetup,
  canInsert,
  busy,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  references: ManuscriptReference[];
  isLoading: boolean;
  citedKeys: Set<string>;
  bibKeys: Set<string>;
  compiledSuccess: boolean;
  bibSetup: BibliographySetupInfo;
  canInsert: boolean;
  busy: boolean;
  onInsert: (paperId: string, command: string) => Promise<boolean | void>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ALL" | "SELECTED" | "CITED">("ALL");
  const [command, setCommand] = useState<string>("\\cite");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return references.filter(ref => {
      const inBib = Boolean(ref.inBib || bibKeys.has(ref.citationKey));
      const inTex = citedKeys.has(ref.citationKey);
      if (tab === "SELECTED" && ref.screeningStatus !== "INCLUDED") return false;
      if (tab === "CITED" && !inBib && !inTex) return false;
      if (!needle) return true;
      const haystack = `${ref.title} ${ref.authors.join(" ")} ${ref.doi ?? ""} ${ref.year ?? ""} ${ref.journalName ?? ""} ${ref.citationKey}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [references, query, tab, bibKeys, citedKeys]);

  const selectedCount = references.filter(r => r.screeningStatus === "INCLUDED").length;
  const citedCount = references.filter(r => r.inBib || bibKeys.has(r.citationKey) || citedKeys.has(r.citationKey)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Đóng" className="writing-citation-picker-dialog" data-no-i18n>
        <div className="writing-citation-picker-header">
          <DialogTitle>Trích dẫn tài liệu</DialogTitle>
          <DialogDescription>
            Chọn tài liệu từ Thư viện đề tài để chèn lệnh trích dẫn LaTeX tại vị trí con trỏ và tự động đồng bộ mục BibTeX vào <code>{bibSetup.bibFiles[0] ?? "references.bib"}</code>.
          </DialogDescription>
        </div>

        <div className="writing-citation-picker-controls">
          <div className="writing-citation-search-wrap">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <Input
              aria-label="Tìm tên bài báo, tác giả hoặc DOI..."
              placeholder="Tìm tên bài báo, tác giả hoặc DOI..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="writing-citation-filter-bar">
            <div className="writing-citation-tabs" role="tablist" aria-label="Bộ lọc tài liệu trích dẫn">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "ALL"}
                className={`writing-citation-tab ${tab === "ALL" ? "is-active" : ""}`}
                onClick={() => setTab("ALL")}
              >
                <span>Tất cả tài liệu</span>
                <small>{references.length}</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "SELECTED"}
                className={`writing-citation-tab ${tab === "SELECTED" ? "is-active" : ""}`}
                onClick={() => setTab("SELECTED")}
              >
                <span>Bài đã chọn</span>
                <small>{selectedCount}</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "CITED"}
                className={`writing-citation-tab ${tab === "CITED" ? "is-active" : ""}`}
                onClick={() => setTab("CITED")}
              >
                <span>Đã trích dẫn trong bản thảo này</span>
                <small>{citedCount}</small>
              </button>
            </div>

            {bibSetup.supportedCommands.length > 1 && (
              <label className="writing-citation-cmd-select">
                <span>Lệnh LaTeX:</span>
                <select aria-label="Lệnh trích dẫn LaTeX" value={command} onChange={e => setCommand(e.target.value)}>
                  {bibSetup.supportedCommands.map(cmd => (
                    <option key={cmd} value={cmd}>{cmd}&#123;key&#125;</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {bibSetup.warning && (
          <div role="status" className="writing-citation-setup-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p>{bibSetup.warning}</p>
          </div>
        )}

        <div className="writing-citation-picker-list" role="region" aria-label="Danh sách tài liệu">
          {isLoading ? (
            <p className="writing-small">{t("Loading references…")}</p>
          ) : !filtered.length ? (
            <div className="writing-citation-empty">
              <BookOpen className="h-6 w-6 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
              <p>
                {references.length === 0
                  ? "Thư viện đề tài chưa có bài báo nào. Hãy thêm tài liệu trong Thư viện trước khi trích dẫn."
                  : "Không tìm thấy bài báo khớp với bộ lọc hiện tại."}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library`}>
                  Mở Thư viện đề tài
                </Link>
              </Button>
            </div>
          ) : (
            filtered.map(ref => {
              const inBib = Boolean(ref.inBib || bibKeys.has(ref.citationKey));
              const inTex = citedKeys.has(ref.citationKey);
              const isResolved = compiledSuccess && inBib && inTex;
              return (
                <article key={ref.id} className="writing-citation-card" data-paper-id={ref.id}>
                  <div className="writing-citation-card-main">
                    <div className="writing-citation-card-top">
                      <code className="writing-citation-key">{command}&#123;{ref.citationKey}&#125;</code>
                      <span className={`writing-citation-badge is-screening-${(ref.screeningStatus ?? "NOT_REVIEWED").toLowerCase()}`}>
                        {screeningLabel(ref.screeningStatus)}
                      </span>
                      <span className={`writing-citation-badge is-evidence-${(ref.evidenceStatus ?? "NOT_STARTED").toLowerCase()}`}>
                        {evidenceLabel(ref)}
                      </span>
                      {inBib && (
                        <span className="writing-citation-badge is-in-bib">
                          <FileCode2 className="h-3 w-3" aria-hidden="true" />
                          Có trong .bib
                        </span>
                      )}
                      {inTex && (
                        <span className="writing-citation-badge is-in-tex">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Đã trích dẫn trong .tex
                        </span>
                      )}
                      {isResolved && (
                        <span className="writing-citation-badge is-compiled">
                          Đã biên dịch thành công
                        </span>
                      )}
                    </div>

                    <h4>{ref.title}</h4>
                    <p className="writing-citation-meta">
                      {ref.authors.length ? ref.authors.join(", ") : "Chưa rõ tác giả"}
                      {ref.year ? ` (${ref.year})` : " (Chưa rõ năm)"}
                      {ref.journalName ? ` · ${ref.journalName}` : ""}
                      {ref.doi ? ` · DOI: ${ref.doi}` : ""}
                    </p>

                    {Boolean(ref.metadataWarnings?.length) && (
                      <p className="writing-citation-warning" role="status">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          Cảnh báo metadata: {ref.metadataWarnings!.join(", ")}. BibTeX sẽ chỉ ghi các trường hiện có, không tự suy diễn dữ liệu thiếu.
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="writing-citation-card-actions">
                    <Button
                      size="sm"
                      disabled={!canInsert || busy}
                      onClick={async () => {
                        const ok = await onInsert(ref.id, command);
                        if (ok !== false) onOpenChange(false);
                      }}
                    >
                      <BookMarked className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      Chèn trích dẫn
                    </Button>
                    <div className="writing-citation-links">
                      <Link
                        to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library&source=${encodeURIComponent(ref.id)}`}
                        className="writing-citation-link"
                        onClick={() => onOpenChange(false)}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        <span>Bài báo</span>
                      </Link>
                      <Link
                        to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=evidence&extract=${encodeURIComponent(ref.id)}`}
                        className="writing-citation-link"
                        onClick={() => onOpenChange(false)}
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        <span>Bằng chứng</span>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
