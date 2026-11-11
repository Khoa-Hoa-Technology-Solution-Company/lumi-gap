import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/i18n/locale_provider.dart';
import 'package:flutter_mobile/core/i18n/translations_vi.dart';
import 'package:flutter_mobile/core/storage/locale_store.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/features/profile/presentation/language_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

// ---------------------------------------------------------------------------
// Reading the keys out of lib/
// ---------------------------------------------------------------------------

const _bs = r'\';

/// Index just after the Dart string literal that starts at [i].
int _endOfString(String s, int i) {
  final quote = s[i];
  if (s.startsWith("'''", i) || s.startsWith('"""', i)) {
    return s.indexOf(s.substring(i, i + 3), i + 3) + 3;
  }
  final raw = i > 0 && s[i - 1] == 'r';
  var j = i + 1;
  while (s[j] != quote) {
    if (s[j] == _bs && !raw) j++;
    j++;
  }
  return j + 1;
}

String _unescape(String literal) {
  final body = literal.substring(1, literal.length - 1);
  final out = StringBuffer();
  for (var i = 0; i < body.length; i++) {
    if (body[i] == _bs && i + 1 < body.length) {
      i++;
      out.write(body[i] == 'n' ? '\n' : body[i]);
    } else {
      out.write(body[i]);
    }
  }
  return out.toString();
}

/// String literals in the first argument of the call whose `(` is at
/// [open] - 1 (e.g. both branches of `context.t(a ? 'x' : 'y')`).
List<String> _firstArgumentLiterals(String s, int open) {
  final found = <String>[];
  var depth = 0;
  var i = open;
  while (i < s.length) {
    final c = s[i];
    if (c == "'" || c == '"') {
      final end = _endOfString(s, i);
      found.add(s.substring(i, end));
      i = end;
      continue;
    }
    if (s.startsWith('//', i)) {
      i = s.indexOf('\n', i);
      continue;
    }
    if ('([{'.contains(c)) {
      depth++;
    } else if (')]}'.contains(c)) {
      if (depth == 0) break;
      depth--;
    } else if (c == ',' && depth == 0) {
      break;
    }
    i++;
  }
  return found;
}

final _call = RegExp(
  r'(?<![A-Za-z0-9_])(?:context\.t|\.t|tk|trNow|translate|t)\(',
);
final _pluralForm = RegExp(r'\b(?:one|other):\s*');

class _Source {
  _Source(this.path, this.text);
  final String path;
  final String text;
}

List<_Source> _libSources() {
  return [
    for (final f in Directory('lib').listSync(recursive: true))
      if (f is File &&
          f.path.endsWith('.dart') &&
          !f.path.replaceAll(r'\', '/').contains('lib/core/i18n/'))
        _Source(f.path.replaceAll(r'\', '/'), f.readAsStringSync()),
  ];
}

/// Every key passed to `context.t`, `tk`, `trNow`, `translate` or given as
/// `one:` / `other:`, with the files that use it.
Map<String, Set<String>> _usedKeys() {
  final keys = <String, Set<String>>{};
  void add(String literal, String path) {
    keys.putIfAbsent(_unescape(literal), () => {}).add(path);
  }

  for (final src in _libSources()) {
    for (final m in _call.allMatches(src.text)) {
      for (final literal in _firstArgumentLiterals(src.text, m.end)) {
        add(literal, src.path);
      }
    }
    for (final m in _pluralForm.allMatches(src.text)) {
      final i = m.end;
      if (i < src.text.length && (src.text[i] == "'" || src.text[i] == '"')) {
        add(src.text.substring(i, _endOfString(src.text, i)), src.path);
      }
    }
  }
  return keys;
}

final _placeholder = RegExp(r'\{\{\s*(\w+)\s*\}\}');

Set<String> _placeholders(String s) => {
  for (final m in _placeholder.allMatches(s)) m.group(1)!,
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

class _MemoryStore extends LocaleStore {
  _MemoryStore([this.saved]);
  AppLocale? saved;
  int writes = 0;

  @override
  Future<AppLocale?> read() async => saved;

  @override
  Future<void> write(AppLocale? locale) async {
    writes++;
    saved = locale;
  }
}

class _FixedDevice extends DeviceLocalesNotifier {
  _FixedDevice(this.locales);
  final List<Locale> locales;

  @override
  List<Locale> build() => locales;
}

class _BrokenStore extends LocaleStore {
  @override
  Future<AppLocale?> read() async => null; // LocaleStore already swallows

  @override
  Future<void> write(AppLocale? locale) async {}
}

ProviderContainer _container({
  LocaleStore? store,
  List<Locale> device = const [Locale('en')],
}) {
  final c = ProviderContainer(
    overrides: [
      localeStoreProvider.overrideWithValue(store ?? _MemoryStore()),
      deviceLocalesProvider.overrideWith(() => _FixedDevice(device)),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

/// Keeps the (auto-disposed or lazily read) choice provider alive in a test.
void _keepAlive(ProviderContainer c) =>
    c.listen(localeChoiceProvider, (_, _) {});

/// Mirrors `App`: the language shown follows [appLocaleProvider].
class _Host extends ConsumerWidget {
  const _Host({required this.home});
  final Widget home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      locale: ref.watch(appLocaleProvider).locale,
      supportedLocales: AppLocale.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      theme: AppTheme.lightTheme,
      home: home,
    );
  }
}

class _Sample extends StatelessWidget {
  const _Sample();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(context.t('Today')),
          Text(context.t('Hello, {{name}}', {'name': 'An'})),
          Text(
            context.plural(
              1,
              one: '{{count}} paper',
              other: '{{count}} papers',
            ),
          ),
          Text(
            context.plural(
              3,
              one: '{{count}} paper',
              other: '{{count}} papers',
            ),
          ),
          ElevatedButton(
            onPressed: () => showLanguageSheet(context),
            child: Text(context.t('Language')),
          ),
        ],
      ),
    );
  }
}

Future<ProviderContainer> _pumpSample(
  WidgetTester tester, {
  LocaleStore? store,
  List<Locale> device = const [Locale('en')],
  double width = 412,
  double scale = 1,
}) async {
  tester.view
    ..physicalSize = Size(width * 2, 1600)
    ..devicePixelRatio = 2;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
  final container = _container(store: store, device: device);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const _Host(home: _Sample()),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  group('every key used in lib/ is translated', () {
    final used = _usedKeys();

    test('the scan finds the keys (guards against a broken scanner)', () {
      expect(used.length, greaterThan(500));
      expect(used.keys, containsAll(['Today', 'Hello, {{name}}', 'Cancel']));
      expect(
        used.keys,
        contains(
          'Messages can be up to {{max}} characters ({{length}}/{{limit}}).',
        ),
      );
      expect(used.keys, contains('{{count}} papers'));
    });

    test('no key is missing a Vietnamese translation', () {
      final missing = [
        for (final e in used.entries)
          if (!viTranslations.containsKey(e.key))
            '"${e.key}" (${e.value.join(', ')})',
      ];
      expect(missing, isEmpty, reason: 'Add these to translations_vi.dart');
    });

    test('no translation is unused (remove stale entries)', () {
      final stale = [
        for (final k in viTranslations.keys)
          if (!used.containsKey(k)) '"$k"',
      ];
      expect(stale, isEmpty);
    });

    test('translations are not empty and keep the same placeholders', () {
      final bad = <String>[];
      viTranslations.forEach((key, value) {
        if (value.trim().isEmpty) bad.add('"$key": empty');
        if (!_samePlaceholders(_placeholders(key), _placeholders(value))) {
          bad.add('"$key": ${_placeholders(key)} vs ${_placeholders(value)}');
        }
      });
      expect(bad, isEmpty);
    });

    test('a key is English text, never a Vietnamese string', () {
      final vietnamese = RegExp(
        '[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]',
        caseSensitive: false,
      );
      expect(used.keys.where(vietnamese.hasMatch), isEmpty);
    });
  });

  group('no text is written straight into the widgets', () {
    // Text('literal'), and the usual text parameters, with a letter in the
    // literal once `$value` interpolations are removed. A line marked
    // `i18n-ignore: <reason>` is allowed (proper names, glyphs).
    // \x27 is the single quote.
    final textArgument = RegExp(
      r'\bText\(\s*(?:const\s+)?\x27((?:[^\x27\\\n]|\\.)*)\x27'
      r'|\b(?:labelText|hintText|helperText|errorText|tooltip|semanticsLabel|'
      'semanticLabel|label|title|subtitle|message|emptyText|content|hint|'
      r'counterText|prefixText|suffixText):\s*(?:const\s+)?'
      r'(?:Text\(\s*(?:const\s+)?)?\x27((?:[^\x27\\\n]|\\.)*)\x27',
    );

    test('Text and text-like parameters use context.t', () {
      final offenders = <String>[];
      for (final src in _libSources()) {
        final lines = src.text.split('\n');
        for (final m in textArgument.allMatches(src.text)) {
          final literal = m.group(1) ?? m.group(2) ?? '';
          // `${... context.t('x') ...}`: the literal ends inside the code.
          if (RegExp(r'\$\{[^}]*$').hasMatch(literal)) continue;
          final withoutInterpolation = literal
              .replaceAll(RegExp(r'\$\{[^}]*\}'), '')
              .replaceAll(RegExp(r'\$\w+'), '');
          if (!RegExp('[A-Za-z]').hasMatch(withoutInterpolation)) continue;
          final line = src.text.substring(0, m.start).split('\n').length;
          if (lines[line - 1].contains('i18n-ignore')) continue;
          offenders.add('${src.path}:$line: "$literal"');
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'Use context.t(...) or mark the line `// i18n-ignore: why`',
      );
    });
  });

  group('translate and placeholders', () {
    test('English shows the key; Vietnamese shows the translation', () {
      expect(translate('Today', AppLocale.en), 'Today');
      expect(translate('Today', AppLocale.vi), 'Hôm nay');
    });

    test('a missing translation falls back to the English key', () {
      const key = 'This sentence has no translation';
      expect(translate(key, AppLocale.vi), key);
    });

    test('{{name}} is filled from the arguments, in both languages', () {
      expect(
        translate('Hello, {{name}}', AppLocale.en, {'name': 'An'}),
        'Hello, An',
      );
      expect(
        translate('Hello, {{name}}', AppLocale.vi, {'name': 'An'}),
        'Chào, An',
      );
    });

    test(
      'the same placeholder can appear twice; numbers and null are text',
      () {
        expect(
          translate('{{a}} and {{a}} and {{b}}', AppLocale.en, {
            'a': 1,
            'b': null,
          }),
          '1 and 1 and null',
        );
      },
    );

    test('a missing argument leaves its placeholder visible', () {
      expect(
        translate('Hello, {{name}}', AppLocale.en, {'other': 1}),
        'Hello, {{name}}',
      );
      expect(translate('Hello, {{name}}', AppLocale.vi), 'Chào, {{name}}');
    });

    test('text with a dollar sign or braces in the argument is kept as is', () {
      expect(
        translate('Hello, {{name}}', AppLocale.en, {'name': r'$1 {{x}}'}),
        r'Hello, $1 {{x}}',
      );
    });

    test('plural: English one/other, Vietnamese has one form', () {
      String p(int n, AppLocale l) => translatePlural(
        n,
        l,
        one: '{{count}} paper',
        other: '{{count}} papers',
      );
      expect(p(0, AppLocale.en), '0 papers');
      expect(p(1, AppLocale.en), '1 paper');
      expect(p(2, AppLocale.en), '2 papers');
      expect(p(0, AppLocale.vi), '0 bài báo');
      expect(p(1, AppLocale.vi), '1 bài báo');
      expect(p(2, AppLocale.vi), '2 bài báo');
    });

    test('plural passes extra arguments along with {{count}}', () {
      expect(
        translatePlural(
          2,
          AppLocale.en,
          one: '{{count}} item in {{where}}',
          other: '{{count}} items in {{where}}',
          args: {'where': 'Home'},
        ),
        '2 items in Home',
      );
    });

    test('tk returns its key unchanged', () {
      expect(tk('Cancel'), 'Cancel');
    });

    test('trNow follows currentAppLocale', () {
      final before = currentAppLocale;
      addTearDown(() => currentAppLocale = before);
      currentAppLocale = AppLocale.en;
      expect(trNow('Today'), 'Today');
      currentAppLocale = AppLocale.vi;
      expect(trNow('Today'), 'Hôm nay');
    });
  });

  group('dates', () {
    // In the app the Material delegates load this; a unit test does it itself.
    setUpAll(() => initializeDateFormatting('en'));

    final now = DateTime(2026, 11, 9, 12);

    test('relative time in both languages, singular and plural', () {
      String r(Duration d, AppLocale l) =>
          relativeTime(now.subtract(d), l, now: now);
      expect(r(const Duration(seconds: 30), AppLocale.en), 'Just now');
      expect(r(const Duration(seconds: 30), AppLocale.vi), 'Vừa xong');
      expect(r(const Duration(minutes: 1), AppLocale.en), '1 minute ago');
      expect(r(const Duration(minutes: 20), AppLocale.en), '20 minutes ago');
      expect(r(const Duration(minutes: 20), AppLocale.vi), '20 phút trước');
      expect(r(const Duration(hours: 1), AppLocale.en), '1 hour ago');
      expect(r(const Duration(hours: 5), AppLocale.vi), '5 giờ trước');
      expect(r(const Duration(days: 1), AppLocale.en), '1 day ago');
      expect(r(const Duration(days: 6), AppLocale.en), '6 days ago');
    });

    test('an older date follows the language', () {
      final old = DateTime(2026, 10, 25, 9);
      expect(relativeTime(old, AppLocale.vi, now: now), '25/10/2026');
      expect(relativeTime(old, AppLocale.en, now: now), 'Oct 25, 2026');
    });
  });

  group('AppLocale', () {
    test('parse accepts the two codes and nothing else', () {
      expect(AppLocale.parse('vi'), AppLocale.vi);
      expect(AppLocale.parse('en'), AppLocale.en);
      expect(AppLocale.parse(null), isNull);
      expect(AppLocale.parse(''), isNull);
      expect(AppLocale.parse('fr'), isNull);
      expect(AppLocale.parse('VI'), isNull);
    });

    test(
      'the device language decides: Vietnamese first, English otherwise',
      () {
        expect(AppLocale.fromDevice(const [Locale('vi', 'VN')]), AppLocale.vi);
        expect(AppLocale.fromDevice(const [Locale('vi')]), AppLocale.vi);
        expect(AppLocale.fromDevice(const [Locale('en', 'US')]), AppLocale.en);
        expect(AppLocale.fromDevice(const [Locale('fr')]), AppLocale.en);
        expect(AppLocale.fromDevice(const []), AppLocale.en);
        // Only the first preference counts.
        expect(
          AppLocale.fromDevice(const [Locale('en'), Locale('vi')]),
          AppLocale.en,
        );
      },
    );
  });

  group('localeProvider', () {
    test('follows the device until the user chooses', () async {
      final vi = _container(device: const [Locale('vi', 'VN')]);
      expect(vi.read(localeChoiceProvider), isNull);
      expect(vi.read(appLocaleProvider), AppLocale.vi);

      final en = _container(device: const [Locale('de')]);
      expect(en.read(appLocaleProvider), AppLocale.en);
    });

    test('a saved choice is loaded and wins over the device', () async {
      final c = _container(
        store: _MemoryStore(AppLocale.en),
        device: const [Locale('vi')],
      );
      expect(
        c.read(appLocaleProvider),
        AppLocale.vi,
        reason: 'before the load',
      );
      _keepAlive(c);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(appLocaleProvider), AppLocale.en);
    });

    test(
      'choosing saves, and "system default" clears the saved choice',
      () async {
        final store = _MemoryStore();
        final c = _container(store: store);
        _keepAlive(c);
        await c.read(localeChoiceProvider.notifier).choose(AppLocale.vi);
        expect(c.read(appLocaleProvider), AppLocale.vi);
        expect(store.saved, AppLocale.vi);

        await c.read(localeChoiceProvider.notifier).choose(null);
        expect(c.read(appLocaleProvider), AppLocale.en, reason: 'device again');
        expect(store.saved, isNull);
        expect(store.writes, 2);
      },
    );

    test(
      'a choice made before the saved one has loaded is not overwritten',
      () async {
        final store = _MemoryStore(AppLocale.en);
        final c = _container(store: store);
        _keepAlive(c);
        await c.read(localeChoiceProvider.notifier).choose(AppLocale.vi);
        await Future<void>.delayed(Duration.zero);
        expect(c.read(localeChoiceProvider), AppLocale.vi);
      },
    );

    test(
      'a store that cannot save still changes the language for this session',
      () async {
        final c = _container(
          store: _BrokenStore(),
        );
        _keepAlive(c);
        await c.read(localeChoiceProvider.notifier).choose(AppLocale.vi);
        expect(c.read(appLocaleProvider), AppLocale.vi);
      },
    );
  });

  group('the phone language changes while the app runs', () {
    Future<ProviderContainer> pump(
      WidgetTester tester, {
      AppLocale? choice,
    }) async {
      tester.platformDispatcher.localesTestValue = const [Locale('en')];
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      final container = ProviderContainer(
        overrides: [
          localeStoreProvider.overrideWithValue(_MemoryStore(choice)),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const _Host(home: _Sample()),
        ),
      );
      await tester.pumpAndSettle();
      return container;
    }

    testWidgets('"System default" follows it, both ways', (tester) async {
      await pump(tester);
      expect(find.text('Today'), findsOneWidget);

      tester.platformDispatcher.localesTestValue = const [Locale('vi', 'VN')];
      await tester.pumpAndSettle();
      expect(find.text('Hôm nay'), findsOneWidget);

      tester.platformDispatcher.localesTestValue = const [Locale('fr')];
      await tester.pumpAndSettle();
      expect(find.text('Today'), findsOneWidget);
    });

    testWidgets('a fixed choice does not change', (tester) async {
      await pump(tester, choice: AppLocale.en);
      tester.platformDispatcher.localesTestValue = const [Locale('vi')];
      await tester.pumpAndSettle();
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Hôm nay'), findsNothing);
    });

    testWidgets(
      'going back to "System default" uses the current phone language',
      (
        tester,
      ) async {
        final c = await pump(tester, choice: AppLocale.en);
        tester.platformDispatcher.localesTestValue = const [Locale('vi')];
        await tester.pumpAndSettle();
        await c.read(localeChoiceProvider.notifier).choose(null);
        await tester.pumpAndSettle();
        expect(find.text('Hôm nay'), findsOneWidget);
      },
    );
  });

  group('changing the language', () {
    testWidgets('starts in the device language', (tester) async {
      await _pumpSample(tester, device: const [Locale('vi')]);
      expect(find.text('Hôm nay'), findsOneWidget);
      expect(find.text('Chào, An'), findsOneWidget);
    });

    testWidgets('the sheet offers three choices in their own language', (
      tester,
    ) async {
      await _pumpSample(tester);
      await tester.tap(find.text('Language'));
      await tester.pumpAndSettle();

      expect(find.text('System default'), findsOneWidget);
      expect(find.text('Tiếng Việt'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);
      expect(find.byType(RadioListTile<AppLocale?>), findsNWidgets(3));
      for (final tile in tester.widgetList(
        find.byType(RadioListTile<AppLocale?>),
      )) {
        expect(
          tester.getSize(find.byWidget(tile)).height,
          greaterThanOrEqualTo(48),
        );
      }
    });

    testWidgets('picking a language updates the screen at once, and back', (
      tester,
    ) async {
      final store = _MemoryStore();
      final c = await _pumpSample(tester, store: store);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Chào, An'), findsNothing);

      await tester.tap(find.text('Language'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tiếng Việt'));
      await tester.pumpAndSettle();

      expect(c.read(appLocaleProvider), AppLocale.vi);
      expect(store.saved, AppLocale.vi);
      // The sheet and the screen behind it are both Vietnamese now.
      expect(find.text('Ngôn ngữ'), findsWidgets);
      expect(find.text('Theo thiết bị'), findsNothing);
      expect(find.text('Theo hệ thống'), findsOneWidget);
      expect(find.text('Hôm nay'), findsOneWidget);
      expect(find.text('Chào, An'), findsOneWidget);
      expect(find.text('1 bài báo'), findsOneWidget);
      expect(find.text('3 bài báo'), findsOneWidget);

      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      expect(store.saved, AppLocale.en);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('1 paper'), findsOneWidget);
      expect(find.text('3 papers'), findsOneWidget);
      expect(find.text('Hôm nay'), findsNothing);
    });

    testWidgets('the current choice is the selected one', (tester) async {
      await _pumpSample(tester);
      await tester.tap(find.text('Language'));
      await tester.pumpAndSettle();
      RadioListTile<AppLocale?> tile(String label) => tester.widget(
        find.widgetWithText(RadioListTile<AppLocale?>, label),
      );
      RadioGroup<AppLocale?> group() =>
          tester.widget(find.byType(RadioGroup<AppLocale?>));

      expect(group().groupValue, isNull);
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      expect(group().groupValue, AppLocale.en);
      expect(tile('English').value, AppLocale.en);

      await tester.tap(find.text('System default'));
      await tester.pumpAndSettle();
      expect(group().groupValue, isNull);
    });

    testWidgets('Material widgets follow the language too', (tester) async {
      await _pumpSample(tester, device: const [Locale('vi')]);
      final context = tester.element(find.byType(Scaffold));
      expect(
        MaterialLocalizations.of(context).cancelButtonLabel.toLowerCase(),
        isNot('cancel'),
      );
      expect(Localizations.localeOf(context).languageCode, 'vi');
    });
  });

  group('layout in both languages (320dp, text scale 1.3)', () {
    for (final locale in AppLocale.values) {
      testWidgets('the language sheet does not overflow (${locale.code})', (
        tester,
      ) async {
        await _pumpSample(
          tester,
          store: _MemoryStore(locale),
          width: 320,
          scale: 1.3,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byType(ElevatedButton));
        await tester.pumpAndSettle();
        expect(find.byType(RadioListTile<AppLocale?>), findsNWidgets(3));
        expect(tester.takeException(), isNull);
      });
    }
  });
}

bool _samePlaceholders(Set<String> a, Set<String> b) =>
    a.length == b.length && a.containsAll(b);
