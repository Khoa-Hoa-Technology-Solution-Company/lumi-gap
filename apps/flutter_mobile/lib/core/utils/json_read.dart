/// Tolerant readers for API JSON: a missing or wrongly typed field becomes
/// null (or empty) instead of throwing, so one odd row never breaks a list.
library;

typedef Json = Map<String, dynamic>;

/// Non-empty trimmed text, or null.
String? jStr(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

int jInt(Object? value, [int fallback = 0]) => switch (value) {
      final int v => v,
      final num v => v.toInt(),
      final String v => int.tryParse(v) ?? fallback,
      _ => fallback,
    };

bool jBool(Object? value) => value == true;

Json jMap(Object? value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};

List<Json> jMaps(Object? value) =>
    value is List ? [for (final item in value) if (item is Map) jMap(item)] : const [];

List<String> jStrings(Object? value) =>
    value is List ? [for (final item in value) ?jStr(item)] : const [];

DateTime? jDate(Object? value) {
  final text = jStr(value);
  return text == null ? null : DateTime.tryParse(text);
}

/// `id`, or the legacy `_id`.
String jId(Json json) => jStr(json['id']) ?? jStr(json['_id']) ?? '';
