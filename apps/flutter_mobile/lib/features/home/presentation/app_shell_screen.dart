import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:go_router/go_router.dart';

class AppShellDestination {
  const AppShellDestination(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// The four root tabs, in branch order (see `app_router.dart`).
final appShellDestinations = <AppShellDestination>[
  AppShellDestination(tk('Home'), Icons.home_outlined, Icons.home),
  AppShellDestination(tk('Explore'), Icons.explore_outlined, Icons.explore),
  AppShellDestination(tk('Projects'), Icons.folder_outlined, Icons.folder),
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

  @override
  Widget build(BuildContext context) {
    final current = navigationShell.currentIndex;

    // On Android Back: any tab other than Home returns to Home; Home exits.
    return PopScope(
      canPop: current == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) navigationShell.goBranch(0);
      },
      child: Scaffold(
        body: navigationShell,
        bottomNavigationBar: NavigationBar(
          selectedIndex: current,
          onDestinationSelected: _goBranch,
          destinations: [
            for (final d in appShellDestinations)
              NavigationDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.selectedIcon),
                label: context.t(d.label),
              ),
          ],
        ),
      ),
    );
  }
}
