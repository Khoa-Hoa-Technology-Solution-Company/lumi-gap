import 'dart:async';
import 'dart:ui';

import 'package:flutter/widgets.dart';
import 'package:flutter_mobile/core/i18n/app_locale.dart';
import 'package:flutter_mobile/core/storage/locale_store.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final localeStoreProvider = Provider<LocaleStore>((ref) => const LocaleStore());

/// The device's preferred languages, kept current while the app runs: when
/// the user changes the phone language the list is replaced, so "System
/// default" follows it. Overridable in tests.
class DeviceLocalesNotifier extends Notifier<List<Locale>> {
  @override
  List<Locale> build() {
    final observer = _LocaleObserver((locales) => state = locales);
    WidgetsBinding.instance.addObserver(observer);
    ref.onDispose(() => WidgetsBinding.instance.removeObserver(observer));
    return PlatformDispatcher.instance.locales;
  }
}

class _LocaleObserver with WidgetsBindingObserver {
  _LocaleObserver(this._onChanged);
  final void Function(List<Locale> locales) _onChanged;

  @override
  void didChangeLocales(List<Locale>? locales) =>
      _onChanged(locales ?? PlatformDispatcher.instance.locales);
}

final deviceLocalesProvider =
    NotifierProvider<DeviceLocalesNotifier, List<Locale>>(
      DeviceLocalesNotifier.new,
    );

/// The user's choice: `null` follows the device (the default), otherwise a
/// fixed language. The saved choice is loaded after start-up; a choice made
/// before the load finishes wins. A storage error keeps "follow the device".
class LocaleChoiceNotifier extends Notifier<AppLocale?> {
  bool _chosen = false;

  @override
  AppLocale? build() {
    unawaited(_load());
    return null;
  }

  Future<void> _load() async {
    final saved = await ref.read(localeStoreProvider).read();
    if (!ref.mounted || _chosen) return;
    state = saved;
  }

  Future<void> choose(AppLocale? locale) async {
    _chosen = true;
    state = locale;
    await ref.read(localeStoreProvider).write(locale);
  }
}

final localeChoiceProvider = NotifierProvider<LocaleChoiceNotifier, AppLocale?>(
  LocaleChoiceNotifier.new,
);

/// The language actually shown: the choice, or the device language.
final appLocaleProvider = Provider<AppLocale>((ref) {
  return ref.watch(localeChoiceProvider) ??
      AppLocale.fromDevice(ref.watch(deviceLocalesProvider));
});
