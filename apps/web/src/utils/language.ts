const FALLBACK_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  zh: "Chinese",
  de: "German",
  id: "Indonesian",
  ru: "Russian",
  ko: "Korean",
  ja: "Japanese",
  tr: "Turkish",
  uk: "Ukrainian",
  it: "Italian",
  cs: "Czech",
  pl: "Polish",
  und: "Unknown language",
};

export function formatLanguageName(code: string): string {
  const normalized = code.trim().toLowerCase() || "und";
  if (normalized === "und") return FALLBACK_LANGUAGE_NAMES.und ?? "Unknown language";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(normalized)
      ?? FALLBACK_LANGUAGE_NAMES[normalized]
      ?? normalized.toUpperCase();
  } catch {
    return FALLBACK_LANGUAGE_NAMES[normalized] ?? normalized.toUpperCase();
  }
}
