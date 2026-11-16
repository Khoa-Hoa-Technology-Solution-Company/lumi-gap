import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_empty_state.dart';
import 'package:flutter_mobile/core/widgets/app_error_state.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/rankings/data/rankings_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class RankingsScreen extends ConsumerWidget {
  const RankingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rankings = ref.watch(rankingsProvider);
    final me = ref.watch(myRankingProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('Rankings')),
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(rankingsProvider)
              ..invalidate(myRankingProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              me.when(
                data: (data) => data == null
                    ? const SizedBox.shrink()
                    : _MyRankCard(data: data),
                loading: () =>
                    const LumiSkeleton(rows: 1, height: 120),
                error: (error, _) => _InlineError(message: context.t(failureMessageKey(error))),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      context.t('Leaderboard'),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: context.lumi.primarySoft,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      context.t('Top 20'),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.lumi.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              rankings.when(
                data: (data) {
                  if (data.rankings.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 18),
                      child: AppEmptyState(
                        icon: Icons.emoji_events_outlined,
                        title: context.t('No rankings yet'),
                        message: context.t('Scores will appear after research activity.'),
                      ),
                    );
                  }
                  return Column(
                    children: data.rankings
                        .map(
                          (user) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _LeaderboardTile(user: user),
                          ),
                        )
                        .toList(),
                  );
                },
                loading: () =>
                    const LumiSkeleton(rows: 5, height: 80),
                error: (error, _) => AppErrorState(message: context.t(failureMessageKey(error))),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MyRankCard extends StatelessWidget {
  const _MyRankCard({required this.data});

  final MyRanking data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.lumi.primarySoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: context.lumi.primarySoft,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: context.lumi.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.emoji_events, color: context.lumi.onPrimary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.t('Your rank #{{rank}}', {'rank': data.rank}),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _StatPill(label: context.t('{{points}} pts', {'points': data.points})),
                    _StatPill(label: context.plural(data.uploadedPdfs, one: '{{count}} PDF', other: '{{count}} PDFs')),
                    _StatPill(label: context.plural(data.requestedPapers, one: '{{count}} request', other: '{{count}} requests')),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaderboardTile extends StatelessWidget {
  const _LeaderboardTile({required this.user});

  final RankingUser user;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.lumi.surface,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: context.lumi.line,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                // A medal for the top three; the accent pair for the rest.
                color: LumiMedal.forRank(user.rank) ?? context.lumi.primarySoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '#${user.rank}',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: LumiMedal.onRank(user.rank) ?? context.lumi.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.name.isEmpty ? context.t('Unnamed researcher') : user.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (rankingSubtitle(context, user) case final subtitle?) ...[
                    const SizedBox(height: 5),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: context.lumi.foregroundSecondary),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${user.points}',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  context.t('points'),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.lumi.muted,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// "University · Role", leaving out whatever the profile does not have.
/// Null when neither is known, so no empty line or stray dash is shown.
String? rankingSubtitle(BuildContext context, RankingUser user) {
  final university = user.university?.trim() ?? '';
  final role = switch (user.role.trim().toLowerCase()) {
    'student' => context.t('Student'),
    'lecturer' => context.t('Lecturer'),
    'researcher' => context.t('Researcher'),
    _ => '',
  };
  final parts = [university, role].where((p) => p.isNotEmpty).toList();
  return parts.isEmpty ? null : parts.join(' · ');
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: context.lumi.surface,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: context.lumi.primarySoft,
        ),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: TextStyle(color: Theme.of(context).colorScheme.error),
    );
  }
}

/// Medal colour for the top three, the accent for everyone else.
