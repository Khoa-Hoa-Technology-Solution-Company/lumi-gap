import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import {
  englishDictionary,
  loadDictionary,
  type Dictionary,
} from "./locales";

export const UI_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
] as const;

export type UiLanguageCode = (typeof UI_LANGUAGES)[number]["code"];

type Translate = (key: string, values?: Record<string, string | number>) => string;

interface I18nContextValue {
  language: UiLanguageCode;
  setLanguage: (language: UiLanguageCode) => void;
  languages: typeof UI_LANGUAGES;
  t: Translate;
}

const STORAGE_KEY = "liemresearch.uiLanguage";
const I18nContext = createContext<I18nContextValue | undefined>(undefined);
const ATTRIBUTES = ["placeholder", "aria-label", "title"] as const;
const SKIP_SELECTOR = "script,style,noscript,canvas,code,pre,textarea,[contenteditable='true'],[data-no-i18n]";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguageCode>(() => readStoredLanguage());
  const [activeDictionary, setActiveDictionary] = useState<Dictionary>(englishDictionary);
  const textOriginals = useRef(new WeakMap<Text, string>());
  const attrOriginals = useRef(new WeakMap<Element, Map<string, string>>());
  const scanTimer = useRef<number | undefined>();

  useEffect(() => {
    document.documentElement.lang = language;
    let cancelled = false;
    setActiveDictionary(englishDictionary);
    void loadDictionary(language).then((dictionary) => {
      if (!cancelled) setActiveDictionary(dictionary);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const setLanguage = useCallback((nextLanguage: UiLanguageCode) => {
    if (nextLanguage === language) return;

    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    window.location.reload();
  }, [language]);

  const t = useCallback<Translate>(
    (key, values) => {
      return interpolate(activeDictionary[key] ?? englishDictionary[key] ?? key, values);
    },
    [activeDictionary],
  );

  const value = useMemo(() => ({ language, setLanguage, languages: UI_LANGUAGES, t }), [language, setLanguage, t]);

  const translateDom = useCallback(() => {
    if (!document.body) return;
    translateRenderedDom(document.body, activeDictionary, textOriginals.current, attrOriginals.current);
  }, [activeDictionary]);

  useEffect(() => {
    translateDom();

    const observer = new MutationObserver(() => {
      window.clearTimeout(scanTimer.current);
      scanTimer.current = window.setTimeout(translateDom, 60);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      window.clearTimeout(scanTimer.current);
    };
  }, [translateDom]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

export function LanguageMenuItems() {
  const { language, languages, setLanguage, t } = useI18n();
  const selectedLanguage = languages.find((item) => item.code === language) ?? languages[0];

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="cursor-pointer">
          <Languages className="mr-2 h-4 w-4" />
          <span>{t("Language")}</span>
          <span className="ml-auto mr-1 text-[10px] font-bold uppercase text-slate-400">{selectedLanguage.code}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56 max-h-80 overflow-y-auto">
          <DropdownMenuLabel className="text-xs text-slate-500">{t("Interface language")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {languages.map((item) => (
            <DropdownMenuItem key={item.code} onSelect={() => setLanguage(item.code)} className="cursor-pointer">
              <Check className={cn("h-4 w-4", item.code === language ? "opacity-100" : "opacity-0")} />
              <FlagIcon code={item.code} />
              <span className="flex-1">{item.nativeLabel}</span>
              <span className="text-[10px] font-bold uppercase text-slate-400">{item.code}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

export function LanguageSwitcher() {
  const { language, languages, setLanguage } = useI18n();
  const selectedLanguage = languages.find((item) => item.code === language) ?? languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-no-i18n
          className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-[#111B27] dark:text-slate-300 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/20"
          aria-label="Change language"
        >
          <FlagIcon code={selectedLanguage.code} />
          <span>{selectedLanguage.code}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-no-i18n
        className="w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-zinc-950"
      >
        {languages.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onSelect={() => setLanguage(item.code)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold",
              item.code === language
                ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-zinc-900",
            )}
          >
            <FlagIcon code={item.code} />
            <span className="flex-1">{item.nativeLabel}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FlagIcon({ code }: { code: UiLanguageCode }) {
  const clipId = `flag-clip-${code}`;
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {renderFlagSvg(code)}
      </g>
    </svg>
  );
}

function renderFlagSvg(code: UiLanguageCode) {
  switch (code) {
    case "vi":
      return (
        <>
          <rect width="24" height="24" fill="#da251d" />
          <polygon points="12,5 13.65,10.05 18.96,10.05 14.66,13.17 16.31,18.22 12,15.1 7.69,18.22 9.34,13.17 5.04,10.05 10.35,10.05" fill="#ffde00" />
        </>
      );
    case "en":
      return (
        <>
          <rect width="24" height="24" fill="#012169" />
          <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
          <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="2.5" />
          <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="8" />
          <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="4.5" />
        </>
      );
    case "es":
      return (
        <>
          <rect width="24" height="24" fill="#aa151b" />
          <rect y="6" width="24" height="12" fill="#f1bf00" />
        </>
      );
    case "fr":
      return (
        <>
          <rect width="8" height="24" fill="#0055a4" />
          <rect x="8" width="8" height="24" fill="#fff" />
          <rect x="16" width="8" height="24" fill="#ef4135" />
        </>
      );
    case "de":
      return (
        <>
          <rect width="24" height="8" fill="#000" />
          <rect y="8" width="24" height="8" fill="#dd0000" />
          <rect y="16" width="24" height="8" fill="#ffce00" />
        </>
      );
    case "pt":
      return (
        <>
          <rect width="10" height="24" fill="#006600" />
          <rect x="10" width="14" height="24" fill="#ff0000" />
          <circle cx="10" cy="12" r="3.2" fill="#ffcc00" />
        </>
      );
    case "zh":
      return (
        <>
          <rect width="24" height="24" fill="#de2910" />
          <polygon points="6,4 6.9,6.75 9.8,6.75 7.45,8.45 8.35,11.2 6,9.5 3.65,11.2 4.55,8.45 2.2,6.75 5.1,6.75" fill="#ffde00" />
          <circle cx="13.5" cy="5.5" r="1" fill="#ffde00" />
          <circle cx="16" cy="8" r="1" fill="#ffde00" />
          <circle cx="16" cy="12" r="1" fill="#ffde00" />
          <circle cx="13.5" cy="14.5" r="1" fill="#ffde00" />
        </>
      );
    case "ja":
      return (
        <>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="12" cy="12" r="5.2" fill="#bc002d" />
        </>
      );
    case "ko":
      return (
        <>
          <rect width="24" height="24" fill="#fff" />
          <path d="M12 7a5 5 0 0 1 0 10 2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 0 0-5Z" fill="#c60c30" />
          <path d="M12 17a5 5 0 0 1 0-10 2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 0 0 5Z" fill="#003478" />
        </>
      );
    case "ru":
      return (
        <>
          <rect width="24" height="8" fill="#fff" />
          <rect y="8" width="24" height="8" fill="#0039a6" />
          <rect y="16" width="24" height="8" fill="#d52b1e" />
        </>
      );
    case "id":
      return (
        <>
          <rect width="24" height="12" fill="#ce1126" />
          <rect y="12" width="24" height="12" fill="#fff" />
        </>
      );
    default:
      return <rect width="24" height="24" fill="#e2e8f0" />;
  }
}

function readStoredLanguage(): UiLanguageCode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return UI_LANGUAGES.some((language) => language.code === stored) ? (stored as UiLanguageCode) : "en";
}

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ""));
}

function translateRenderedDom(
  root: HTMLElement,
  dictionary: Record<string, string>,
  textOriginals: WeakMap<Text, string>,
  attrOriginals: WeakMap<Element, Map<string, string>>,
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return shouldTranslate(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const current = node.nodeValue ?? "";
    const previousSource = textOriginals.get(node);
    const previousTranslation = previousSource
      ? translateWithWhitespace(previousSource, dictionary)
      : undefined;
    if (!previousSource || current !== previousTranslation) {
      textOriginals.set(node, current);
    }
    const source = textOriginals.get(node) ?? current;
    node.nodeValue = translateWithWhitespace(source, dictionary);
  }

  const elements = root.querySelectorAll<HTMLElement>(ATTRIBUTES.map((attr) => `[${attr}]`).join(","));
  for (const element of elements) {
    if (element.closest(SKIP_SELECTOR)) continue;
    let originals = attrOriginals.get(element);
    if (!originals) {
      originals = new Map();
      attrOriginals.set(element, originals);
    }

    for (const attr of ATTRIBUTES) {
      const current = element.getAttribute(attr);
      if (!current || !shouldTranslate(current)) continue;
      const previousSource = originals.get(attr);
      const previousTranslation = previousSource
        ? translateWithWhitespace(previousSource, dictionary)
        : undefined;
      if (!previousSource || current !== previousTranslation) {
        originals.set(attr, current);
      }
      const source = originals.get(attr) ?? current;
      element.setAttribute(attr, translateWithWhitespace(source, dictionary));
    }
  }
}

function shouldTranslate(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 2) return false;
  if (/^[\d\s.,:%()[\]{}+\-*/|#@!$&]+$/.test(normalized)) return false;
  if (/^https?:\/\//i.test(normalized) || normalized.includes("@")) return false;
  return true;
}

function translateWithWhitespace(source: string, dictionary: Record<string, string>) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const trimmed = source.replace(/\s+/g, " ").trim();
  return `${leading}${translateText(trimmed, dictionary)}${trailing}`;
}

function translateText(text: string, dictionary: Record<string, string>) {
  const exact = dictionary[text];
  if (exact) return exact;
  return text;
}
