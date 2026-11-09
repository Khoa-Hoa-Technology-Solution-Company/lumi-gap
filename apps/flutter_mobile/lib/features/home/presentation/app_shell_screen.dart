import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppShellDestination {
  const AppShellDestination(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// The four root tabs, in branch order (see `app_router.dart`).
const appShellDestinations = <AppShellDestination>[
  AppShellDestination('Trang chủ', Icons.home_outlined, Icons.home),
  AppShellDestination('Khám phá', Icons.explore_outlined, Icons.explore),
  AppShellDestination('Dự án', Icons.folder_outlined, Icons.folder),
  AppShellDestination('Hồ sơ', Icons.person_outline, Icons.person),
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
                label: d.label,
              ),
          ],
        ),
      ),
    );
  }
}
