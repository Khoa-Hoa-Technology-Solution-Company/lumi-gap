import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/relative_time.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final FutureProvider<List<TrendExplanationHistoryItem>> explainHistoryProvider =
    FutureProvider.autoDispose<List<TrendExplanationHistoryItem>>(
  (ref) => ref.watch(trendsApiProvider).explainHistory(),
);

/// Explanations the reader asked for before; tapping one shows it again.
class TrendExplainHistory extends ConsumerWidget {
  const TrendExplainHistory({required this.onOpen, super.key});

  final ValueChanged<TrendExplanationHistoryItem> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(explainHistoryProvider);
    final theme = Theme.of(context);
    final lumi = context.lumi;

    final Widget body;
    if (history.hasValue) {
      final items = history.requireValue;
      body = items.isEmpty
          ? Text(
              context.t('No history saved yet.'),
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: lumi.foregroundSecondary),
            )
          : Column(
              children: [
                for (final item in items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      tileColor: lumi.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(color: lumi.line),
                      ),
                      title: Text(
                        item.topic ?? context.t('Dataset Overview'),
                        style: theme.textTheme.titleSmall,
                      ),
                      subtitle: Text(
                        [
                          _languageName(context, item.language),
                          ?_date(context, item.createdAt),
                        ].join(' · '),
                      ),
                      trailing: Icon(Icons.chevron_right, color: lumi.muted),
                      onTap: () => onOpen(item),
                    ),
                  ),
              ],
            );
    } else if (history.hasError) {
      body = LumiErrorState(
        message: context.t(failureMessageKey(history.error!)),
        retrying: history.isLoading,
        onRetry: () => ref.invalidate(explainHistoryProvider),
        inline: true,
      );
    } else {
      body = const LumiSkeleton(height: 64);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        LumiSectionHeader(title: context.t('Saved Explanation History')),
        body,
      ],
    );
  }

  static String _languageName(BuildContext context, String code) =>
      switch (code.toLowerCase()) {
        'vi' => context.t('Vietnamese (vi)'),
        'en' => context.t('English (en)'),
        _ => code.toUpperCase(),
      };

  /// Local short date, or null when the API sent nothing readable.
  static String? _date(BuildContext context, String raw) {
    final parsed = DateTime.tryParse(raw);
    return parsed == null
        ? null
        : formatShortDate(parsed.toLocal(), context.appLocale);
  }
}
