import 'package:flutter_mobile/core/i18n/i18n.dart';

/// The filters the reader can change in the search filter sheet. Immutable:
/// the sheet edits a copy and hands it back only on "Apply", so closing the
/// sheet another way changes nothing.
class SearchFilters {
  const SearchFilters({
    this.yearFrom,
    this.yearTo,
    this.paperKind,
    this.openAccess,
    this.source,
    this.sort = 'relevance',
    this.rerank = false,
  });

  /// Same bounds as the API (`paper-filters.schema.ts`).
  static const int minYear = 1900;
  static const int maxYear = 2100;
  static const int maxSourceLength = 200;

  final int? yearFrom;
  final int? yearTo;
  final String? paperKind;

  /// True for "open access only"; null for no filter.
  final bool? openAccess;
  final String? source;
  final String sort;
  final bool rerank;

  SearchFilters copyWith({
    int? Function()? yearFrom,
    int? Function()? yearTo,
    String? Function()? paperKind,
    bool? Function()? openAccess,
    String? Function()? source,
    String? sort,
    bool? rerank,
  }) =>
      SearchFilters(
        yearFrom: yearFrom != null ? yearFrom() : this.yearFrom,
        yearTo: yearTo != null ? yearTo() : this.yearTo,
        paperKind: paperKind != null ? paperKind() : this.paperKind,
        openAccess: openAccess != null ? openAccess() : this.openAccess,
        source: source != null ? source() : this.source,
        sort: sort ?? this.sort,
        rerank: rerank ?? this.rerank,
      );
}

/// Reads a year field. Returns the year, or an error key for `context.t`.
/// An empty field is no filter and no error.
({int? year, String? error}) parseYearField(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return (year: null, error: null);
  final year = int.tryParse(text);
  if (year == null) return (year: null, error: tk('Enter a year as a number.'));
  if (year < SearchFilters.minYear || year > SearchFilters.maxYear) {
    return (year: null, error: tk('Enter a year between 1900 and 2100.'));
  }
  return (year: year, error: null);
}

/// Error key when both years are set and the range is backwards.
String? yearRangeError(int? from, int? to) =>
    from != null && to != null && from > to
        ? tk('"From" must not be after "To".')
        : null;

/// The source filter as sent: trimmed, null when blank.
String? normalizeSource(String raw) {
  final text = raw.trim();
  return text.isEmpty ? null : text;
}

/// Paper kinds the API filters on, with their English label keys.
final List<(String, String)> searchPaperKinds = [
  ('article', tk('Journal Article')),
  ('book-chapter', tk('Book Chapter')),
  ('proceedings', tk('Conference Proceeding')),
  ('preprint', tk('Preprint')),
  ('review', tk('Review')),
  ('other', tk('Other')),
];

/// Label key of a paper kind code. A code this app does not know (from an
/// old link) is named generically rather than shown raw.
String paperKindLabel(String code) {
  for (final (value, label) in searchPaperKinds) {
    if (value == code) return label;
  }
  return tk('Paper Kind');
}
