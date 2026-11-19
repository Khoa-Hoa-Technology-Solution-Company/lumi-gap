import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Search filters use backend-compatible values', () {
    // Sort keys: SEARCH_SORT_KEYS in paper-filters.schema.ts.
    final sheet = File(
      'lib/features/search/presentation/search_filter_sheet.dart',
    ).readAsStringSync();
    expect(sheet, contains("('citations'"));
    expect(sheet, contains("('year'"));
    expect(sheet, contains("('relevance'"));
    expect(sheet, isNot(contains("'citationCount'")));
    expect(sheet, isNot(contains("'publicationYear'")));

    final kinds = File(
      'lib/features/search/domain/search_filters.dart',
    ).readAsStringSync();
    expect(kinds, contains("('article'"));
    expect(kinds, contains("('proceedings'"));
    expect(kinds, isNot(contains("('journal'")));
    expect(kinds, isNot(contains("('conference'")));
  });

  test('Trends scoped search opens Search with a non-empty query', () {
    final source = File(
      'lib/features/trends/components/trends_scope_tab.dart',
    ).readAsStringSync();

    // The query is the narrowest chosen facet's name, else "research".
    expect(source, contains('_query(q: _scopeTopic())'));
    expect(source, contains("'q': q.trim()"));
    expect(source, contains("'research';"));
  });
}
