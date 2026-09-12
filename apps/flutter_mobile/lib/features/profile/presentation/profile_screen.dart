import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/rankings/domain/level_helper.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Do you want to sign out of Publication Trend?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final user = authState.value;
    final bookmarks = ref.watch(bookmarksProvider).value ?? [];
    final reports = ref.watch(reportsProvider(const ReportsParams())).value?.total ?? 0;
    
    final paperBookmarks = bookmarks.where((b) => b.targetKind == 'paper').toList();
    final topicCount = paperBookmarks
        .expand((bookmark) => bookmark.paperDetail?.topics ?? const <PaperTopic>[])
        .map((topic) => topic.topicName)
        .toSet()
        .length;

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final userPoints = user?.points ?? 0;
    final userLevel = LevelHelper.getLevel(userPoints);
    final levelAsset = LevelHelper.getLevelAsset(userLevel);

    final currentThemeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile', style: TextStyle(fontWeight: FontWeight.bold)),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          children: [
            // Avatar rank badge
            Center(
              child: Column(
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF111C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFF06B6D4), width: 2),
                    ),
                    child: Image.asset(
                      levelAsset,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    user?.fullName ?? 'Researcher',
                    style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF06B6D4).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      user?.role.name.toUpperCase() ?? 'RESEARCHER',
                      style: const TextStyle(
                        color: Color(0xFF0891B2),
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.school, size: 16, color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(
                        user?.institution ?? 'FPT University',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Stats Cards Row
            Row(
              children: [
                _StatCard(label: 'Bookmarks', value: paperBookmarks.length.toString(), theme: theme),
                const SizedBox(width: 12),
                _StatCard(label: 'Topics', value: topicCount.toString(), theme: theme),
                const SizedBox(width: 12),
                _StatCard(label: 'Reports', value: reports.toString(), theme: theme),
              ],
            ),
            const SizedBox(height: 24),

            // Activity section
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Text(
                'ACTIVITY',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey,
                  letterSpacing: 1.1,
                ),
              ),
            ),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.dividerColor),
              ),
              color: theme.cardColor,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  _SettingsRow(
                    icon: Icons.cloud_upload_outlined,
                    label: 'Submit Paper',
                    onTap: () => context.push('/submit-paper'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.description_outlined,
                    label: 'My Papers',
                    onTap: () => context.push('/my-papers'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.folder_outlined,
                    label: 'Projects',
                    onTap: () => context.push('/projects'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.emoji_events_outlined,
                    label: 'Rankings',
                    onTap: () => context.push('/rankings'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.notifications_none,
                    label: 'Notifications',
                    onTap: () => context.push('/notifications'),
                    theme: theme,
                  ),
                  if (user?.role.name == 'admin')
                    _SettingsRow(
                      icon: Icons.sync,
                      label: 'Admin Sync',
                      onTap: () => context.push('/admin/sync'),
                      theme: theme,
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Appearance section
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Text(
                'APPEARANCE',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey,
                  letterSpacing: 1.1,
                ),
              ),
            ),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: theme.dividerColor),
              ),
              color: theme.cardColor,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  _SettingsRow(
                    icon: currentThemeMode == ThemeMode.dark ? Icons.dark_mode : Icons.light_mode,
                    label: 'Theme',
                    value: currentThemeMode == ThemeMode.dark ? 'Dark' : 'Light',
                    onTap: () {
                      ref.read(themeModeProvider.notifier).toggleTheme();
                    },
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.text_fields,
                    label: 'Font size',
                    value: 'Default',
                    theme: theme,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // Sign out button
            OutlinedButton(
              onPressed: authState.isLoading ? null : () => _handleLogout(context, ref),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Sign out',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.theme});

  final String label;
  final String value;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: theme.cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.dividerColor),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.label,
    required this.theme, this.value,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String? value;
  final VoidCallback? onTap;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Icon(
            icon,
            size: 20,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          if (value != null) ...[
            Text(
              value!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 8),
          ],
          if (onTap != null)
            Icon(
              Icons.chevron_right,
              size: 20,
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
            ),
        ],
      ),
    );

    if (onTap == null) return rowContent;

    return InkWell(
      onTap: onTap,
      child: rowContent,
    );
  }
}
