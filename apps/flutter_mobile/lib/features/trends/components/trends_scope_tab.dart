import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/utils/number_format.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_list_row.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

/// Years offered for the scope: the last 30 years up to now.
final List<int> scopeYears = [
  for (var y = DateTime.now().year - 30; y <= DateTime.now().year; y++) y,
];

/// The default scope the "Reset" button goes back to: the 15-year window the
/// verdicts are calibrated on.
final int scopeDefaultYearFrom = defaultTrendYears().from;
final int scopeDefaultYearTo = defaultTrendYears().to;
const int scopeDefaultMinPapers = 1;

/// The trend scope editor: years, then the taxonomy and publication facets
/// the API offers, then shortcuts that use this scope. It reports every
/// change through [onChanged]; the sheet around it decides when to apply.
class TrendsScopeTab extends StatefulWidget {
  const TrendsScopeTab({
    required this.overview,
    required this.params,
    required this.onChanged,
    super.key,
  });

  final TrendsOverview overview;
  final TrendsOverviewParams params;
  final ValueChanged<TrendsOverviewParams> onChanged;

  @override
  State<TrendsScopeTab> createState() => _TrendsScopeTabState();
}

class _TrendsScopeTabState extends State<TrendsScopeTab> {
  TrendsOverviewParams get _p => widget.params;
  TrendScopeFilters get _f => _p.scopeFilters;

  void _emit({
    int? yearFrom,
    int? yearTo,
    int? minPapers,
    TrendScopeFilters? filters,
    List<String>? sizeBands,
  }) {
    var from = yearFrom ?? _p.yearFrom ?? scopeDefaultYearFrom;
    var to = yearTo ?? _p.yearTo ?? scopeDefaultYearTo;
    // Never a backwards range: moving one end past the other moves both.
    if (from > to) {
      if (yearFrom != null) {
        to = from;
      } else {
        from = to;
      }
    }
    widget.onChanged(
      TrendsOverviewParams(
        yearFrom: from,
        yearTo: to,
        minPapers: minPapers ?? _p.minPapers,
        scopeFilters: filters ?? _f,
        sizeBands: sizeBands ?? _p.sizeBands,
        sortBy: _p.sortBy,
        limit: _p.limit,
      ),
    );
  }

  List<String> _toggled(List<String> list, String id) =>
      list.contains(id) ? [...list.where((x) => x != id)] : [...list, id];

  void _reset() => widget.onChanged(
    TrendsOverviewParams(
      yearFrom: scopeDefaultYearFrom,
      yearTo: scopeDefaultYearTo,
      minPapers: scopeDefaultMinPapers,
      sortBy: _p.sortBy,
      limit: _p.limit,
    ),
  );

  Map<String, String> _query({String? q}) => {
    if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
    if (_f.subfieldIds.isNotEmpty) 'subfieldIds': _f.subfieldIds.join(','),
    if (_f.paperKinds.isNotEmpty) 'paperKinds': _f.paperKinds.join(','),
    if (_f.openAccessStatuses.isNotEmpty)
      'openAccessStatuses': _f.openAccessStatuses.join(','),
    if (_p.yearFrom != null) 'yearFrom': '${_p.yearFrom}',
    if (_p.yearTo != null) 'yearTo': '${_p.yearTo}',
  };

  /// What to search or report on: the narrowest chosen facet, else
  /// "research".
  String _scopeTopic() {
    final facets = widget.overview.facets;
    String? nameOf(List<TrendFacetBucket>? buckets, List<String> ids) {
      if (ids.isEmpty) return null;
      for (final b in buckets ?? const <TrendFacetBucket>[]) {
        if (b.id == ids.first) return b.name;
      }
      return ids.first;
    }

    return nameOf(facets?.subfields, _f.subfieldIds) ?? 'research';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final facets = widget.overview.facets;
    final from = _p.yearFrom ?? scopeDefaultYearFrom;
    final to = _p.yearTo ?? scopeDefaultYearTo;

    Widget yearField(String label, int value, ValueChanged<int> onPick) =>
        DropdownButtonFormField<int>(
          isExpanded: true,
          initialValue: scopeYears.contains(value) ? value : null,
          decoration: InputDecoration(labelText: label),
          items: [
            for (final y in scopeYears)
              DropdownMenuItem(value: y, child: Text('$y')),
          ],
          onChanged: (v) {
            if (v != null) onPick(v);
          },
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        Text(
          context.t(
            'Publications in scope: {{totalPublications}} papers',
            {
              'totalPublications': formatNumber(
                widget.overview.totalPapersInWindow,
              ),
            },
          ),
          style: theme.textTheme.bodyMedium?.copyWith(
            color: lumi.foregroundSecondary,
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Text(
                context.t('Publication Year Range'),
                style: theme.textTheme.titleMedium,
              ),
            ),
            TextButton(onPressed: _reset, child: Text(context.t('Reset'))),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: yearField(
                context.t('From Year'),
                from,
                (y) => _emit(yearFrom: y),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: yearField(
                context.t('To Year'),
                to,
                (y) => _emit(yearTo: y),
              ),
            ),
          ],
        ),
        if (facets != null) ...[
          // Trends cover the Information Technology scope only, so the taxonomy
          // filter narrows by subfield; domain and field filters are not
          // offered (as on the web).
          _FacetChips(
            title: context.t('Taxonomy Subfields'),
            buckets: facets.subfields,
            selected: _f.subfieldIds,
            onToggle: (id) => _emit(
              filters: _copy(_f, subfieldIds: _toggled(_f.subfieldIds, id)),
            ),
          ),
          if (widget.overview.bandCutoffs case final cutoffs?)
            _SizeBandChips(
              cutoffs: cutoffs,
              selected: _p.sizeBands,
              onToggle: (band) =>
                  _emit(sizeBands: _toggled(_p.sizeBands, band)),
            ),
          _FacetChips(
            title: context.t('Paper Type'),
            buckets: facets.paperKinds,
            selected: _f.paperKinds,
            onToggle: (id) => _emit(
              filters: _copy(_f, paperKinds: _toggled(_f.paperKinds, id)),
            ),
          ),
          _FacetChips(
            title: context.t('Open Access Status'),
            buckets: facets.openAccessStatuses,
            selected: _f.openAccessStatuses,
            onToggle: (id) => _emit(
              filters: _copy(
                _f,
                openAccessStatuses: _toggled(_f.openAccessStatuses, id),
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        LumiRowGroup(
          children: [
            LumiListRow(
              icon: Icons.search,
              title: context.t('Search scoped papers'),
              onTap: () => unawaited(
                context.push(
                  Uri(
                    path: '/search',
                    queryParameters: _query(q: _scopeTopic()),
                  ).toString(),
                ),
              ),
            ),
            LumiListRow(
              icon: Icons.description_outlined,
              title: context.t('Generate scoped report'),
              onTap: () => unawaited(
                context.push(
                  Uri(
                    path: '/reports',
                    queryParameters: {
                      'create': 'true',
                      'topic': _scopeTopic(),
                      ..._query(),
                    },
                  ).toString(),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

TrendScopeFilters _copy(
  TrendScopeFilters f, {
  List<String>? paperKinds,
  List<String>? openAccessStatuses,
  List<String>? subfieldIds,
}) => TrendScopeFilters(
  paperKinds: paperKinds ?? f.paperKinds,
  openAccessStatuses: openAccessStatuses ?? f.openAccessStatuses,
  providers: f.providers,
  sources: f.sources,
  citationBands: f.citationBands,
  domains: f.domains,
  fields: f.fields,
  subfields: f.subfields,
  topics: f.topics,
  domainIds: f.domainIds,
  fieldIds: f.fieldIds,
  subfieldIds: subfieldIds ?? f.subfieldIds,
  topicIds: f.topicIds,
);

class _FacetChips extends StatelessWidget {
  const _FacetChips({
    required this.title,
    required this.buckets,
    required this.selected,
    required this.onToggle,
  });

  final String title;
  final List<TrendFacetBucket> buckets;
  final List<String> selected;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    if (buckets.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final b in buckets)
                FilterChip(
                  label: Text('${b.name} (${formatNumber(b.count)})'),
                  selected: selected.contains(b.id),
                  onSelected: (_) => onToggle(b.id),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Size bands: tertiles of total papers among the topics of the IT scope,
/// each with its paper range.
class _SizeBandChips extends StatelessWidget {
  const _SizeBandChips({
    required this.cutoffs,
    required this.selected,
    required this.onToggle,
  });

  final ({double smallMax, double mediumMax}) cutoffs;
  final List<String> selected;
  final ValueChanged<String> onToggle;

  String _range(String band) {
    final small = formatNumber(cutoffs.smallMax.round());
    final medium = formatNumber(cutoffs.mediumMax.round());
    return switch (band) {
      'small' => '≤ $small',
      'medium' => '$small–$medium',
      _ => '> $medium',
    };
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Topic size (papers in the window)'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final band in trendSizeBands)
                FilterChip(
                  label: Text(
                    '${context.t(trendSizeBandLabel(band))} (${_range(band)})',
                  ),
                  selected: selected.contains(band),
                  onSelected: (_) => onToggle(band),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
