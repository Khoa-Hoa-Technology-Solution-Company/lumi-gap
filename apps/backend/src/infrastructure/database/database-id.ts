const LEGACY_HEX_ID_PATTERN = /^[0-9a-f]{24}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DatabaseId =
  | { kind: "legacyMongoId"; value: string }
  | { kind: "uuid"; value: string };

export function parseDatabaseId(value: string): DatabaseId | null {
  const normalized = value.trim();
  if (LEGACY_HEX_ID_PATTERN.test(normalized)) {
    return { kind: "legacyMongoId", value: normalized.toLowerCase() };
  }
  if (UUID_PATTERN.test(normalized)) {
    return { kind: "uuid", value: normalized.toLowerCase() };
  }
  return null;
}

export function requireDatabaseId(value: string): DatabaseId {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw new Error("ID must be a UUID or a migrated 24-character legacy ID");
  return parsed;
}

export function publicDatabaseId(record: { id: string; legacyMongoId?: string | null }): string {
  return record.legacyMongoId ?? record.id;
}
