import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';

/// Section title with an optional "Xem tất cả" text button (48dp tall).
class HomeSectionHeader extends StatelessWidget {
  const HomeSectionHeader({required this.title, super.key, this.onAll});

  final String title;
  final VoidCallback? onAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleLarge,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          if (onAll != null)
            TextButton(onPressed: onAll, child: const Text('Xem tất cả')),
        ],
      ),
    );
  }
}

BoxDecoration homeCardDecoration(LumiColors lumi) => BoxDecoration(
  color: lumi.surface,
  border: Border.all(color: lumi.line),
  borderRadius: BorderRadius.circular(8),
);

/// Loading placeholder: static blocks (no animation, so tests can settle).
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key, this.rows = 2, this.height = 72});

  final int rows;
  final double height;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Semantics(
      label: 'Đang tải',
      container: true,
      child: Column(
        children: [
          for (var i = 0; i < rows; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            DecoratedBox(
              decoration: BoxDecoration(
                color: lumi.surfaceMuted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: SizedBox(height: height, width: double.infinity),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Chưa tải được phần này" card, used both for a failed request and for a
/// section the backend reports as `unavailable`.
class HomeSectionError extends StatelessWidget {
  const HomeSectionError({
    required this.onRetry,
    super.key,
    this.retrying = false,
    this.message = 'Chưa tải được phần này',
  });

  final VoidCallback onRetry;
  final bool retrying;
  final String message;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
      decoration: homeCardDecoration(lumi),
      child: Row(
        children: [
          Icon(Icons.cloud_off_outlined, color: lumi.muted),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
          ),
          TextButton(
            onPressed: retrying ? null : onRetry,
            child: retrying
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text('Đang tải…'),
                    ],
                  )
                : const Text('Thử lại'),
          ),
        ],
      ),
    );
  }
}

class HomeEmptyCard extends StatelessWidget {
  const HomeEmptyCard({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: homeCardDecoration(lumi),
      child: Text(
        text,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: lumi.foregroundSecondary),
      ),
    );
  }
}
