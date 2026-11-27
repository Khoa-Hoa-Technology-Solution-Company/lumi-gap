import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/search/domain/search_filters.dart';

/// What the filter sheet hands back on "Apply". `clearedAll` also drops the
/// scope and taxonomy filters carried over from Trends, as "Clear all" says.
typedef SearchFilterResult = ({SearchFilters filters, bool clearedAll});

/// Opens the filter sheet on a copy of [initial]. Null when the reader
/// closes it without applying: nothing changes then.
Future<SearchFilterResult?> showSearchFilterSheet(
  BuildContext context, {
  required SearchFilters initial,
}) =>
    showModalBottomSheet<SearchFilterResult>(
      // Over the bottom navigation bar, dimming it too.
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _SearchFilterSheet(initial: initial),
    );

final _sorts = <(String, String)>[
  ('relevance', tk('Relevance')),
  ('citations', tk('Citation count')),
  ('year', tk('Publication year')),
];

class _SearchFilterSheet extends StatefulWidget {
  const _SearchFilterSheet({required this.initial});

  final SearchFilters initial;

  @override
  State<_SearchFilterSheet> createState() => _SearchFilterSheetState();
}

class _SearchFilterSheetState extends State<_SearchFilterSheet> {
  late SearchFilters _draft = widget.initial;
  bool _clearedAll = false;

  /// Bumped by "Clear all" so the dropdowns rebuild with the reset value.
  int _resets = 0;

  late final _from =
      TextEditingController(text: widget.initial.yearFrom?.toString() ?? '');
  late final _to =
      TextEditingController(text: widget.initial.yearTo?.toString() ?? '');
  late final _source = TextEditingController(text: widget.initial.source ?? '');

  @override
  void dispose() {
    _from.dispose();
    _to.dispose();
    _source.dispose();
    super.dispose();
  }

  void _clearAll() {
    setState(() {
      _draft = const SearchFilters();
      _clearedAll = true;
      _resets++;
      _from.clear();
      _to.clear();
      _source.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final from = parseYearField(_from.text);
    final to = parseYearField(_to.text);
    final rangeError = from.error == null && to.error == null
        ? yearRangeError(from.year, to.year)
        : null;
    final valid =
        from.error == null && to.error == null && rangeError == null;

    InputDecoration yearDecoration(String hint, String? error) =>
        InputDecoration(
          hintText: context.t(hint),
          errorText: error == null ? null : context.t(error),
          counterText: '',
        );

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.t('Search filters'),
                    style: theme.textTheme.titleLarge,
                  ),
                ),
                TextButton(
                  onPressed: _clearAll,
                  child: Text(context.t('Clear all')),
                ),
              ],
            ),
            const Divider(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                context.t('Semantic reranking'),
                style: theme.textTheme.titleSmall,
              ),
              subtitle: Text(
                context.t(
                  'Uses AI models to re-evaluate relevance. May increase search latency.',
                ),
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: lumi.foregroundSecondary),
              ),
              value: _draft.rerank,
              onChanged: (v) =>
                  setState(() => _draft = _draft.copyWith(rerank: v)),
            ),
            const SizedBox(height: 16),
            Text(context.t('Publication years'),
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _from,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    maxLength: 4,
                    decoration: yearDecoration('From year', from.error),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _to,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    maxLength: 4,
                    decoration: yearDecoration('To year', to.error),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            if (rangeError != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  context.t(rangeError),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: lumi.error),
                ),
              ),
            const SizedBox(height: 16),
            Text(context.t('Sort results by'),
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: ValueKey('sort-$_resets'),
              isExpanded: true,
              initialValue: _draft.sort,
              items: [
                for (final (value, label) in _sorts)
                  DropdownMenuItem(value: value, child: Text(context.t(label))),
              ],
              onChanged: (v) => setState(
                () => _draft = _draft.copyWith(sort: v ?? 'relevance'),
              ),
            ),
            const SizedBox(height: 16),
            Text(context.t('Paper kind'), style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              // A new key after "Clear all", so the field shows the reset.
              key: ValueKey('kind-$_resets'),
              isExpanded: true,
              initialValue: _draft.paperKind,
              items: [
                DropdownMenuItem<String?>(child: Text(context.t('All kinds'))),
                for (final (value, label) in searchPaperKinds)
                  DropdownMenuItem(value: value, child: Text(context.t(label))),
              ],
              onChanged: (v) =>
                  setState(() => _draft = _draft.copyWith(paperKind: () => v)),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                context.t('Open access only'),
                style: theme.textTheme.titleSmall,
              ),
              value: _draft.openAccess ?? false,
              onChanged: (v) => setState(
                () => _draft =
                    _draft.copyWith(openAccess: () => v ?? false ? true : null),
              ),
            ),
            const SizedBox(height: 8),
            Text(context.t('Journal / venue source'),
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: _source,
              maxLength: SearchFilters.maxSourceLength,
              decoration: InputDecoration(
                hintText: context.t('e.g. Nature, IEEE'),
                counterText: '',
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: !valid
                    ? null
                    : () => Navigator.pop<SearchFilterResult>(
                          context,
                          (
                            filters: _draft.copyWith(
                              yearFrom: () => from.year,
                              yearTo: () => to.year,
                              source: () => normalizeSource(_source.text),
                            ),
                            clearedAll: _clearedAll,
                          ),
                        ),
                child: Text(context.t('Apply filters')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
