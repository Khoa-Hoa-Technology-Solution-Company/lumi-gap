import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/storage/theme_mode_store.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final themeModeStoreProvider = Provider<ThemeModeStore>(
  (ref) => const ThemeModeStore(),
);

/// Three choices: system (default), light, dark. The saved choice is loaded
/// after start-up; a choice made before the load finishes wins.
class ThemeNotifier extends Notifier<ThemeMode> {
  bool _chosen = false;

  @override
  ThemeMode build() {
    unawaited(_load());
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final saved = await ref.read(themeModeStoreProvider).read();
    if (!ref.mounted || _chosen) return;
    state = saved;
  }

  Future<void> setMode(ThemeMode mode) async {
    _chosen = true;
    state = mode;
    await ref.read(themeModeStoreProvider).write(mode);
  }
}

final themeModeProvider = NotifierProvider<ThemeNotifier, ThemeMode>(() {
  return ThemeNotifier();
});
