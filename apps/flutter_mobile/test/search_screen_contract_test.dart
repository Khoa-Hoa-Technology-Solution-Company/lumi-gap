import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SearchScreen uses backend-compatible search filter values', () {
    final source = File(
      'lib/features/search/presentation/search_screen.dart',
    ).readAsStringSync();

    expect(source, contains("value: 'citations'"));
    expect(source, contains("value: 'year'"));
    expect(source, contains("value: 'article'"));
    expect(source, contains("value: 'proceedings'"));
    expect(source, isNot(contains("value: 'citationCount'")));
    expect(source, isNot(contains("value: 'publicationYear'")));
    expect(source, isNot(contains("value: 'journal'")));
    expect(source, isNot(contains("value: 'conference'")));
  });

  test('Trends scoped search opens Search with a non-empty query', () {
    final source = File(
      'lib/features/trends/components/trends_scope_tab.dart',
    ).readAsStringSync();

    expect(source, contains('_scopeSearchQuery()'));
    expect(source, contains("'q': q.trim()"));
    expect(source, contains("labels.isEmpty ? 'research' : labels.first"));
  });
}
