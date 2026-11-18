/** Reject obvious placeholders, not short research ideas or particular languages. */
export function hasMeaningfulResearchText(value: string): boolean {
  const text = value.normalize("NFC").trim();
  if (!text || /^https?:\/\/\S+$/u.test(text)) return false;
  // Built-in instructions are not research content. Never rewrite historical submissions.
  const instructions = [
    "Giới thiệu vấn đề, mục tiêu và hướng nghiên cứu. Không cần một abstract hoàn chỉnh.",
    "Nhóm đang nghiên cứu vấn đề gì, mục tiêu là gì và dự kiến tiếp cận như thế nào?",
    "Introduce the research question, goal and direction. A polished abstract is not required.",
    "What is the problem, your goal and your proposed approach?",
  ];
  const normalized = text.toLocaleLowerCase().replace(/\s+/gu, " ");
  if (instructions.some(instruction => instruction.normalize("NFC").toLocaleLowerCase() === normalized)) return false;
  if (/^(?:test(?:ing)?|abc(?:def)?|asdf|qwerty|placeholder|n\/?a|none|tbd|xxx+|123+)(?:[\s.!?\d_-]*)$/i.test(text)) return false;
  const letters = text.toLocaleLowerCase().match(/\p{L}/gu) ?? [];
  if (new Set(letters).size < 3) return false;
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length >= 3 && new Set(words).size === 1) return false;
  return words.length >= 2 || /\p{Script=Han}{4}/u.test(text);
}

export const mentorRoleLabelKeys = { UNASSIGNED: "Mentor", PRIMARY: "Primary mentor", SECONDARY: "Secondary mentor" } as const;
