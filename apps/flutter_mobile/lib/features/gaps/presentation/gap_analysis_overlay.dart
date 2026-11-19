import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Follows a gap analysis job over the page. The screen polls the status;
/// this only shows it.
class GapAnalysisOverlay extends ConsumerWidget {
  const GapAnalysisOverlay({
    required this.id,
    required this.onClose,
    super.key,
  });

  final String id;

  /// Called when the reader closes it; `ready` is true when the job
  /// finished, so the list can be reloaded with the new gaps.
  final void Function({required bool ready}) onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(gapStatusProvider(id));
    final theme = Theme.of(context);
    final lumi = context.lumi;

    final Widget content;
    if (query.hasValue) {
      final data = query.requireValue;
      final ready = data.status == 'ready';
      final failed = data.status == 'failed';
      content = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            ready
                ? Icons.check_circle_outline
                : failed
                    ? Icons.error_outline
                    : Icons.travel_explore,
            size: 40,
            color: failed ? lumi.error : lumi.primary,
          ),
          const SizedBox(height: 12),
          Text(
            ready
                ? context.t('Analysis complete')
                : failed
                    ? context.t('Gap Analysis Failed')
                    : context.t('Analyzing Gaps with AI'),
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium,
          ),
          if (failed && (data.errorMessage ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              data.errorMessage!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: lumi.error),
            ),
          ],
          if (!ready && !failed) ...[
            const SizedBox(height: 16),
            const LinearProgressIndicator(),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => onClose(ready: ready),
            child: Text(ready ? context.t('View gaps') : context.t('Close')),
          ),
        ],
      );
    } else if (query.hasError) {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            context.t(failureMessageKey(query.error!)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => onClose(ready: false),
            child: Text(context.t('Dismiss')),
          ),
        ],
      );
    } else {
      content = AppLoading(message: context.t('Queueing gap analysis job...'));
    }

    return ColoredBox(
      // A scrim, so the page behind is still seen and not mistaken for gone.
      color: lumi.scrim,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          constraints: const BoxConstraints(maxWidth: 400),
          decoration: BoxDecoration(
            color: lumi.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: content,
        ),
      ),
    );
  }
}
