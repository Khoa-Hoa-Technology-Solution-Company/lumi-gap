import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the user's theme choice next to the token store, using the same
/// storage package (no new dependency). Every failure degrades to
/// [ThemeMode.system]; a broken keystore must never crash the app.
class ThemeModeStore {
  const ThemeModeStore([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;

  static const _key = 'theme_mode';

  Future<ThemeMode> read() async {
    try {
      return parse(await _storage.read(key: _key));
    } on Object catch (_) {
      return ThemeMode.system;
    }
  }

  Future<void> write(ThemeMode mode) async {
    try {
      await _storage.write(key: _key, value: mode.name);
    } on Object catch (_) {
      // Keep the in-memory choice for this session; persistence is best effort.
    }
  }

  /// Unknown or missing values fall back to [ThemeMode.system].
  static ThemeMode parse(String? value) {
    for (final mode in ThemeMode.values) {
      if (mode.name == value) return mode;
    }
    return ThemeMode.system;
  }
}
