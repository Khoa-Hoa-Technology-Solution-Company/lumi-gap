import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';

/// Section title with an optional "View all" text button (48dp tall) and an
/// optional caption under the title.
class HomeSectionHeader extends StatelessWidget {
  const HomeSectionHeader({
    required this.title,
    super.key,
    this.onAll,
    this.caption,
  });

  final String title;
  final VoidCallback? onAll;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return LumiSectionHeader(
      title: title,
      caption: caption,
      actionLabel: context.t('View all'),
      onAction: onAll,
    );
  }
}

/// The Home list card, the same surface as `LumiCard`: radius 20, a soft
/// shadow in light mode, a hairline border in dark mode.
BoxDecoration homeCardDecoration(BuildContext context) {
  final lumi = context.lumi;
  final brightness = Theme.of(context).brightness;
  return BoxDecoration(
    color: lumi.surface,
    border: brightness == Brightness.dark ? Border.all(color: lumi.line) : null,
    borderRadius: BorderRadius.circular(LumiElevation.cardRadius),
    boxShadow: LumiElevation.card(brightness),
  );
}

/// Loading placeholder: static blocks (no animation, so tests can settle).
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key, this.rows = 2, this.height = 72});

  final int rows;
  final double height;

  @override
  Widget build(BuildContext context) =>
      LumiSkeleton(rows: rows, height: height);
}

/// "This section could not be loaded" card, used both for a failed request
/// and for a section the backend reports as `unavailable`.
class HomeSectionError extends StatelessWidget {
  const HomeSectionError({
    required this.onRetry,
    super.key,
    this.retrying = false,
    this.message,
  });

  final VoidCallback onRetry;
  final bool retrying;

  /// Defaults to "This section could not be loaded".
  final String? message;

  @override
  Widget build(BuildContext context) => LumiErrorState(
        onRetry: onRetry,
        retrying: retrying,
        message: message,
        inline: true,
      );
}

/// Empty section: an icon, why it is empty, and the action that fills it
/// when there is one.
class HomeEmptyCard extends StatelessWidget {
  const HomeEmptyCard({
    required this.text,
    super.key,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String text;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => LumiEmptyState(
        icon: icon,
        message: text,
        actionLabel: actionLabel,
        onAction: onAction,
        compact: true,
      );
}
