import 'package:flutter_mobile/core/i18n/app_locale.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the language choice next to the theme choice, with the same
/// storage package. `null` means "follow the device". Every failure degrades
/// to `null`; a broken keystore must never crash the app.
class LocaleStore {
  const LocaleStore([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;

  static const _key = 'ui_locale';

  Future<AppLocale?> read() async {
    try {
      return AppLocale.parse(await _storage.read(key: _key));
    } on Object catch (_) {
      return null;
    }
  }

  Future<void> write(AppLocale? locale) async {
    try {
      if (locale == null) {
        await _storage.delete(key: _key);
      } else {
        await _storage.write(key: _key, value: locale.code);
      }
    } on Object catch (_) {
      // Keep the in-memory choice for this session; persistence is best effort.
    }
  }
}
