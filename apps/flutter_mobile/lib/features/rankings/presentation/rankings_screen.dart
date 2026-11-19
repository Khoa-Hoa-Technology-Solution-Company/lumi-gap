import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/auth/providers/auth_controller.dart';
import 'package:flutter_mobile/features/rankings/data/rankings_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The points the rank is computed from (`users.points`), for the user at
/// [rank]. `/auth/rankings/me` ranks by those points but sends a separately
/// recomputed `stats.points`; showing that next to the rank contradicted
/// the list. The user's own row in the list wins (it is fresh); otherwise
/// the signed-in profile's points.
int rankPoints({
  required int rank,
  required String? name,
  required List<RankingUser> list,
  required int profilePoints,
}) {
  for (final u in list) {
    if (u.rank == rank && u.name.trim() == (name ?? '').trim()) return u.points;
  }
  return profilePoints;
}

class RankingsScreen extends ConsumerWidget {
  const RankingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rankings = ref.watch(rankingsProvider);
    final me = ref.watch(myRankingProvider);
    final user = ref.watch(currentUserProvider);

    final Widget mine;
    if (me.hasValue) {
      final data = me.requireValue;
      mine = data == null
          // Admins are not ranked.
          ? const SizedBox.shrink()
          : _MyRank(
              data: data,
              points: rankPoints(
                rank: data.rank,
                name: user?.fullName,
                list: rankings.value?.rankings ?? const [],
                profilePoints: user?.points ?? 0,
              ),
            );
    } else if (me.hasError) {
      mine = LumiErrorState(
        message: context.t(failureMessageKey(me.error!)),
        retrying: me.isLoading,
        onRetry: () => ref.invalidate(myRankingProvider),
        inline: true,
      );
    } else {
      mine = const LumiSkeleton(height: 120);
    }

    final Widget list;
    if (rankings.hasValue) {
      final rows = rankings.requireValue.rankings;
      list = rows.isEmpty
          ? LumiEmptyState(
              icon: Icons.emoji_events_outlined,
              title: context.t('No rankings yet'),
              message: context.t('Scores will appear after research activity.'),
              compact: true,
            )
          : LumiRowGroup(
              children: [for (final u in rows) _RankRow(user: u)],
            );
    } else if (rankings.hasError) {
      list = LumiErrorState(
        message: context.t(failureMessageKey(rankings.error!)),
        retrying: rankings.isLoading,
        onRetry: () => ref.invalidate(rankingsProvider),
        inline: true,
      );
    } else {
      list = const LumiSkeleton(rows: 5, height: 64);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Rankings'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(rankingsProvider)
            ..invalidate(myRankingProvider);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            mine,
            const SizedBox(height: 24),
            LumiSectionHeader(
              title: context.t('Top ranked'),
              caption: context.t('Top 20'),
            ),
            list,
          ],
        ),
      ),
    );
  }
}

class _MyRank extends StatelessWidget {
  const _MyRank({required this.data, required this.points});

  final MyRanking data;
  final int points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;

    Widget figure(String value, String label) => Expanded(
          child: MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  label,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ],
            ),
          ),
        );

    return LumiCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Your rank'),
            style: theme.textTheme.titleSmall
                ?.copyWith(color: lumi.foregroundSecondary),
          ),
          Text(
            '#${data.rank}',
            style: theme.textTheme.displaySmall?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              figure(formatNumber(points), context.t('points')),
              figure('${data.uploadedPdfs}', context.t('PDFs')),
              figure('${data.requestedPapers}', context.t('requests')),
            ],
          ),
        ],
      ),
    );
  }
}

class _RankRow extends StatelessWidget {
  const _RankRow({required this.user});

  final RankingUser user;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final subtitle = rankingSubtitle(context, user);
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: LumiMedal.forRank(user.rank) ?? lumi.surfaceMuted,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '#${user.rank}',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: LumiMedal.onRank(user.rank) ?? lumi.foregroundSecondary,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    // A profile without a name is never shown as a blank row.
                    user.name.trim().isEmpty
                        ? context.t('Unnamed researcher')
                        : user.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: lumi.foregroundSecondary),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              context.plural(
                user.points,
                one: '{{count}} pt',
                other: '{{count}} pts',
                args: {'count': formatNumber(user.points)},
              ),
              style: theme.textTheme.titleSmall?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
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
