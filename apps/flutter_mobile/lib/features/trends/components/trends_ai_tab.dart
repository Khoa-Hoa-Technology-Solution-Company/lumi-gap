import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final FutureProvider<List<TrendExplanationHistoryItem>> explainHistoryProvider =
    FutureProvider.autoDispose<List<TrendExplanationHistoryItem>>((ref) {
      return ref.watch(trendsApiProvider).explainHistory();
    });

class TrendsAiTab extends ConsumerStatefulWidget {
  const TrendsAiTab({
    required this.overview,
    required this.params,
    this.initialTopic,
    super.key,
  });

  final TrendsOverview overview;
  final TrendsOverviewParams params;
  final String? initialTopic;

  @override
  ConsumerState<TrendsAiTab> createState() => _TrendsAiTabState();
}

class _TrendsAiTabState extends ConsumerState<TrendsAiTab> {
  String? _selectedTopic;
  ReportLanguage _language = ReportLanguage.auto;
  bool _loading = false;

  TrendExplanationResponse? _explanation;

  @override
  void initState() {
    super.initState();
    _selectedTopic = widget.initialTopic;
    if (_selectedTopic == null && widget.overview.topics.isNotEmpty) {
      _selectedTopic = widget.overview.topics[0].topic;
    }
  }

  @override
  void didUpdateWidget(covariant TrendsAiTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTopic != null &&
        widget.initialTopic != oldWidget.initialTopic) {
      setState(() {
        _selectedTopic = widget.initialTopic;
      });
    }
  }

  Future<void> _explain() async {
    if (_selectedTopic == null) return;
    setState(() {
      _loading = true;
      _explanation = null;
    });

    try {
      final res = await ref
          .read(trendsApiProvider)
          .explain(
            topic: _selectedTopic,
            yearFrom: widget.params.yearFrom,
            yearTo: widget.params.yearTo,
            language: _language == ReportLanguage.auto
                ? 'en'
                : _language.wireValue,
            scopeFilters: widget.params.scopeFilters,
          );
      setState(() {
        _explanation = res;
      });
      ref.invalidate(explainHistoryProvider);
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('AI Explanation failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _buildListSection(
    String title,
    List<String> items,
    IconData icon,
    Color color,
  ) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(width: 8),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 6, left: 24),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                Expanded(
                  child: Text(
                    item,
                    style: const TextStyle(fontSize: 12, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildMetricTrace(
    List<TrendMetricTrace> traces,
    bool isDark,
    ThemeData theme,
  ) {
    if (traces.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.query_stats, color: Color(0xFF06B6D4), size: 16),
            SizedBox(width: 8),
            Text(
              'Metric Trace Evidence',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...traces.map((trace) {
          final cardBg = isDark ? const Color(0xFF1E293B) : Colors.white;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: cardBg,
              border: Border.all(
                color: isDark
                    ? const Color(0xFF334155)
                    : const Color(0xFFE2E8F0),
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      trace.label.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    Text(
                      trace.value,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF06B6D4),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  trace.explanation,
                  style: const TextStyle(fontSize: 11, height: 1.3),
                ),
                const SizedBox(height: 2),
                Text(
                  'Source: ${trace.source}',
                  style: const TextStyle(
                    fontSize: 9,
                    color: Color(0xFF64748B),
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildHistoryList(bool isDark, ThemeData theme) {
    final historyQuery = ref.watch(explainHistoryProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 32),
        const Text(
          'Saved Explanation History',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 10),
        historyQuery.when(
          data: (items) {
            if (items.isEmpty) {
              return const Text(
                'No history saved yet.',
                style: TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: Color(0xFF94A3B8),
                ),
              );
            }
            return ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, idx) {
                final item = items[idx];
                final cardBg = isDark
                    ? const Color(0xFF1E293B)
                    : theme.cardColor;

                return ListTile(
                  tileColor: cardBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: isDark
                          ? const Color(0xFF334155)
                          : const Color(0xFFE2E8F0),
                    ),
                  ),
                  title: Text(
                    item.topic ?? 'Dataset Overview',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  subtitle: Text(
                    'Language: ${item.language.toUpperCase()} · ${item.createdAt}',
                    style: const TextStyle(fontSize: 11),
                  ),
                  trailing: const Icon(
                    Icons.chevron_right,
                    size: 16,
                    color: Color(0xFF06B6D4),
                  ),
                  onTap: () {
                    setState(() {
                      _explanation = item;
                      _selectedTopic = item.topic;
                    });
                  },
                );
              },
            );
          },
          loading: () => const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: CircularProgressIndicator(),
            ),
          ),
          error: (err, _) => Text(
            'Error loading history: $err',
            style: const TextStyle(color: Colors.red),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final topics = widget.overview.topics.map((t) => t.topic).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Explain form card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              border: Border.all(
                color: isDark
                    ? const Color(0xFF334155)
                    : const Color(0xFFE2E8F0),
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Step 1: Select Topic',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _selectedTopic,
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  items: topics.map((t) {
                    return DropdownMenuItem(
                      value: t,
                      child: Text(t, overflow: TextOverflow.ellipsis),
                    );
                  }).toList(),
                  onChanged: _loading
                      ? null
                      : (val) {
                          setState(() {
                            _selectedTopic = val;
                          });
                        },
                ),
                const SizedBox(height: 12),
                const Text(
                  'Step 2: Language',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<ReportLanguage>(
                  initialValue: _language,
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: ReportLanguage.auto,
                      child: Text('Auto-detect'),
                    ),
                    DropdownMenuItem(
                      value: ReportLanguage.en,
                      child: Text('English (en)'),
                    ),
                    DropdownMenuItem(
                      value: ReportLanguage.vi,
                      child: Text('Vietnamese (vi)'),
                    ),
                  ],
                  onChanged: _loading
                      ? null
                      : (val) {
                          if (val != null) {
                            setState(() {
                              _language = val;
                            });
                          }
                        },
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8B5CF6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: _loading || _selectedTopic == null
                        ? null
                        : _explain,
                    icon: const Icon(
                      Icons.auto_awesome,
                      color: Colors.white,
                      size: 18,
                    ),
                    label: const Text(
                      'Explain Trend with AI',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          if (_loading)
            const AppLoading(message: 'Gemini is running trend diagnostics...')
          else if (_explanation != null) ...[
            // Summary Markdown display
            const Row(
              children: [
                Icon(Icons.auto_awesome, color: Color(0xFF8B5CF6), size: 18),
                SizedBox(width: 8),
                Text(
                  'AI Summary Rationale',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF1E293B).withValues(alpha: 0.5)
                    : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark
                      ? const Color(0xFF334155)
                      : const Color(0xFFE2E8F0),
                ),
              ),
              child: MarkdownBody(
                data: _explanation!.summary,
                styleSheet: MarkdownStyleSheet(
                  p: const TextStyle(fontSize: 13, height: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 20),

            _buildListSection(
              'Why it matters',
              _explanation!.whyItMatters,
              Icons.lightbulb_outline,
              const Color(0xFFF59E0B),
            ),
            _buildListSection(
              'Cautions & Limitations',
              _explanation!.cautions,
              Icons.warning_amber_outlined,
              const Color(0xFFEF4444),
            ),
            _buildListSection(
              'Suggested Actions',
              _explanation!.suggestedActions,
              Icons.task_alt_outlined,
              const Color(0xFF10B981),
            ),
            _buildMetricTrace(_explanation!.metricTrace, isDark, theme),

            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF06B6D4),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () {
                      unawaited(
                        context.push(
                          '/search?q=${Uri.encodeComponent(_selectedTopic ?? "")}',
                        ),
                      );
                    },
                    icon: const Icon(
                      Icons.search,
                      size: 16,
                      color: Colors.white,
                    ),
                    label: const Text(
                      'Search Papers',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8B5CF6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () {
                      unawaited(
                        context.push(
                          '/reports?create=true&topic=${Uri.encodeComponent(_selectedTopic ?? "")}',
                        ),
                      );
                    },
                    icon: const Icon(
                      Icons.description,
                      size: 16,
                      color: Colors.white,
                    ),
                    label: const Text(
                      'Generate Report',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onPressed: () {
                  final text =
                      'Topic: $_selectedTopic\n\nSummary:\n${_explanation!.summary}';
                  unawaited(
                    Clipboard.setData(ClipboardData(text: text)).then((_) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Explanation copied to clipboard'),
                        ),
                      );
                    }),
                  );
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text(
                  'Copy Explanation Text',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          _buildHistoryList(isDark, theme),
        ],
      ),
    );
  }
}
