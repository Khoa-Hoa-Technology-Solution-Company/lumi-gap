import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/i18n/locale_provider.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Language names are shown in their own language so a user who cannot read
/// the current one can still find theirs.
String languageChoiceLabel(BuildContext context, AppLocale? choice) =>
    switch (choice) {
      null => context.t('System default'),
      AppLocale.vi => 'Tiếng Việt', // i18n-ignore: native language name
      AppLocale.en => 'English', // i18n-ignore: native language name
    };

/// Bottom sheet with the three language choices; a choice applies immediately.
Future<void> showLanguageSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (_) => const LanguageSheet(),
  );
}

class LanguageSheet extends ConsumerWidget {
  const LanguageSheet({super.key});

  static const _options = <AppLocale?>[null, AppLocale.vi, AppLocale.en];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final choice = ref.watch(localeChoiceProvider);
    final theme = Theme.of(context);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(context.t('Language'), style: theme.textTheme.titleLarge),
          ),
          RadioGroup<AppLocale?>(
            groupValue: choice,
            onChanged: (value) =>
                unawaited(ref.read(localeChoiceProvider.notifier).choose(value)),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final option in _options)
                  RadioListTile<AppLocale?>(
                    value: option,
                    minVerticalPadding: 16,
                    title: Text(
                      languageChoiceLabel(context, option),
                      style: theme.textTheme.bodyLarge
                          ?.copyWith(color: context.lumi.foreground),
                    ),
                    secondary: const Icon(Icons.language),
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
