import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TrendsScreen exposes the compare workflow tab', () {
    final source = File(
      'lib/features/trends/presentation/trends_screen.dart',
    ).readAsStringSync();

    expect(source, contains("Tab(text: 'Compare')"));
    expect(source, contains('TrendsCompareTab('));
  });
}
