import 'dart:ui';

/// The two UI languages. English strings are the translation keys (same as
/// the web app), so [en] needs no dictionary.
enum AppLocale {
  vi('vi'),
  en('en');

  const AppLocale(this.code);

  final String code;

  Locale get locale => Locale(code);

  /// `null` for missing or unknown values ("follow the device").
  static AppLocale? parse(String? value) {
    for (final l in values) {
      if (l.code == value) return l;
    }
    return null;
  }

  /// Vietnamese when the device's preferred language is Vietnamese,
  /// otherwise English.
  static AppLocale fromDevice(List<Locale> deviceLocales) {
    if (deviceLocales.isEmpty) return AppLocale.en;
    return deviceLocales.first.languageCode == 'vi'
        ? AppLocale.vi
        : AppLocale.en;
  }

  static AppLocale of(Locale locale) =>
      locale.languageCode == 'vi' ? AppLocale.vi : AppLocale.en;

  static const List<Locale> supportedLocales = [Locale('vi'), Locale('en')];
}
