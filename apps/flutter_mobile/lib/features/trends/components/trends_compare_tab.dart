import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
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

  final List<Color> _lineColors = [
    const Color(0xFF1D4ED8),
    const Color(0xFF10B981),
    const Color(0xFF8B5CF6),
    const Color(0xFFF59E0B),
    const Color(0xFFEC4899),
  ];

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
        const Text(
          'Recommended Comparisons',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8)),
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
              final cardBg = isDark ? const Color(0xFF1E293B) : theme.cardColor;
              final borderColor = isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

              return Container(
                width: 250,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cardBg,
                  border: Border.all(color: borderColor),
                  borderRadius: BorderRadius.circular(16),
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
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            rec.reason,
                            style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
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
                          backgroundColor: const Color(0xFF06B6D4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        onPressed: () => _useComparison(rec.topics),
                        child: const Text('Compare', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
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
        color: isDark ? const Color(0xFF1E293B).withValues(alpha: 0.4) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('SELECTED TOPICS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8))),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _selectedTopics.map((topic) {
              final idx = _selectedTopics.indexOf(topic);
              final color = _lineColors[idx % _lineColors.length];

              return Chip(
                avatar: CircleAvatar(backgroundColor: color, radius: 4),
                label: Text(topic, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
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
            hintText: 'Search topics in current scope...',
            prefixIcon: const Icon(Icons.search, size: 16),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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

                    return ChoiceChip(
                      label: Text(t.topic, style: const TextStyle(fontSize: 11)),
                      selected: isSelected,
                      selectedColor: const Color(0xFF06B6D4),
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            if (_selectedTopics.length < 5) {
                              _selectedTopics.add(t.topic);
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Compare up to 5 topics at once to keep the chart readable.')),
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
      explanation = 'What this shows: Shows how many papers were published each year. Use this to compare research activity.';
    } else if (_metricMode == 'citations') {
      explanation = 'What this shows: Shows accumulated citation volume. Older topics may look stronger because they had more time to collect citations.';
    } else {
      explanation = 'What this shows: Normalizes citation impact per paper. Useful when one topic has much larger volume.';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Multi-Topic Trend Chart', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
            DropdownButton<String>(
              value: _metricMode,
              items: const [
                DropdownMenuItem(value: 'papers', child: Text('Papers / year')),
                DropdownMenuItem(value: 'citations', child: Text('Total Citations')),
                DropdownMenuItem(value: 'avg_citations', child: Text('Avg Citations')),
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
        Text(explanation, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic)),
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
                    getTitlesWidget: (val, _) => Text(formatCompact(val), style: const TextStyle(fontSize: 9)),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, _) => Text(val.toInt().toString(), style: const TextStyle(fontSize: 9)),
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
            color: isDark ? const Color(0xFF1E293B) : theme.cardColor,
            border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(backgroundColor: color, radius: 5),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(t.topic.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
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
                      const Text('Total Papers', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                      Text(formatNumber(t.totalPapers), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Momentum', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                      Text(formatSigned(t.momentum), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('YoY Growth', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                      Text('${t.growthRatePct.toStringAsFixed(1)}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
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
                    icon: const Icon(Icons.search, size: 14, color: Color(0xFF06B6D4)),
                    label: const Text('Search Papers', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4))),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: () => widget.onExplainTopic(t.topic),
                    icon: const Icon(Icons.auto_awesome, size: 14, color: Color(0xFF8B5CF6)),
                    label: const Text('AI Explain', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF8B5CF6))),
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
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Text('Select at least 2 topics above to load trend comparisons.', style: TextStyle(fontStyle: FontStyle.italic, color: Color(0xFF94A3B8))),
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
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 36),
                  child: CircularProgressIndicator(color: Color(0xFF06B6D4)),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: Text('Compare failed: $err', style: const TextStyle(color: Colors.red)),
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
