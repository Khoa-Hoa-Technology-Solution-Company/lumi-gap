import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';

/// The header of a root tab (direction A): the brand blue band with a large
/// bold title, rounded at its lower edge, and an optional [bottom] (a search
/// button, for instance) inside the band. White status bar icons over it.
class LumiHeroAppBar extends StatelessWidget implements PreferredSizeWidget {
  const LumiHeroAppBar({
    required this.title,
    this.actions = const [],
    this.bottom,
    this.bottomHeight = 0,
    super.key,
  });

  final String title;
  final List<Widget> actions;

  /// Drawn inside the band under the title; [bottomHeight] is its height.
  final Widget? bottom;
  final double bottomHeight;

  static const double _toolbarHeight = 64;
  static const double _bottomGap = 16;

  @override
  Size get preferredSize => Size.fromHeight(
        _toolbarHeight + (bottom == null ? 0 : bottomHeight + _bottomGap),
      );

  @override
  Widget build(BuildContext context) {
    final tints = context.tints;
    final theme = Theme.of(context);
    return AppBar(
      automaticallyImplyLeading: false,
      toolbarHeight: _toolbarHeight,
      backgroundColor: tints.hero,
      foregroundColor: tints.onHero,
      surfaceTintColor: tints.hero,
      scrolledUnderElevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      titleSpacing: 20,
      title: Semantics(
        header: true,
        child: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.headlineSmall?.copyWith(
            color: tints.onHero,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      actions: [...actions, if (actions.isNotEmpty) const SizedBox(width: 8)],
      bottom: bottom == null
          ? null
          : PreferredSize(
              preferredSize: Size.fromHeight(bottomHeight + _bottomGap),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, _bottomGap),
                child: SizedBox(height: bottomHeight, child: bottom),
              ),
            ),
    );
  }
}
