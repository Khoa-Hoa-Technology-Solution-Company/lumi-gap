import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

String themeModeLabel(ThemeMode mode) => switch (mode) {
      ThemeMode.system => 'Theo hệ thống',
      ThemeMode.light => 'Sáng',
      ThemeMode.dark => 'Tối',
    };

IconData themeModeIcon(ThemeMode mode) => switch (mode) {
      ThemeMode.system => Icons.brightness_auto_outlined,
      ThemeMode.light => Icons.light_mode_outlined,
      ThemeMode.dark => Icons.dark_mode_outlined,
    };

/// Bottom sheet with the three theme choices; a choice applies immediately.
Future<void> showThemeModeSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (_) => const ThemeModeSheet(),
  );
}

class ThemeModeSheet extends ConsumerWidget {
  const ThemeModeSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final theme = Theme.of(context);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text('Giao diện', style: theme.textTheme.titleLarge),
          ),
          RadioGroup<ThemeMode>(
            groupValue: mode,
            onChanged: (value) {
              if (value != null) {
                unawaited(
                  ref.read(themeModeProvider.notifier).setMode(value),
                );
              }
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final option in ThemeMode.values)
                  RadioListTile<ThemeMode>(
                    value: option,
                    minVerticalPadding: 16,
                    title: Text(
                      themeModeLabel(option),
                      style: theme.textTheme.bodyLarge
                          ?.copyWith(color: context.lumi.foreground),
                    ),
                    secondary: Icon(themeModeIcon(option)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
