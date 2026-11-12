import type { LiteratureMatrix } from "@trend/shared-types";

export const MATRIX_BUILT_IN_LABELS = {
  methodology: "Phương pháp",
  population: "Dữ liệu / đối tượng",
  claim: "Phát hiện chính",
  results: "Kết quả",
  limitations: "Hạn chế",
} as const;

/**
 * One CSV cell. Quotes every value and doubles inner quotes (RFC 4180). A value that a spreadsheet would read as a
 * formula (=, +, -, @, tab, carriage return) is prefixed with an apostrophe, so an exported paper title cannot run code.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The matrix as CSV with a UTF-8 BOM so Excel shows Vietnamese characters correctly. */
export function matrixToCsv(matrix: Pick<LiteratureMatrix, "criteria" | "rows">): string {
  const header = ["Bài báo", "Năm", "DOI", ...Object.values(MATRIX_BUILT_IN_LABELS), ...matrix.criteria.map((column) => column.label), "Chủ đề", "Trạng thái kiểm chứng"];
  const lines = matrix.rows.map((row) => [
    row.paperTitle, row.publicationYear, row.doi,
    row.methodology, row.population, row.claim, row.results, row.limitations,
    ...matrix.criteria.map((column) => row.criteriaValues[column.id] ?? ""),
    row.themes.join("; "), row.verificationStatus,
  ].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
