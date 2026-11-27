import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';

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
  ('newest', tk('Newest opportunities first')),
  ('recommended', tk('Recommended (evidence + confidence)')),
  ('evidence', tk('Most evidence-backed')),
  ('confidence', tk('Highest confidence')),
  ('papers', tk('Most supporting papers')),
  ('ai_only_last', tk('AI-only last')),
];

const String gapDefaultSort = 'newest';

/// The list's secondary filters, edited as a copy in [showGapFilterSheet].
@immutable
class GapListFilters {
  const GapListFilters({this.sortBy = gapDefaultSort, this.minConfidence});

  final String sortBy;

  /// Null: every confidence.
  final double? minConfidence;

  /// How many differ from the default: the badge on the Filters button.
  int get activeCount =>
      (sortBy != gapDefaultSort ? 1 : 0) + (minConfidence != null ? 1 : 0);

  @override
  bool operator ==(Object other) =>
      other is GapListFilters &&
      other.sortBy == sortBy &&
      other.minConfidence == minConfidence;

  @override
  int get hashCode => Object.hash(sortBy, minConfidence);
}

/// Sort and minimum confidence. Returns the new filters on "Apply", null
/// when closed another way (nothing changes then).
Future<GapListFilters?> showGapFilterSheet(
  BuildContext context,
  GapListFilters current,
) =>
    showModalBottomSheet<GapListFilters>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FilterSheet(initial: current),
    );

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});

  final GapListFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String _sortBy = widget.initial.sortBy;
  late double _minConfidence = widget.initial.minConfidence ?? 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        8,
        20,
        // Above the keyboard when it is open, else above the system bar.
        16 +
            MediaQuery.viewInsetsOf(context).bottom +
            MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.t('Filters'),
                  style: theme.textTheme.titleLarge,
                ),
              ),
              TextButton(
                onPressed: () => setState(() {
                  _sortBy = gapDefaultSort;
                  _minConfidence = 0;
                }),
                child: Text(context.t('Reset')),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _sortBy,
            decoration: InputDecoration(labelText: context.t('Sort by')),
            items: [
              for (final (value, label) in gapSorts)
                DropdownMenuItem(value: value, child: Text(context.t(label))),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _sortBy = v);
            },
          ),
          const SizedBox(height: 20),
          Text(
            context.t('Minimum confidence'),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          LumiSegmentedTabs<double>(
            options: [
              (0, context.t('All')),
              (0.4, context.t('Medium (≥40%)')),
              (0.7, context.t('High (≥70%)')),
            ],
            selected: _minConfidence,
            onChanged: (v) => setState(() => _minConfidence = v),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              GapListFilters(
                sortBy: _sortBy,
                minConfidence: _minConfidence == 0 ? null : _minConfidence,
              ),
            ),
            child: Text(context.t('Apply')),
          ),
        ],
      ),
    );
  }
}

/// Asks for a topic to analyse; refuses one the API would refuse, under the
/// field, without closing. Returns the trimmed topic, or null when closed.
Future<String?> showAnalyzeTopicSheet(BuildContext context) =>
    showModalBottomSheet<String>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AnalyzeSheet(),
    );

class _AnalyzeSheet extends StatefulWidget {
  const _AnalyzeSheet();

  @override
  State<_AnalyzeSheet> createState() => _AnalyzeSheetState();
}

class _AnalyzeSheetState extends State<_AnalyzeSheet> {
  final _topic = TextEditingController();
  bool _showError = false;

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  void _submit() {
    if (gapTopicError(_topic.text) != null) {
      setState(() => _showError = true);
      return;
    }
    Navigator.pop(context, _topic.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final error = _showError ? gapTopicError(_topic.text) : null;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        // Above the keyboard when it is open, else above the system bar.
        16 +
            MediaQuery.viewInsetsOf(context).bottom +
            MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LumiTextField(
            label: context.t('Analyze new research topic'),
            controller: _topic,
            maxLength: gapTopicMax,
            textInputAction: TextInputAction.send,
            errorText: error == null ? null : context.t(error),
            onChanged: (_) {
              if (_showError) setState(() {});
            },
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _submit, child: Text(context.t('Analyze'))),
        ],
      ),
    );
  }
}
