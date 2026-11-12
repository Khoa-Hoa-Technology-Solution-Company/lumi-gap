import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/i18n/locale_provider.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/bookmarks/data/bookmarks_api.dart';
import 'package:flutter_mobile/features/papers/data/papers_models.dart';
import 'package:flutter_mobile/features/profile/presentation/email_verification_banner.dart';
import 'package:flutter_mobile/features/profile/presentation/language_sheet.dart';
import 'package:flutter_mobile/features/profile/presentation/theme_mode_sheet.dart';
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
        title: Text(context.t('Sign out')),
        content: Text(context.t('Do you want to sign out of Publication Trend?')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.t('Cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: context.lumi.error),
            child: Text(context.t('Sign out')),
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
    final lumi = context.lumi;

    final userPoints = user?.points ?? 0;
    final userLevel = LevelHelper.getLevel(userPoints);
    final levelAsset = LevelHelper.getLevelAsset(userLevel);

    final currentThemeMode = ref.watch(themeModeProvider);
    final languageChoice = ref.watch(localeChoiceProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Profile')),
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
                      color: lumi.surface,
                      shape: BoxShape.circle,
                      border: Border.all(color: lumi.primary, width: 2),
                    ),
                    child: Image.asset(
                      levelAsset,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    user?.fullName ?? context.t('Researcher'),
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: lumi.primarySoft,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      user?.role.name.toUpperCase() ?? 'RESEARCHER',
                      style: theme.textTheme.labelMedium
                          ?.copyWith(color: lumi.primary),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.school, size: 16, color: lumi.foregroundSecondary),
                      const SizedBox(width: 4),
                      Text(
                        user?.institution ?? context.t('FPT University'),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: lumi.foregroundSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            const EmailVerificationBanner(),
            const SizedBox(height: 16),

            // Stats Cards Row
            Row(
              children: [
                _StatCard(label: context.t('Bookmarks'), value: paperBookmarks.length.toString(), theme: theme),
                const SizedBox(width: 12),
                _StatCard(label: context.t('Topics'), value: topicCount.toString(), theme: theme),
                const SizedBox(width: 12),
                _StatCard(label: context.t('Reports'), value: reports.toString(), theme: theme),
              ],
            ),
            const SizedBox(height: 24),

            // Activity section
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text(
                context.t('ACTIVITY'),
                style: theme.textTheme.labelMedium?.copyWith(color: lumi.muted),
              ),
            ),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(color: lumi.line),
              ),
              color: lumi.surface,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  _SettingsRow(
                    icon: Icons.cloud_upload_outlined,
                    label: context.t('Submit Paper'),
                    onTap: () => context.push('/submit-paper'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.description_outlined,
                    label: context.t('My Papers'),
                    onTap: () => context.push('/my-papers'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.folder_outlined,
                    label: context.t('Projects'),
                    onTap: () => context.go('/projects'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.bookmark_border,
                    label: context.t('Bookmarks'),
                    onTap: () => context.push('/bookmarks'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.emoji_events_outlined,
                    label: context.t('Rankings'),
                    onTap: () => context.push('/rankings'),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.notifications_none,
                    label: context.t('Notifications'),
                    onTap: () => context.push('/notifications'),
                    theme: theme,
                  ),
                  if (user?.role.name == 'admin')
                    _SettingsRow(
                      icon: Icons.sync,
                      label: context.t('Admin Sync'),
                      onTap: () => context.push('/admin/sync'),
                      theme: theme,
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Appearance section
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text(
                context.t('APPEARANCE'),
                style: theme.textTheme.labelMedium?.copyWith(color: lumi.muted),
              ),
            ),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(color: lumi.line),
              ),
              color: lumi.surface,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  _SettingsRow(
                    icon: themeModeIcon(currentThemeMode),
                    label: context.t('Appearance'),
                    value: context.t(themeModeLabel(currentThemeMode)),
                    onTap: () => unawaited(showThemeModeSheet(context)),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.language,
                    label: context.t('Language'),
                    value: languageChoiceLabel(context, languageChoice),
                    onTap: () => unawaited(showLanguageSheet(context)),
                    theme: theme,
                  ),
                  _SettingsRow(
                    icon: Icons.text_fields,
                    label: context.t('Font size'),
                    value: context.t('Default'),
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
                foregroundColor: lumi.error,
                side: BorderSide(color: lumi.error),
              ),
              child: Text(context.t('Sign out')),
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
    final lumi = context.lumi;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: lumi.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: lumi.line),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: lumi.foregroundSecondary,
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
    final lumi = context.lumi;
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Icon(
            icon,
            size: 20,
            color: lumi.foregroundSecondary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: theme.textTheme.titleMedium),
          ),
          if (value != null) ...[
            Text(
              value!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: lumi.foregroundSecondary,
              ),
            ),
            const SizedBox(width: 8),
          ],
          if (onTap != null)
            Icon(
              Icons.chevron_right,
              size: 20,
              color: lumi.muted,
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
