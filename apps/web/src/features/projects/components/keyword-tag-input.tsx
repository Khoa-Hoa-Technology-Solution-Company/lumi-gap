import { useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

export const DEFAULT_MAX_KEYWORDS = 10;
export const DEFAULT_MAX_KEYWORD_LENGTH = 80;

/** Trims outer whitespace and collapses consecutive internal spaces while preserving multiword phrases. */
export function normalizeKeywordTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Splits pasted or delimited keyword text without merging words across newlines. */
export function splitKeywordTerms(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map(normalizeKeywordTerm)
    .filter(Boolean);
}

export interface KeywordMergeResult {
  next: string[];
  error?: string;
}

export function mergeKeywordTerms(
  current: readonly string[],
  incoming: readonly string[],
  options: { max?: number; maxLength?: number; language?: string } = {},
): KeywordMergeResult {
  const max = options.max ?? DEFAULT_MAX_KEYWORDS;
  const maxLength = options.maxLength ?? DEFAULT_MAX_KEYWORD_LENGTH;
  const isVi = options.language === "vi";
  const next = [...current];
  const seen = new Set(current.map(item => item.toLocaleLowerCase()));
  let duplicateCount = 0;
  let tooLongCount = 0;
  let overflowCount = 0;

  for (const raw of incoming) {
    const cleaned = normalizeKeywordTerm(raw);
    if (!cleaned) continue;
    if (cleaned.length > maxLength) {
      tooLongCount++;
      continue;
    }
    const key = cleaned.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    if (next.length >= max) {
      overflowCount++;
      continue;
    }
    seen.add(key);
    next.push(cleaned);
  }

  let error: string | undefined;
  if (tooLongCount > 0) {
    error = isVi
      ? `Mỗi từ khóa tối đa ${maxLength} ký tự. Từ khóa quá dài chưa được thêm.`
      : `Each keyword must be ${maxLength} characters or fewer. Oversized entries were not added.`;
  } else if (overflowCount > 0) {
    error = isVi
      ? `Tối đa ${max} từ khóa. Hãy xóa bớt từ khóa cũ trước khi thêm mới.`
      : `You can add up to ${max} keywords. Remove an existing keyword before adding more.`;
  } else if (duplicateCount > 0 && next.length === current.length) {
    error = isVi
      ? "Từ khóa này đã tồn tại trong danh sách."
      : "This keyword is already in the list.";
  }

  return { next, error };
}

export function KeywordTagInput({
  id,
  values,
  onChange,
  draftInput,
  onDraftInputChange,
  max = DEFAULT_MAX_KEYWORDS,
  maxLength = DEFAULT_MAX_KEYWORD_LENGTH,
  disabled = false,
  required = false,
  label,
  placeholder,
  error,
  errorId,
  className = "",
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  draftInput?: string;
  onDraftInputChange?: (value: string) => void;
  max?: number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;
  error?: string;
  errorId?: string;
  className?: string;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const countId = `${inputId}-count`;
  const [internalDraft, setInternalDraft] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  const text = draftInput !== undefined ? draftInput : internalDraft;
  const setText = (next: string) => {
    if (onDraftInputChange) onDraftInputChange(next);
    else setInternalDraft(next);
  };

  const displayedError = error || localError;
  const full = values.length >= max;

  const commitTerms = (terms: string[], clearTextOnSuccess = true) => {
    if (!terms.length) return;
    const result = mergeKeywordTerms(values, terms, { max, maxLength, language });
    if (result.next.length !== values.length) {
      onChange(result.next);
    }
    setLocalError(result.error);
    if (!result.error && clearTextOnSuccess) {
      setText("");
    } else if (result.next.length > values.length && clearTextOnSuccess) {
      // Keep only rejected oversized/overflow entries? Clearing avoids accidental duplicates on retry.
      setText("");
    }
  };

  const handleInputChange = (raw: string) => {
    setLocalError(undefined);
    if (/[,;\r\n]/.test(raw)) {
      // Split completed segments on delimiter while preserving any trailing incomplete phrase.
      const parts = raw.split(/[\r\n,;]+/);
      const trailing = /[\r\n,;]\s*$/.test(raw) ? "" : (parts.pop() ?? "");
      const ready = parts.map(normalizeKeywordTerm).filter(Boolean);
      if (ready.length > 0) {
        const result = mergeKeywordTerms(values, ready, { max, maxLength, language });
        if (result.next.length !== values.length) onChange(result.next);
        setLocalError(result.error);
      }
      setText(trailing);
      return;
    }
    setText(raw);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData?.getData("text");
    if (!pasted) return;
    if (/[\r\n,;]/.test(pasted)) {
      event.preventDefault();
      const combined = text ? `${text}, ${pasted}` : pasted;
      const terms = splitKeywordTerms(combined);
      commitTerms(terms, true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const terms = splitKeywordTerms(text);
      if (terms.length > 0) commitTerms(terms, true);
      return;
    }
    if (event.key === "Backspace" && !text && values.length > 0) {
      event.preventDefault();
      onChange(values.slice(0, -1));
      setLocalError(undefined);
    }
  };

  const handleBlur = () => {
    const terms = splitKeywordTerms(text);
    if (terms.length > 0) {
      const result = mergeKeywordTerms(values, terms, { max, maxLength, language });
      if (result.next.length !== values.length) onChange(result.next);
      setLocalError(result.error);
      if (!result.error) setText("");
    }
  };

  const removeKeyword = (target: string) => {
    onChange(values.filter(item => item !== target));
    setLocalError(undefined);
  };

  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label} {required ? <span className="text-destructive">*</span> : null}
          </label>
          <span id={countId} className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {values.length}/{max}
          </span>
        </div>
      ) : (
        <div className="flex justify-end">
          <span id={countId} className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {values.length}/{max}
          </span>
        </div>
      )}

      {values.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label={isVi ? "Từ khóa đã chọn" : "Selected keywords"}>
          {values.map(kw => (
            <span
              key={kw}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 pl-2.5 pr-1.5 py-1 text-xs font-medium text-foreground"
            >
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{kw}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${t("Remove")} ${kw}`}
                onClick={() => removeKeyword(kw)}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Input
        id={inputId}
        name="keywords"
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={text}
        aria-invalid={Boolean(displayedError)}
        aria-describedby={[countId, displayedError && errorId ? errorId : undefined].filter(Boolean).join(" ") || undefined}
        onChange={event => handleInputChange(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={
          full
            ? (isVi ? `Đã đạt tối đa ${max} từ khóa` : `Maximum ${max} keywords reached`)
            : (placeholder ?? (isVi ? "Nhập từ khóa rồi nhấn Enter hoặc dấu phẩy (VD: Large Language Models, Literature Review)..." : "Type a keyword and press Enter or comma (e.g. Large Language Models, Literature Review)..."))
        }
        className="h-10 rounded-xl px-3.5 text-sm"
      />

      <p className="text-xs text-muted-foreground">
        {isVi
          ? `Nhấn Enter hoặc dấu phẩy để thêm từng cụm từ. Tối đa ${max} từ khóa, mỗi từ khóa tối đa ${maxLength} ký tự.`
          : `Press Enter or comma to add each phrase. Up to ${max} keywords, max ${maxLength} characters each.`}
      </p>

      {displayedError ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {displayedError}
        </p>
      ) : null}
    </div>
  );
}
