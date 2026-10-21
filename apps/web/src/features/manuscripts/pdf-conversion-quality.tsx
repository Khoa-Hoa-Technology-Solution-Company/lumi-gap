import type { ManuscriptPdfImport } from "@trend/shared-types";
import { useI18n } from "@/i18n";

/** Quality measurements remain separate from successful LaTeX compilation. */
export function PdfConversionQuality({ result }: { result: ManuscriptPdfImport }) {
  const { t } = useI18n();
  const comparison = result.comparison;
  const warnings = new Set(comparison?.warnings ?? []);
  const messages = [
    warnings.has("PAGE_COUNT_CHANGED") ? "The page count changed. Check page breaks and overflowing tables." : null,
    warnings.has("NUMERIC_CONTENT_REVIEW") ? "Some numbers could not be matched. Verify amounts, quantities and order codes before accepting." : null,
    warnings.has("TEXT_CONTENT_REVIEW") ? "Some source text could not be matched. Compare the content before accepting." : null,
    warnings.has("LAYOUT_DIFFERENCE") ? "The layout differs from the original. Check the side-by-side preview." : null,
    result.layout?.unmappedBlocks ? "Some blocks could not be reconstructed. Check the original PDF." : null,
  ].filter((message): message is string => Boolean(message));
  return <section aria-label={t("Conversion quality")} className="writing-pdf-quality">
    <div className="writing-small">
      {result.layout ? <span>{result.layout.tableCount} {t("editable tables detected")} · </span> : null}
      {comparison?.status === "compared" ? <span>{comparison.sourcePages} → {comparison.generatedPages} {t("pages")}</span> : null}
    </div>
    {messages.length ? <ul className="writing-notice" role="status">{messages.map(message => <li key={message}>{t(message)}</li>)}</ul> : null}
    {comparison?.status === "unavailable" ? <p className="writing-small">{t("Automatic comparison is unavailable. Check both previews before accepting.")}</p> : null}
    {comparison?.status === "compared" ? <details className="writing-pdf-import-advanced"><summary>{t("Automatic comparison")}</summary>
      <p className="writing-small">{t("Sampled pages")}: {comparison.comparedPages} · {t("Text matched")}: {comparison.textCoverage === undefined ? t("Not measurable") : `${Math.round(comparison.textCoverage * 100)}%`} · {t("Numbers matched")}: {comparison.numericCoverage === undefined ? t("Not measurable") : `${Math.round(comparison.numericCoverage * 100)}%`}</p>
      <p className="writing-small">{t("Comparison samples up to five pages. Matching text and visual similarity do not establish content accuracy, especially for scans and formulas.")}</p>
    </details> : null}
  </section>;
}
