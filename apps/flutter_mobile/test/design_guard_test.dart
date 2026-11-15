import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Guards the design rules of docs/DESIGN_LANGUAGE.md §11 over every Dart
/// file in lib/. Colours and type sizes live in lib/core/theme only; screens
/// read them through `context.lumi`, `context.type` and `textTheme`.
///
/// A failure lists file:line so the offending code is easy to find. An
/// exception needs a rule change here with its reason, not a quiet bypass.

/// Where raw values are allowed: the token tables themselves.
const _themeDir = 'lib/core/theme/';

/// Corner radii of the shape scale (§11): 4 small, 6 chip, 8 card / button /
/// input, 12 sheet / dialog, 999 pill / avatar. 2 and 3 are half the height
/// of a 4–6dp progress bar or drag handle, which is what makes it round.
const _allowedRadii = {2, 3, 4, 6, 8, 12, 999};

/// Icons that read as "AI magic" rather than say what a control does.
const _aiLookingIcons = [
  'auto_awesome',
  'smart_toy',
  'bolt',
  'flash_on',
  'magic_button',
  'psychology',
];

class _Hit {
  const _Hit(this.path, this.line, this.text);
  final String path;
  final int line;
  final String text;

  @override
  String toString() => '$path:$line  ${text.trim()}';
}

List<File> _libFiles() => Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'))
    .toList();

String _norm(String path) => path.replaceAll(r'\', '/');

/// Every line outside the theme that matches [pattern]. Comment lines are
/// skipped so a rule can be explained in prose.
List<_Hit> _find(RegExp pattern, {bool Function(Match)? keep}) {
  final hits = <_Hit>[];
  for (final file in _libFiles()) {
    final path = _norm(file.path);
    if (path.startsWith(_themeDir)) continue;
    final lines = file.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (line.trimLeft().startsWith('//')) continue;
      for (final m in pattern.allMatches(line)) {
        if (keep == null || keep(m)) {
          hits.add(_Hit(path, i + 1, line));
          break;
        }
      }
    }
  }
  return hits;
}

void main() {
  test('lib/ is found (the test runs from the package root)', () {
    expect(_libFiles(), isNotEmpty);
  });

  test('no hex colour outside the theme', () {
    expect(_find(RegExp(r'Color\(0x')), isEmpty);
  });

  test('no Color.fromARGB / fromRGBO outside the theme', () {
    expect(_find(RegExp(r'Color\.from(ARGB|RGBO)\(')), isEmpty);
  });

  test('no Material palette colour outside the theme', () {
    // Colors.transparent is not a colour choice, so it stays allowed.
    expect(
      _find(
        RegExp(r'\bColors\.(\w+)'),
        keep: (m) => m.group(1) != 'transparent',
      ),
      isEmpty,
    );
  });

  test('no font size outside the theme: use textTheme / context.type', () {
    expect(_find(RegExp(r'fontSize\s*:')), isEmpty);
  });

  test('no AI-looking icon', () {
    final names = _aiLookingIcons.join('|');
    expect(_find(RegExp('Icons\\.($names)(_outlined|_rounded|_sharp)?\\b')),
        isEmpty);
  });

  test('a spinner only for work in progress, a skeleton for loading data',
      () {
    // Loading a list or a page shows LumiSkeleton / LumiPageSkeleton in the
    // shape of what will appear. AppLoading is for something running whose
    // result has no shape yet; each use is listed here with its reason.
    const allowed = {
      'lib/core/widgets/app_loading.dart', // the widget itself
      'lib/core/router/app_router.dart', // splash while the session restores
      'lib/features/gaps/presentation/gaps_screen.dart', // queueing a job
      'lib/features/trends/components/trends_ai_tab.dart', // LLM running
    };
    final hits = _find(RegExp(r'\bAppLoading\('))
        .where((h) => !allowed.contains(h.path))
        .toList();
    expect(hits, isEmpty);
  });

  test('every TabBar scrolls instead of clipping its labels', () {
    // A fixed TabBar cuts "Signals" to "Signa" at 320dp with large text.
    // Clipped text is not a layout overflow, so the overflow tests miss it.
    final fixed = <String>[];
    for (final file in _libFiles()) {
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (!RegExp(r'\bTabBar\(').hasMatch(lines[i])) continue;
        final call = lines.skip(i).take(8).join('\n');
        if (!call.contains('isScrollable: true')) {
          fixed.add('${_norm(file.path)}:${i + 1}');
        }
      }
    }
    expect(fixed, isEmpty);
  });

  test('corner radii stay on the shape scale', () {
    expect(
      _find(
        RegExp(r'Radius\.circular\(\s*([0-9.]+)\s*\)'),
        keep: (m) {
          final value = double.parse(m.group(1)!);
          return value != value.roundToDouble() ||
              !_allowedRadii.contains(value.toInt());
        },
      ),
      isEmpty,
    );
  });
}
