import type { en } from "./en";

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<string, string>;
export type SupportedLocale = "en" | "vi" | "es" | "fr" | "de" | "pt" | "zh" | "ja" | "ko" | "ru" | "id";

// Keep dictionaries out of the initial application graph. The provider waits
// for the selected locale, and English remains available for missing keys.
export const englishDictionary: Dictionary = {};

const dictionaryCache = new Map<SupportedLocale, Dictionary>();
let englishLoad: Promise<Dictionary> | undefined;

function loadEnglish(): Promise<Dictionary> {
  if (!englishLoad) {
    englishLoad = import("./en").then(({ en }) => {
      Object.assign(englishDictionary, en);
      dictionaryCache.set("en", englishDictionary);
      return englishDictionary;
    }).catch((error: unknown) => { englishLoad = undefined; throw error; });
  }
  return englishLoad;
}

export function getCachedDictionary(locale: SupportedLocale): Dictionary | undefined {
  return dictionaryCache.get(locale);
}

const dictionaryLoaders: Record<
  Exclude<SupportedLocale, "en">,
  () => Promise<Dictionary>
> = {
  vi: () => import("./vi").then((module) => module.vi as Dictionary),
  es: () => import("./es").then((module) => module.es as Dictionary),
  fr: () => import("./fr").then((module) => module.fr as Dictionary),
  de: () => import("./de").then((module) => module.de as Dictionary),
  pt: () => import("./pt").then((module) => module.pt as Dictionary),
  zh: () => import("./zh").then((module) => module.zh as Dictionary),
  ja: () => import("./ja").then((module) => module.ja as Dictionary),
  ko: () => import("./ko").then((module) => module.ko as Dictionary),
  ru: () => import("./ru").then((module) => module.ru as Dictionary),
  id: () => import("./id").then((module) => module.id as Dictionary),
};

export async function loadDictionary(locale: SupportedLocale): Promise<Dictionary> {
  const cached = dictionaryCache.get(locale);
  if (cached) return cached;
  if (locale === "en") return loadEnglish();

  const [, dictionary] = await Promise.all([loadEnglish(), dictionaryLoaders[locale]()]);
  dictionaryCache.set(locale, dictionary);
  return dictionary;
}
