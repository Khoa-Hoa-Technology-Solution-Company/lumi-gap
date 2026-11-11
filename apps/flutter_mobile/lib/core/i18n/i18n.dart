import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_mobile/core/i18n/app_locale.dart';
import 'package:flutter_mobile/core/i18n/translations_vi.dart';

export 'package:flutter_mobile/core/i18n/app_locale.dart';

/// How to add a string: write the English text as the key,
/// `context.t('Save changes')`, and add its Vietnamese translation to
/// `translations_vi.dart`. A test fails when a key used in `lib/` has no
/// translation. Keys that are stored before they are shown (labels in
/// models, enum maps) are wrapped in [tk] so the test still finds them.
///
/// Placeholders use the web app's `{{name}}` form so web translations can be
/// reused as they are: `context.t('{{count}} members', {'count': n})`.

/// Material delegates for [AppLocale.supportedLocales].
const List<LocalizationsDelegate<dynamic>> appLocalizationsDelegates = [
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

/// Marks an English key that is translated later with `context.t(key)`.
/// Returns the key unchanged.
String tk(String key) => key;

final RegExp _placeholder = RegExp(r'\{\{\s*(\w+)\s*\}\}');

/// [key] in [locale], with `{{name}}` filled from [args]. A missing
/// translation shows the English key; a missing argument leaves its
/// placeholder visible so the bug is easy to spot.
String translate(
  String key,
  AppLocale locale, [
  Map<String, Object?>? args,
]) {
  final text = locale == AppLocale.vi ? (viTranslations[key] ?? key) : key;
  if (args == null || args.isEmpty) return text;
  return text.replaceAllMapped(_placeholder, (m) {
    final name = m.group(1)!;
    return args.containsKey(name) ? '${args[name]}' : m.group(0)!;
  });
}

/// Language for text built outside the widget tree, such as a fallback label
/// made while parsing server data ("Untitled paper"). `App` keeps it equal
/// to the language on screen. Such text keeps the language it was made in
/// until the data is loaded again; anything shown from a widget should use
/// `context.t` instead.
AppLocale currentAppLocale = AppLocale.en;

/// [translate] in [currentAppLocale]. Only for code without a BuildContext.
String trNow(String key, [Map<String, Object?>? args]) =>
    translate(key, currentAppLocale, args);

/// English one/other by [count]; Vietnamese has one form, but both English
/// keys carry a translation. [count] is also passed as `{{count}}`.
String translatePlural(
  int count,
  AppLocale locale, {
  required String one,
  required String other,
  Map<String, Object?>? args,
}) {
  return translate(count == 1 ? one : other, locale, {
    'count': count,
    ...?args,
  });
}

extension AppI18nContext on BuildContext {
  /// The language currently shown. Depends on [Localizations], so a widget
  /// that calls this rebuilds when the language changes.
  AppLocale get appLocale => AppLocale.of(Localizations.localeOf(this));

  /// Locale name for `intl` formatting (`DateFormat`, `NumberFormat`).
  String get intlLocale => appLocale.code;

  String t(String key, [Map<String, Object?>? args]) =>
      translate(key, appLocale, args);

  String plural(
    int count, {
    required String one,
    required String other,
    Map<String, Object?>? args,
  }) => translatePlural(count, appLocale, one: one, other: other, args: args);
}
