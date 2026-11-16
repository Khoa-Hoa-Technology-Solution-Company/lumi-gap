import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/components/trend_compare_results.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:go_router/go_router.dart';

final FutureProviderFamily<TrendCompareResponse, TrendCompareParams> compareTrendsProvider = FutureProvider.autoDispose.family<TrendCompareResponse, TrendCompareParams>((ref, params) {
  final api = ref.watch(trendsApiProvider);
  return api.compare(
    topics: params.topics,
    yearFrom: params.overviewParams.yearFrom,
    yearTo: params.overviewParams.yearTo,
    scopeFilters: params.overviewParams.scopeFilters,
  );
});

final FutureProviderFamily<TrendTopicCandidatesResponse, TrendTopicCandidateParams> topicCandidatesProvider = FutureProvider.autoDispose.family<TrendTopicCandidatesResponse, TrendTopicCandidateParams>((ref, params) {
  final api = ref.watch(trendsApiProvider);
  return api.topicCandidates(
    q: params.q,
    yearFrom: params.overviewParams.yearFrom,
    yearTo: params.overviewParams.yearTo,
    minPapers: params.overviewParams.minPapers ?? 1,
    scopeFilters: params.overviewParams.scopeFilters,
  );
});

@immutable
class TrendCompareParams {
  const TrendCompareParams({required this.topics, required this.overviewParams});

  final List<String> topics;
  final TrendsOverviewParams overviewParams;

  @override
  bool operator ==(Object other) {
    return other is TrendCompareParams &&
        _stringListEquals(other.topics, topics) &&
        other.overviewParams == overviewParams;
  }

  @override
  int get hashCode => Object.hash(Object.hashAll(topics), overviewParams);
}

@immutable
class TrendTopicCandidateParams {
  const TrendTopicCandidateParams({required this.q, required this.overviewParams});

  final String q;
  final TrendsOverviewParams overviewParams;

  @override
  bool operator ==(Object other) => other is TrendTopicCandidateParams && other.q == q && other.overviewParams == overviewParams;

  @override
  int get hashCode => Object.hash(q, overviewParams);
}

class TrendsCompareTab extends ConsumerStatefulWidget {
  const TrendsCompareTab({
    required this.overview,
    required this.params,
    required this.onExplainTopic,
    super.key,
  });

  final TrendsOverview overview;
  final TrendsOverviewParams params;
  final ValueChanged<String> onExplainTopic;

  @override
  ConsumerState<TrendsCompareTab> createState() => _TrendsCompareTabState();
}

class _TrendsCompareTabState extends ConsumerState<TrendsCompareTab> {
  final List<String> _selectedTopics = [];
  String _searchTerm = '';


  @override
  void initState() {
    super.initState();
    // Default select top 2 topics
    final topics = widget.overview.topics;
    if (topics.length >= 2) {
      _selectedTopics
        ..add(topics[0].topic)
        ..add(topics[1].topic);
    }
  }

  void _useComparison(List<String> topics) {
    setState(() {
      _selectedTopics
        ..clear()
        ..addAll(topics);
    });
  }

  Widget _buildRecommendedSection(bool isDark, ThemeData theme) {
    final recs = widget.overview.recommendedComparisons;
    if (recs.isEmpty) return const SizedBox.shrink();
    final lumi = context.lumi;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        LumiSectionHeader(title: context.t('Recommended Comparisons')),
        // Cards as tall as their text, never clipped at large text sizes.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < recs.length; i++) ...[
                  if (i > 0) const SizedBox(width: 12),
                  SizedBox(
                    width: 260,
                    child: LumiCard(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            recs[i].topics.join(' vs '),
                            style: theme.textTheme.titleSmall,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            recs[i].reason,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: lumi.foregroundSecondary),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Spacer(),
                          Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: TextButton(
                              onPressed: () => _useComparison(recs[i].topics),
                              child: Text(context.t('Compare')),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSelectedWorkbench(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.lumi.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Selected topics'),
            style: Theme.of(context).textTheme.titleSmall
                ?.copyWith(color: context.lumi.foregroundSecondary),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _selectedTopics.map((topic) {
              final idx = _selectedTopics.indexOf(topic);
              final color = LumiChart.seriesAt(idx);

              return Chip(
                avatar: CircleAvatar(backgroundColor: color, radius: 4),
                label: Text(topic, style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600)),
                backgroundColor: context.lumi.surface,
                onDeleted: () {
                  setState(() {
                    _selectedTopics.remove(topic);
                  });
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildCandidateList(bool isDark, ThemeData theme) {
    final list = widget.overview.topics;
    final term = _searchTerm.toLowerCase().trim();
    final candidatesQuery = term.length >= 2
        ? ref.watch(topicCandidatesProvider(TrendTopicCandidateParams(q: term, overviewParams: widget.params)))
        : null;
    final filtered = candidatesQuery == null
        ? list
        : candidatesQuery.maybeWhen(
            data: (data) => data.topics,
            orElse: () => list.where((t) => t.topic.toLowerCase().contains(term)).toList(),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: context.t('Search topics in current scope...'),
            prefixIcon: const Icon(Icons.search, size: 16),
          ),
          onChanged: (val) {
            setState(() {
              _searchTerm = val;
            });
          },
        ),
        const SizedBox(height: 10),
        SizedBox(
          // Room for the chips' 48dp touch target.
          height: 52,
          child: candidatesQuery?.isLoading == true
              ? const Align(alignment: Alignment.centerLeft, child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, idx) {
                    final t = filtered[idx];
                    final isSelected = _selectedTopics.contains(t.topic);

                    // Soft accent when selected: a filled accent chip would
                    // draw its accent-coloured label on itself.
                    return ChoiceChip(
                      label: Text(
                        t.topic,
                        style: context.type.bodySmall!.copyWith(
                          color: isSelected
                              ? context.lumi.primary
                              : context.lumi.foregroundSecondary,
                        ),
                      ),
                      selected: isSelected,
                      selectedColor: context.lumi.primarySoft,
                      checkmarkColor: context.lumi.primary,
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            if (_selectedTopics.length < 5) {
                              _selectedTopics.add(t.topic);
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(context.t('Compare up to 5 topics at once to keep the chart readable.'))),
                              );
                            }
                          } else {
                            _selectedTopics.remove(t.topic);
                          }
                        });
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }

  String _scopedSearchPath(String topic) {
    final params = <String, dynamic>{
      'q': topic,
      ...widget.params.toQuery(),
    };
    return Uri(path: '/search', queryParameters: params.map((key, value) => MapEntry(key, value.toString()))).toString();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final compareQuery = _selectedTopics.length >= 2
        ? ref.watch(compareTrendsProvider(TrendCompareParams(topics: _selectedTopics, overviewParams: widget.params)))
        : null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildRecommendedSection(isDark, theme),
          _buildSelectedWorkbench(isDark),
          const SizedBox(height: 16),
          _buildCandidateList(isDark, theme),
          const SizedBox(height: 20),

          if (_selectedTopics.length < 2)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 36),
                child: Text(context.t('Select at least 2 topics above to load trend comparisons.'), style: TextStyle(fontStyle: FontStyle.italic, color: context.lumi.muted)),
              ),
            )
          else if (compareQuery != null)
            if (compareQuery.hasValue)
              TrendCompareResults(
                result: compareQuery.requireValue,
                classificationOf: (topic) {
                  final name = topic.toLowerCase();
                  for (final t in widget.overview.topics) {
                    if (t.topic.toLowerCase() == name) return t.classification;
                  }
                  return null;
                },
                onSearch: (t) => unawaited(context.push(_scopedSearchPath(t))),
                onExplain: widget.onExplainTopic,
              )
            else if (compareQuery.hasError)
              LumiErrorState(
                message: context.t(failureMessageKey(compareQuery.error!)),
                retrying: compareQuery.isLoading,
                onRetry: () => ref.invalidate(compareTrendsProvider),
                inline: true,
              )
            else
              const LumiSkeleton(height: 160),
        ],
      ),
    );
  }
}

bool _stringListEquals(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i += 1) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
