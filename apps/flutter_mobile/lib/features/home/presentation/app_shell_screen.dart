import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/lumi_tints.dart';
import 'package:go_router/go_router.dart';

class AppShellDestination {
  const AppShellDestination(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// The five root tabs, in branch order (see `app_router.dart`).
final appShellDestinations = <AppShellDestination>[
  AppShellDestination(tk('Home'), Icons.home_outlined, Icons.home),
  AppShellDestination(tk('Explore'), Icons.explore_outlined, Icons.explore),
  AppShellDestination(tk('Projects'), Icons.folder_outlined, Icons.folder),
  AppShellDestination(tk('Community'), Icons.forum_outlined, Icons.forum),
  AppShellDestination(tk('Profile'), Icons.person_outline, Icons.person),
];

class AppShellScreen extends StatelessWidget {
  const AppShellScreen({required this.navigationShell, super.key});
  final StatefulNavigationShell navigationShell;

  void _goBranch(int index) {
    // Tapping the open tab again returns to that tab's root.
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  /// True when the open tab has pages pushed on its own navigator.
  bool _branchCanPop() =>
      navigationShell.route.branches[navigationShell.currentIndex].navigatorKey
          .currentState
          ?.canPop() ??
      false;

  @override
  Widget build(BuildContext context) {
    final current = navigationShell.currentIndex;

    // Android's predictive back (API 34+) closes the app unless Flutter has
    // said it handles Back. Flutter derives that from whether a navigator
    // can pop, which ignores the PopScope below (each tab has its own
    // navigator). So the shell says it itself: on any tab but Home, or when
    // the open tab has a page to go back to.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!context.mounted) return;
      NavigationNotification(canHandlePop: current != 0 || _branchCanPop())
          .dispatch(context);
    });

    // On Android Back: any tab other than Home returns to Home; Home exits.
    return PopScope(
      canPop: current == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) navigationShell.goBranch(0);
      },
      child: Scaffold(
        // A tab's navigator says "nothing to pop" at its root page; off Home
        // the shell still handles Back (it goes Home), so that is corrected
        // before it reaches the platform.
        body: NotificationListener<NavigationNotification>(
          onNotification: (notification) {
            if (current == 0 || notification.canHandlePop) return false;
            const NavigationNotification(canHandlePop: true).dispatch(context);
            return true;
          },
          child: navigationShell,
        ),
        // A floating dark bar, inset from the edges: the mobile look of the
        // app, not a web footer. The open tab is a blue pill with its name;
        // the others are icons (long press shows the name; screen readers
        // hear it on every tab).
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: LumiFloatingNavBar(
              selectedIndex: current,
              onSelected: _goBranch,
              destinations: appShellDestinations,
            ),
          ),
        ),
      ),
    );
  }
}

class LumiFloatingNavBar extends StatelessWidget {
  const LumiFloatingNavBar({
    required this.selectedIndex,
    required this.onSelected,
    required this.destinations,
    super.key,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final List<AppShellDestination> destinations;

  @override
  Widget build(BuildContext context) {
    final tints = context.tints;
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.lumi.surface,
        border: Theme.of(context).brightness == Brightness.dark
            ? Border.all(color: context.lumi.line)
            : null,
        borderRadius: BorderRadius.circular(24),
        boxShadow: LumiElevation.floating,
      ),
      child: SizedBox(
        height: 68,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              for (final (i, d) in destinations.indexed)
                Expanded(
                  // The open tab takes more room for its name.
                  flex: i == selectedIndex ? 2 : 1,
                  child: Semantics(
                    container: true,
                    button: true,
                    selected: i == selectedIndex,
                    label: context.t(d.label),
                    excludeSemantics: true,
                    onTap: () => onSelected(i),
                    child: _NavItem(
                      label: context.t(d.label),
                      icon: i == selectedIndex ? d.selectedIcon : d.icon,
                      selected: i == selectedIndex,
                      onTap: () => onSelected(i),
                      tints: tints,
                      theme: theme,
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

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.tints,
    required this.theme,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final LumiTints tints;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final content = selected
        ? Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 22, color: tints.onHero),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: tints.onHero,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          )
        : Tooltip(
            message: label,
            child: Center(
              child: Icon(icon, size: 24, color: context.lumi.foregroundSecondary),
            ),
          );
    return Center(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        height: 48,
        decoration: BoxDecoration(
          color: selected ? tints.navSelected : context.lumi.surface,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: content,
          ),
        ),
      ),
    );
  }

}
