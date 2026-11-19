import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';

/// Section title (`titleLarge`), an optional caption under it and an optional
/// 48dp text action on the right ("View all").
class LumiSectionHeader extends StatelessWidget {
  const LumiSectionHeader({
    required this.title,
    this.caption,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final String title;
  final String? caption;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            // Same height with or without the action, so sections line up.
            constraints: const BoxConstraints(minHeight: 48),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      title,
                      style: theme.textTheme.titleLarge,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                if (onAction != null && actionLabel != null)
                  TextButton(
                    onPressed: onAction,
                    // No right padding: the label ends on the same edge as
                    // the cards below. The tap target stays 48dp.
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.only(left: 12),
                      minimumSize: const Size(48, 48),
                    ),
                    child: Text(actionLabel!),
                  ),
              ],
            ),
          ),
          if (caption != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                caption!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.lumi.foregroundSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Loading placeholder: muted blocks in the shape of what will appear.
/// Static on purpose: a section that loads for a second does not need
/// motion, and nothing keeps animating if the request never returns.
class LumiSkeleton extends StatelessWidget {
  const LumiSkeleton({this.rows = 2, this.height = 72, super.key});

  final int rows;
  final double height;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    return Semantics(
      label: context.t('Loading'),
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

/// [LumiSkeleton] as the whole body of a screen or tab: page padding, and
/// clipped rather than scrollable, so on a short screen the last placeholder
/// is simply cut off.
class LumiPageSkeleton extends StatelessWidget {
  const LumiPageSkeleton({this.rows = 4, this.height = 96, super.key});

  final int rows;
  final double height;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    physics: const NeverScrollableScrollPhysics(),
    padding: const EdgeInsets.all(16),
    child: LumiSkeleton(rows: rows, height: height),
  );
}

/// "Nothing here yet": an icon in a muted circle, a sentence that says why,
/// and the action that fills it when there is one.
///
/// [compact] is a card for a section inside a longer page; the default is a
/// centred block for a whole screen or list.
class LumiEmptyState extends StatelessWidget {
  const LumiEmptyState({
    required this.icon,
    required this.message,
    this.title,
    this.actionLabel,
    this.onAction,
    this.compact = false,
    super.key,
  });

  final IconData icon;
  final String message;
  final String? title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  bool get _hasAction => actionLabel != null && onAction != null;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    // The full block is the screen's only content: its circle is tinted
    // with the accent. The compact one sits among other sections and stays
    // neutral.
    Widget circle(double size, double iconSize, {bool accent = false}) =>
        ExcludeSemantics(
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: accent ? lumi.primarySoft : lumi.surfaceMuted,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              size: iconSize,
              color: accent ? lumi.primary : lumi.muted,
            ),
          ),
        );

    if (compact) {
      return LumiCard(
        padding: EdgeInsets.fromLTRB(16, 12, 16, _hasAction ? 4 : 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                circle(40, 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    message,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: lumi.foregroundSecondary,
                    ),
                  ),
                ),
              ],
            ),
            if (_hasAction)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: onAction,
                  child: Text(actionLabel!),
                ),
              ),
          ],
        ),
      );
    }

    // Centred in the space it is given; when that space is shorter than the
    // block (large text, a short box), it scrolls instead of overflowing.
    return LayoutBuilder(
      builder: (context, constraints) {
        final content = Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                circle(72, 32, accent: true),
                const SizedBox(height: 16),
                if (title != null) ...[
                  Text(
                    title!,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                ],
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: lumi.foregroundSecondary,
                  ),
                ),
                if (_hasAction) ...[
                  const SizedBox(height: 20),
                  FilledButton(onPressed: onAction, child: Text(actionLabel!)),
                ],
              ],
            ),
          ),
        );
        if (!constraints.hasBoundedHeight) return content;
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: content,
          ),
        );
      },
    );
  }
}

/// "Could not load": what failed and a retry that shows it is working.
///
/// [inline] is a one-row card for a section; the default is a centred block.
class LumiErrorState extends StatelessWidget {
  const LumiErrorState({
    required this.onRetry,
    this.message,
    this.retrying = false,
    this.inline = false,
    super.key,
  });

  final VoidCallback onRetry;

  /// Defaults to "This section could not be loaded".
  final String? message;
  final bool retrying;
  final bool inline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final text = message ?? context.t('This section could not be loaded');

    final retryChild = retrying
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
              Text(context.t('Loading…')),
            ],
          )
        : Text(context.t('Try again'));

    if (inline) {
      return LumiCard(
        padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
        child: Row(
          children: [
            Icon(Icons.cloud_off_outlined, color: lumi.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: lumi.foregroundSecondary,
                ),
              ),
            ),
            TextButton(
              onPressed: retrying ? null : onRetry,
              child: retryChild,
            ),
          ],
        ),
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 40, color: lumi.error),
            const SizedBox(height: 16),
            Text(
              text,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: retrying ? null : onRetry,
              child: retryChild,
            ),
          ],
        ),
      ),
    );
  }
}
