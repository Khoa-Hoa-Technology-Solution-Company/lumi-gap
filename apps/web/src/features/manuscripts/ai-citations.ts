import type { ManuscriptReference } from "@trend/shared-types";

const citations = () => /(\\[A-Za-z]*cite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{)([^}]+)\}/gi;

export async function resolveWritingCitations(text: string, sources: ManuscriptReference[], references: ManuscriptReference[], insert: (id: string) => Promise<{ key: string }>): Promise<string> {
  const keys = [...new Set([...text.matchAll(citations())].flatMap(match => match[2]!.split(",").map(key => key.trim())))];
  const pending = keys.flatMap(key => {
    const expected = sources.find(source => source.citationKey === key);
    const reference = expected ? references.find(ref => ref.id === expected.id && ref.citationKey === key) : references.find(ref => ref.citationKey === key);
    // A model-suggested source must still belong to the project when accepted.
    if (expected && !reference) throw new Error("Project reference changed");
    return reference ? [{ key, id: reference.id }] : [];
  });
  const resolved = new Map<string, string>();
  for (const source of pending) resolved.set(source.key, (await insert(source.id)).key);
  return text.replace(citations(), (_match, command: string, keys: string) => `${command}${keys.split(",").map(key => resolved.get(key.trim()) ?? key.trim()).join(",")}}`);
}
