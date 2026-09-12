/** Format a citation count: 1234 → "1.2K", 1_500_000 → "1.5M". */
export function formatCitations(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Format a number with thousands separators. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return integerFormatter.format(n);
}

/** Format a number in compact notation for charts and dense cards. */
export function formatCompactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return compactNumberFormatter.format(n);
}

/** Extract year from an ISO date string. */
export function getYear(date: string | Date): number {
  return new Date(date).getFullYear();
}

const TIER_NAME_MAP: Record<number, string> = {
  0: "Invalid",
  1: "Basic",
  2: "Academic Standard",
  3: "High Value",
  4: "Elite",
};

/** Format quality tier name to English standard. */
export function formatQualityTierName(tier?: number, tierName?: string): string {
  if (tier !== undefined && TIER_NAME_MAP[tier]) {
    return TIER_NAME_MAP[tier];
  }
  if (!tierName) return "Invalid";
  const lower = tierName.toLowerCase();
  if (lower.includes("không hợp lệ") || lower.includes("invalid")) return "Invalid";
  if (lower.includes("cơ bản") || lower.includes("basic")) return "Basic";
  if (lower.includes("chuẩn học thuật") || lower.includes("academic standard")) return "Academic Standard";
  if (lower.includes("giá trị cao") || lower.includes("high value")) return "High Value";
  if (lower.includes("tinh hoa") || lower.includes("elite")) return "Elite";
  return tierName;
}
