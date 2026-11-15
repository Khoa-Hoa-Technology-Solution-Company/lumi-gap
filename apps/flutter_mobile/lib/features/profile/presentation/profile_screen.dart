import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/i18n/locale_provider.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/theme/theme_provider.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_chip.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/features/auth/data/auth_models.dart';
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

/// What the person does academically, as chosen in their academic profile.
/// Null when they have not chosen yet: nothing is shown rather than a guess.
String? academicProfileLabel(AcademicProfileType? type) => switch (type) {
      AcademicProfileType.student => tk('Student'),
      AcademicProfileType.researcher => tk('Researcher'),
      AcademicProfileType.lecturer => tk('Lecturer'),
      null => null,
    };

/// Platform roles worth telling the person about. An ordinary account
/// (`user`, or the legacy student / lecturer / researcher values) gets no
/// chip: the academic profile already says what they are.
String? staffRoleLabel(UserRole? role) => switch (role) {
      UserRole.admin => tk('Admin'),
      UserRole.moderator => tk('Moderator'),
      UserRole.reviewer => tk('Reviewer'),
      _ => null,
    };

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  /// True from the tap on "Sign out" until the dialog is answered and the
  /// request has finished, so a second tap cannot open a second dialog or
  /// sign out twice.
  bool _signingOut = false;

  Future<void> _handleLogout() async {
    if (_signingOut) return;
    setState(() => _signingOut = true);
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(context.t('Sign out')),
          content: Text(context.t('Do you want to sign out of LumiGap?')),
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
      if (confirmed ?? false) {
        await ref.read(authControllerProvider.notifier).logout();
      }
    } finally {
      // After a real sign-out the router has replaced this screen.
      if (mounted) setState(() => _signingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final user = authState.value;
    final bookmarks = ref.watch(bookmarksProvider).value ?? [];
    final reports =
        ref.watch(reportsProvider(const ReportsParams())).value?.total ?? 0;

    final paperBookmarks =
        bookmarks.where((b) => b.targetKind == 'paper').toList();
    final topicCount = paperBookmarks
        .expand(
          (bookmark) => bookmark.paperDetail?.topics ?? const <PaperTopic>[],
        )
        .map((topic) => topic.topicName)
        .toSet()
        .length;

    final theme = Theme.of(context);
    final lumi = context.lumi;

    final levelAsset =
        LevelHelper.getLevelAsset(LevelHelper.getLevel(user?.points ?? 0));
    final currentThemeMode = ref.watch(themeModeProvider);
    final languageChoice = ref.watch(localeChoiceProvider);

    final academicKey = academicProfileLabel(user?.academicProfileType);
    final staffKey = staffRoleLabel(user?.role);
    final institution = user?.institution?.trim();
    final fullName = user?.fullName.trim();
    final email = user?.email;
    // Never invent a name: fall back to the email, which is always real.
    final displayName =
        (fullName != null && fullName.isNotEmpty) ? fullName : (email ?? '');

    Widget groupLabel(String text) => Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Semantics(
            header: true,
            child: Text(
              text,
              style: theme.textTheme.titleSmall
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ),
        );

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Profile')),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            LumiCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Rank badge earned from contribution points.
                  ExcludeSemantics(
                    child: Container(
                      width: 72,
                      height: 72,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: lumi.primarySoft,
                        shape: BoxShape.circle,
                      ),
                      child: Image.asset(levelAsset, fit: BoxFit.contain),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName,
                          style: theme.textTheme.titleLarge,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (email != null && email != displayName)
                          Text(
                            email,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: lumi.foregroundSecondary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        if (academicKey != null || staffKey != null) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (academicKey != null)
                                LumiChip(
                                  label: context.t(academicKey),
                                  tone: LumiChipTone.primary,
                                ),
                              if (staffKey != null)
                                LumiChip(label: context.t(staffKey)),
                            ],
                          ),
                        ],
                        if (institution != null && institution.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(
                                Icons.school_outlined,
                                size: 16,
                                color: lumi.foregroundSecondary,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  institution,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: lumi.foregroundSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            const EmailVerificationBanner(),
            const SizedBox(height: 12),

            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _StatCard(
                    label: context.t('Bookmarks'),
                    value: paperBookmarks.length,
                    onTap: () => unawaited(context.push('/bookmarks')),
                  ),
                  const SizedBox(width: 12),
                  _StatCard(label: context.t('Topics'), value: topicCount),
                  const SizedBox(width: 12),
                  _StatCard(
                    label: context.t('Reports'),
                    value: reports,
                    onTap: () => unawaited(context.push('/reports')),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            groupLabel(context.t('Activity')),
            LumiRowGroup(
              children: [
                LumiListRow(
                  icon: Icons.cloud_upload_outlined,
                  title: context.t('Submit paper'),
                  onTap: () => unawaited(context.push('/submit-paper')),
                ),
                LumiListRow(
                  icon: Icons.description_outlined,
                  title: context.t('My papers'),
                  onTap: () => unawaited(context.push('/my-papers')),
                ),
                LumiListRow(
                  icon: Icons.bookmark_border,
                  title: context.t('Bookmarks'),
                  onTap: () => unawaited(context.push('/bookmarks')),
                ),
                LumiListRow(
                  icon: Icons.emoji_events_outlined,
                  title: context.t('Leaderboard'),
                  onTap: () => unawaited(context.push('/rankings')),
                ),
                if (user?.role == UserRole.admin)
                  LumiListRow(
                    icon: Icons.sync,
                    title: context.t('Admin sync'),
                    onTap: () => unawaited(context.push('/admin/sync')),
                  ),
              ],
            ),
            const SizedBox(height: 24),

            groupLabel(context.t('Settings')),
            LumiRowGroup(
              children: [
                LumiListRow(
                  icon: themeModeIcon(currentThemeMode),
                  title: context.t('Appearance'),
                  value: context.t(themeModeLabel(currentThemeMode)),
                  onTap: () => unawaited(showThemeModeSheet(context)),
                ),
                LumiListRow(
                  icon: Icons.language,
                  title: context.t('Language'),
                  value: languageChoiceLabel(context, languageChoice),
                  onTap: () => unawaited(showLanguageSheet(context)),
                ),
              ],
            ),
            const SizedBox(height: 24),

            LumiRowGroup(
              children: [
                LumiListRow(
                  icon: Icons.logout,
                  title: context.t('Sign out'),
                  destructive: true,
                  showChevron: false,
                  onTap: (authState.isLoading || _signingOut)
                      ? null
                      : () => unawaited(_handleLogout()),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, this.onTap});

  final String label;
  final int value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    return Expanded(
      child: Semantics(
        button: onTap != null,
        child: LumiCard(
          onTap: onTap,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('$value', style: theme.textTheme.titleLarge),
                const SizedBox(height: 4),
                // One word per label: on a narrow screen with large text it
                // shrinks to fit instead of breaking mid-word ("Bookmark/s").
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: lumi.foregroundSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
