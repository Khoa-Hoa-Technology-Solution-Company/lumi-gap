import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_chart.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
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
  String _metricMode = 'papers'; // 'papers', 'citations', 'avg_citations'
  String _searchTerm = '';

  /// One colour per compared topic, the web chart palette.
  static const List<Color> _lineColors = LumiChart.series;

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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.t('Recommended Comparisons'),
          style: context.type.bodyMedium!.copyWith(fontWeight: FontWeight.w600, color: context.lumi.muted),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 140,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: recs.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, idx) {
              final rec = recs[idx];
              final cardBg = context.lumi.surface;
              final borderColor = context.lumi.line;

              return Container(
                width: 250,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cardBg,
                  border: Border.all(color: borderColor),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rec.topics.join(' vs '),
                            style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            rec.reason,
                            style: context.type.bodySmall!.copyWith(color: context.lumi.muted),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      height: 28,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.lumi.primary,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        onPressed: () => _useComparison(rec.topics),
                        child: Text(context.t('Compare'), style: context.type.bodySmall!.copyWith(color: context.lumi.onPrimary, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
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
          Text(context.t('SELECTED TOPICS'), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600, color: context.lumi.muted)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _selectedTopics.map((topic) {
              final idx = _selectedTopics.indexOf(topic);
              final color = _lineColors[idx % _lineColors.length];

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
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onChanged: (val) {
            setState(() {
              _searchTerm = val;
            });
          },
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 38,
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

  Widget _buildMultiLineChart(TrendCompareResponse res) {
    if (res.topics.isEmpty) return const SizedBox.shrink();

    final yearFrom = res.yearFrom ?? 2020;
    final yearTo = res.yearTo ?? 2026;

    final lineBars = res.topics.asMap().entries.map((e) {
      final topicIndex = e.key;
      final t = e.value;
      final color = _lineColors[topicIndex % _lineColors.length];

      final spots = <FlSpot>[];
      for (var y = yearFrom; y <= yearTo; y++) {
        final papersEntry = t.yearlyBreakdown.firstWhere((p) => p.year == y, orElse: () => YearlyCount(year: y, count: 0));
        final citationsEntry = t.citationTrend.firstWhere((c) => c.year == y, orElse: () => YearlyCitationMetric(year: y, count: 0, totalCitations: 0, avgCitations: 0));

        var val = 0.0;
        if (_metricMode == 'papers') {
          val = papersEntry.count.toDouble();
        } else if (_metricMode == 'citations') {
          val = citationsEntry.totalCitations.toDouble();
        } else if (_metricMode == 'avg_citations') {
          val = citationsEntry.avgCitations;
        }

        spots.add(FlSpot(y.toDouble(), val));
      }

      return LineChartBarData(
        spots: spots,
        isCurved: true,
        color: color,
        barWidth: 3,
      );
    }).toList();

    var explanation = '';
    if (_metricMode == 'papers') {
      explanation = context.t('What this shows: Shows how many papers were published each year. Use this to compare research activity.');
    } else if (_metricMode == 'citations') {
      explanation = context.t('What this shows: Shows accumulated citation volume. Older topics may look stronger because they had more time to collect citations.');
    } else {
      explanation = context.t('What this shows: Normalizes citation impact per paper. Useful when one topic has much larger volume.');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                context.t('Multi-Topic Trend Chart'),
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            DropdownButton<String>(
              value: _metricMode,
              items: [
                DropdownMenuItem(value: 'papers', child: Text(context.t('Papers / year'))),
                DropdownMenuItem(value: 'citations', child: Text(context.t('Total Citations'))),
                DropdownMenuItem(value: 'avg_citations', child: Text(context.t('Avg Citations'))),
              ],
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    _metricMode = val;
                  });
                }
              },
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(explanation, style: context.type.bodySmall!.copyWith(color: context.lumi.muted, fontStyle: FontStyle.italic)),
        const SizedBox(height: 16),
        SizedBox(
          height: 180,
          child: LineChart(
            LineChartData(
              gridData: const FlGridData(show: false),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 36,
                    getTitlesWidget: (val, _) => Text(formatCompact(val), style: context.type.bodySmall),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    // One label per year: without an interval fl_chart also
                    // labels the half-years, and each year showed twice.
                    interval: 1,
                    reservedSize: 28,
                    getTitlesWidget: (val, meta) => val == val.roundToDouble()
                        ? SideTitleWidget(
                            meta: meta,
                            child: Text(
                              val.toInt().toString(),
                              style: context.type.bodySmall,
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ),
                rightTitles: const AxisTitles(),
                topTitles: const AxisTitles(),
              ),
              borderData: FlBorderData(show: false),
              lineBarsData: lineBars,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildComparisonCards(TrendCompareResponse res, bool isDark, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: res.topics.map((t) {
        final idx = res.topics.indexOf(t);
        final color = _lineColors[idx % _lineColors.length];

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.lumi.surface,
            border: Border.all(color: context.lumi.line),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(backgroundColor: color, radius: 5),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(t.topic, style: Theme.of(context).textTheme.titleMedium),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.t('Total Papers'), style: context.type.bodySmall!.copyWith(color: context.lumi.muted)),
                      Text(formatNumber(t.totalPapers), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.t('Momentum'), style: context.type.bodySmall!.copyWith(color: context.lumi.muted)),
                      Text(formatSigned(t.momentum), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.t('YoY Growth'), style: context.type.bodySmall!.copyWith(color: context.lumi.muted)),
                      Text('${t.growthRatePct.toStringAsFixed(1)}%', style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ],
              ),
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () => context.push(_scopedSearchPath(t.topic)),
                    icon: Icon(Icons.search, size: 14, color: context.lumi.primary),
                    label: Text(context.t('Search Papers'), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600, color: context.lumi.primary)),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: () => widget.onExplainTopic(t.topic),
                    icon: Icon(Icons.summarize_outlined, size: 14, color: context.lumi.primary),
                    label: Text(context.t('AI Explain'), style: context.type.bodySmall!.copyWith(fontWeight: FontWeight.w600, color: context.lumi.primary)),
                  ),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
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
            compareQuery.when(
              data: (res) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildMultiLineChart(res),
                  const SizedBox(height: 24),
                  _buildComparisonCards(res, isDark, theme),
                ],
              ),
              loading: () => Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: CircularProgressIndicator(color: context.lumi.primary),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: Text(context.t('Compare failed: {{err}}', {'err': err}), style: TextStyle(color: context.lumi.error)),
                ),
              ),
            ),
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
