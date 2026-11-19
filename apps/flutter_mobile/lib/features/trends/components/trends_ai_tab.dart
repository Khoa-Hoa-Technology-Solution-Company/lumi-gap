import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/app_loading.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/features/trends/components/trend_explain_history.dart';
import 'package:flutter_mobile/features/trends/components/trend_explanation_view.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

export 'package:flutter_mobile/features/trends/components/trend_explain_history.dart'
    show explainHistoryProvider;

/// Explain: ask the AI why a topic moves, in English or Vietnamese, and see
/// earlier answers again.
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
  String? _topic;

  /// The API writes English or Vietnamese only. Null until first build,
  /// where it takes the language the app is shown in.
  String? _language;
  bool _loading = false;
  TrendExplanationResponse? _explanation;

  @override
  void initState() {
    super.initState();
    _topic = widget.initialTopic ??
        (widget.overview.topics.isEmpty
            ? null
            : widget.overview.topics.first.topic);
  }

  @override
  void didUpdateWidget(covariant TrendsAiTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTopic != null &&
        widget.initialTopic != oldWidget.initialTopic) {
      setState(() => _topic = widget.initialTopic);
    }
  }

  Future<void> _explain(String language) async {
    final topic = _topic;
    if (topic == null || _loading) return;
    setState(() {
      _loading = true;
      _explanation = null;
    });
    try {
      final res = await ref.read(trendsApiProvider).explain(
            topic: topic,
            yearFrom: widget.params.yearFrom,
            yearTo: widget.params.yearTo,
            language: language,
            scopeFilters: widget.params.scopeFilters,
          );
      if (!mounted) return;
      setState(() => _explanation = res);
      ref.invalidate(explainHistoryProvider);
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t(failureMessageKey(e))),
            backgroundColor: context.lumi.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final language =
        _language ?? (context.appLocale == AppLocale.vi ? 'vi' : 'en');
    // A topic picked from history may not be in this scope's list: it is
    // added, so the picker always shows what is being explained.
    final topics = [
      for (final t in widget.overview.topics) t.topic,
      if (_topic != null &&
          !widget.overview.topics.any((t) => t.topic == _topic))
        _topic!,
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        LumiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                context.t('Topic'),
                style: theme.textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                key: ValueKey(_topic),
                isExpanded: true,
                initialValue: _topic,
                items: [
                  for (final t in topics)
                    DropdownMenuItem(
                      value: t,
                      child: Text(t, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged:
                    _loading ? null : (v) => setState(() => _topic = v),
              ),
              const SizedBox(height: 16),
              Text(
                context.t('Language'),
                style: theme.textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              LumiSegmentedTabs<String>(
                options: [
                  ('en', context.t('English')),
                  ('vi', context.t('Vietnamese')),
                ],
                selected: language,
                enabled: !_loading,
                onChanged: (v) => setState(() => _language = v),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _loading || _topic == null
                    ? null
                    : () => _explain(language),
                icon: const Icon(Icons.summarize_outlined, size: 18),
                label: Text(context.t('Explain Trend with AI')),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        if (_loading)
          AppLoading(message: context.t('Explaining the trend…'))
        else if (_explanation != null) ...[
          TrendExplanationView(explanation: _explanation!, topic: _topic),
          const SizedBox(height: 24),
        ],
        TrendExplainHistory(
          onOpen: (item) => setState(() {
            _explanation = item;
            _topic = item.topic ?? _topic;
          }),
        ),
      ],
    );
  }
}
