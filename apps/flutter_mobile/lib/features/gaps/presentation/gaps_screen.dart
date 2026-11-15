import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_analysis_overlay.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_card.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_detail_sheet.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Topic bounds of the gap analysis API (`gaps.schema.ts`).
const int gapTopicMin = 3;
const int gapTopicMax = 200;

/// Error key for a topic to analyse, or null when it can be sent.
String? gapTopicError(String raw) {
  final text = raw.trim();
  if (text.length < gapTopicMin) {
    return tk('Topic must be at least 3 characters long.');
  }
  if (text.length > gapTopicMax) return tk('Use at most 200 characters.');
  return null;
}

/// Server-side orders, the same as the web list.
final List<(String, String)> gapSorts = [
  ('newest', tk('Newest Opportunities First')),
  ('recommended', tk('Recommended (evidence + confidence)')),
  ('evidence', tk('Most Evidence-backed')),
  ('confidence', tk('Highest Confidence')),
  ('papers', tk('Most Supporting Papers')),
  ('ai_only_last', tk('AI-only Last')),
];

class GapsScreen extends ConsumerStatefulWidget {
  const GapsScreen({super.key, this.initialTopic});

  final String? initialTopic;

  @override
  ConsumerState<GapsScreen> createState() => _GapsScreenState();
}

class _GapsScreenState extends ConsumerState<GapsScreen> {
  final _topic = TextEditingController();
  late final _searchField =
      TextEditingController(text: widget.initialTopic ?? '');

  /// The search actually sent: the field settles for 350ms first, so
  /// typing does not fire a request per key.
  late String _search = widget.initialTopic ?? '';
  Timer? _searchDebounce;

  String _status = 'active';
  double? _minConfidence;
  String _sortBy = 'newest';

  bool _analyzing = false;
  bool _showTopicError = false;
  String? _analysisId;
  Timer? _pollTimer;
  bool _disposed = false;

  /// Gaps whose status change is in flight.
  final Set<String> _busy = {};

  GapsListParams get _params => GapsListParams(
        search: _search,
        status: _status,
        minConfidence: _minConfidence,
        sortBy: _sortBy,
      );

  @override
  void dispose() {
    _disposed = true;
    _topic.dispose();
    _searchField.dispose();
    _searchDebounce?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted && value.trim() != _search.trim()) {
        setState(() => _search = value.trim());
      }
    });
  }

  void _showError(Object e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.t(failureMessageKey(e))),
        backgroundColor: context.lumi.error,
      ),
    );
  }

  Future<void> _analyze() async {
    if (_analyzing) return;
    if (gapTopicError(_topic.text) != null) {
      setState(() => _showTopicError = true);
      return;
    }
    setState(() => _analyzing = true);
    try {
      final id = await ref.read(gapsApiProvider).analyze(_topic.text.trim());
      // Never start polling for a screen that is already gone.
      if (_disposed || !mounted) return;
      _topic.clear();
      setState(() {
        _showTopicError = false;
        _analysisId = id;
      });
      _pollTimer?.cancel();
      _pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => ref.invalidate(gapStatusProvider(id)),
      );
    } on Object catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  void _closeAnalysis({required bool ready}) {
    _pollTimer?.cancel();
    _pollTimer = null;
    setState(() => _analysisId = null);
    // The finished job added gaps: show them.
    if (ready) ref.invalidate(gapsProvider);
  }

  Future<void> _changeStatus(String id, String status) async {
    if (!_busy.add(id)) return;
    setState(() {});
    try {
      await ref.read(gapsApiProvider).patchStatus(id, status);
    } on Object catch (e) {
      _showError(e);
    } finally {
      _busy.remove(id);
      if (mounted) {
        setState(() {});
        // Every list, not just this filter: the gap moved between tabs.
        ref.invalidate(gapsProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final gaps = ref.watch(gapsProvider(_params));
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final topicError = _showTopicError ? gapTopicError(_topic.text) : null;

    final Widget list;
    if (gaps.hasValue) {
      final data = gaps.requireValue;
      list = data.data.isEmpty
          ? LumiEmptyState(
              icon: Icons.lightbulb_outline,
              title: context.t('No research gaps found'),
              message: context.t('Try another filter or submit a topic.'),
              compact: true,
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final gap in data.data)
                  GapCard(
                    gap: gap,
                    busy: _busy.contains(gap.id),
                    onOpen: () => unawaited(
                      showGapDetailSheet(
                        context,
                        gap: gap,
                        onStatusChange: (s) =>
                            unawaited(_changeStatus(gap.id, s)),
                      ),
                    ),
                    onStatusChange: (s) => unawaited(_changeStatus(gap.id, s)),
                  ),
                Text(
                  context.plural(
                    data.total,
                    one: '{{count}} research gap found',
                    other: '{{count}} research gaps found',
                  ),
                  textAlign: TextAlign.end,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
              ],
            );
    } else if (gaps.hasError) {
      list = LumiErrorState(
        message: context.t(failureMessageKey(gaps.error!)),
        retrying: gaps.isLoading,
        onRetry: () => ref.invalidate(gapsProvider(_params)),
        inline: true,
      );
    } else {
      list = const LumiSkeleton(rows: 3, height: 120);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Research Gaps'))),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: () async => ref.invalidate(gapsProvider(_params)),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  context.t(
                    'Find opportunities and research gaps recommended by Gemini.',
                  ),
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: lumi.foregroundSecondary),
                ),
                const SizedBox(height: 16),
                LumiCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      LumiTextField(
                        label: context.t('Analyze new research topic'),
                        controller: _topic,
                        enabled: !_analyzing,
                        maxLength: gapTopicMax,
                        textInputAction: TextInputAction.send,
                        errorText:
                            topicError == null ? null : context.t(topicError),
                        onChanged: (_) {
                          if (_showTopicError) setState(() {});
                        },
                        onFieldSubmitted: (_) => unawaited(_analyze()),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed:
                            _analyzing ? null : () => unawaited(_analyze()),
                        child: _analyzing
                            ? SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: lumi.onPrimary,
                                ),
                              )
                            : Text(context.t('Analyze')),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(
                      value: 'active',
                      label: Text(context.t('Active')),
                    ),
                    ButtonSegment(
                      value: 'resolved',
                      label: Text(context.t('Resolved')),
                    ),
                    ButtonSegment(
                      value: 'dismissed',
                      label: Text(context.t('Dismissed')),
                    ),
                  ],
                  selected: {_status},
                  onSelectionChanged: (s) =>
                      setState(() => _status = s.single),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchField,
                  maxLength: 200,
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: context.t('Filter gaps by topic name...'),
                    prefixIcon: const Icon(Icons.search, size: 20),
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: _sortBy,
                  decoration:
                      InputDecoration(labelText: context.t('Sort by')),
                  items: [
                    for (final (value, label) in gapSorts)
                      DropdownMenuItem(
                        value: value,
                        child: Text(context.t(label)),
                      ),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _sortBy = v);
                  },
                ),
                const SizedBox(height: 12),
                Text(
                  context.t('Minimum confidence'),
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                SegmentedButton<double>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: 0, label: Text(context.t('All'))),
                    ButtonSegment(
                      value: 0.4,
                      label: Text(context.t('Medium (≥40%)')),
                    ),
                    ButtonSegment(
                      value: 0.7,
                      label: Text(context.t('High (≥70%)')),
                    ),
                  ],
                  selected: {_minConfidence ?? 0},
                  onSelectionChanged: (s) => setState(
                    () => _minConfidence = s.single == 0 ? null : s.single,
                  ),
                ),
                const SizedBox(height: 16),
                list,
              ],
            ),
          ),
          if (_analysisId != null)
            Positioned.fill(
              child: GapAnalysisOverlay(
                id: _analysisId!,
                onClose: _closeAnalysis,
              ),
            ),
        ],
      ),
    );
  }
}
