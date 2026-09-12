import { en } from "./en";

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<string, string>;
export type SupportedLocale = "en" | "vi" | "es" | "fr" | "de" | "pt" | "zh" | "ja" | "ko" | "ru" | "id";

export const englishDictionary = en as Dictionary;

const dictionaryCache = new Map<SupportedLocale, Dictionary>([["en", englishDictionary]]);

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
  if (locale === "en") return englishDictionary;

  const dictionary = await dictionaryLoaders[locale]();
  dictionaryCache.set(locale, dictionary);
  return dictionary;
}
