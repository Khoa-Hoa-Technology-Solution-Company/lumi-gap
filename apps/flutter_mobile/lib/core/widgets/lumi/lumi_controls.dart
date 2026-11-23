import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';

/// The main choice of a screen (2–4 options) as a muted track whose selected
/// option is a raised `surface` tile. Secondary choices go in a filter sheet.
class LumiSegmentedTabs<T> extends StatelessWidget {
  const LumiSegmentedTabs({
    required this.options,
    required this.selected,
    required this.onChanged,
    this.enabled = true,
    super.key,
  }) : assert(options.length >= 2 && options.length <= 4, '2 to 4 options');

  /// Value and its (already translated) label.
  final List<(T, String)> options;
  final T selected;
  final ValueChanged<T> onChanged;

  /// False while the choice must not change (a request is running): the
  /// control is dimmed and ignores taps.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final theme = Theme.of(context);
    final track = Container(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: segmentTrackColor(context),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: [
          for (final (value, label) in options)
            Expanded(
              child: _Segment(
                label: label,
                selected: value == selected,
                onTap: enabled
                    ? () {
                        if (value != selected) onChanged(value);
                      }
                    : null,
                lumi: lumi,
                style: theme.textTheme.titleSmall,
              ),
            ),
        ],
      ),
    );
    if (enabled) return track;
    return Semantics(
      enabled: false,
      child: Opacity(opacity: 0.5, child: IgnorePointer(child: track)),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.lumi,
    required this.style,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final LumiColors lumi;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    // The whole 48dp cell takes the tap; the raised tile inside it is 40dp.
    return Semantics(
      selected: selected,
      button: true,
      inMutuallyExclusiveGroup: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
            child: Material(
              color: selected
                  ? segmentSelectedColor(context)
                  : segmentTrackColor(context),
              elevation: selected ? 1 : 0,
              shadowColor: lumi.scrim,
              borderRadius: BorderRadius.circular(999),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 40),
                child: Center(
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: style?.copyWith(
                        color: selected
                            ? lumi.foreground
                            : lumi.foregroundSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A 48dp bordered button that opens a screen's filter sheet; the badge
/// counts the filters in force and is hidden when there are none.
class LumiFilterButton extends StatelessWidget {
  const LumiFilterButton({
    required this.activeCount,
    required this.onPressed,
    this.onHero = false,
    super.key,
  });

  final int activeCount;
  final VoidCallback onPressed;

  /// In a blue app bar: white icon on a translucent tile, like the Home bell.
  final bool onHero;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    final tints = context.tints;
    final label = activeCount == 0
        ? context.t('Filters')
        : context.t('Filters, {{count}} active', {'count': '$activeCount'});
    // Its own node: never merged into the text around it.
    return Semantics(
      container: true,
      button: true,
      label: label,
      // The InkWell below is hidden from accessibility with the rest, so
      // the tap is offered here.
      onTap: onPressed,
      excludeSemantics: true,
      child: Tooltip(
        message: label,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Material(
                  color: onHero
                      ? tints.onHero.withValues(alpha: 0.16)
                      : lumi.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(onHero ? 14 : 12),
                    side: onHero ? BorderSide.none : BorderSide(color: lumi.line),
                  ),
                  child: InkWell(
                    onTap: onPressed,
                    borderRadius: BorderRadius.circular(onHero ? 14 : 12),
                    child: Icon(
                      Icons.tune,
                      size: 20,
                      color: onHero ? tints.onHero : lumi.foreground,
                    ),
                  ),
                ),
              ),
              if (activeCount > 0)
                Positioned(
                  top: -6,
                  right: -6,
                  child: IgnorePointer(
                    child: Container(
                      constraints:
                          const BoxConstraints(minWidth: 20, minHeight: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: onHero ? tints.onHero : lumi.primary,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '$activeCount',
                        style: Theme.of(context)
                            .textTheme
                            .labelMedium
                            ?.copyWith(
                              color: onHero
                                  ? LumiColors.light.primary
                                  : lumi.onPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A search box that opens the search screen: 52dp, radius 12.
class LumiSearchButton extends StatelessWidget {
  const LumiSearchButton({
    required this.hint,
    required this.onPressed,
    super.key,
  });

  final String hint;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    // Its own node: never merged into the text around it.
    return Semantics(
      container: true,
      button: true,
      label: hint,
      onTap: onPressed,
      excludeSemantics: true,
      child: Material(
        color: lumi.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: lumi.line),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 52,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Icon(Icons.search, size: 22, color: lumi.foregroundSecondary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      hint,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// An entry point: a 56dp tinted tile with the icon, the label under it.
class LumiShortcutTile extends StatelessWidget {
  const LumiShortcutTile({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.tint,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  /// The icon's tile colour; the brand blue when null.
  final LumiTint? tint;

  @override
  Widget build(BuildContext context) {
    final lumi = context.lumi;
    // Its own node: never merged into the text around it.
    return Semantics(
      container: true,
      button: true,
      label: label,
      // The InkWell below is hidden from accessibility with the rest, so
      // the tap is offered here.
      onTap: onPressed,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: lumi.surface,
          borderRadius: BorderRadius.circular(LumiElevation.cardRadius),
          border: Theme.of(context).brightness == Brightness.dark
              ? Border.all(color: lumi.line)
              : null,
          boxShadow: LumiElevation.card(Theme.of(context).brightness),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(LumiElevation.cardRadius),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: tint?.background ?? lumi.primarySoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 22, color: tint?.foreground ?? lumi.primary),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .labelLarge
                    ?.copyWith(color: lumi.foreground),
              ),
            ],
          ),
        ),
      ),
        ),
      ),
    );
  }
}

/// The track of a segmented control: a recessed grey in light mode. In dark
/// mode the track is the card colour and the selected pill the lighter grey,
/// so the selection reads as raised, not sunken.
Color segmentTrackColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? context.lumi.surface
        : context.lumi.surfaceMuted;

/// The selected pill of a segmented control (see [segmentTrackColor]).
Color segmentSelectedColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? context.lumi.surfaceMuted
        : context.lumi.surface;
