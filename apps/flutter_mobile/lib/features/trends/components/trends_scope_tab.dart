import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:go_router/go_router.dart';

class TrendsScopeTab extends StatefulWidget {
  const TrendsScopeTab({
    required this.overview,
    required this.params,
    required this.onChanged,
    required this.onGoToSignals,
    super.key,
  });

  final TrendsOverview overview;
  final TrendsOverviewParams params;
  final ValueChanged<TrendsOverviewParams> onChanged;
  final VoidCallback onGoToSignals;

  @override
  State<TrendsScopeTab> createState() => _TrendsScopeTabState();
}

class _TrendsScopeTabState extends State<TrendsScopeTab> {
  int? _yearFrom;
  int? _yearTo;
  int? _minPapers;

  final List<String> _selectedKinds = [];
  final List<String> _selectedOA = [];
  final List<String> _selectedDomains = [];
  final List<String> _selectedFields = [];
  final List<String> _selectedSubfields = [];

  @override
  void initState() {
    super.initState();
    _initFilters();
  }

  @override
  void didUpdateWidget(covariant TrendsScopeTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.params != widget.params) {
      _initFilters();
    }
  }

  void _initFilters() {
    _yearFrom = widget.params.yearFrom;
    _yearTo = widget.params.yearTo;
    _minPapers = widget.params.minPapers;

    _selectedKinds
      ..clear()
      ..addAll(widget.params.scopeFilters.paperKinds);

    _selectedOA
      ..clear()
      ..addAll(widget.params.scopeFilters.openAccessStatuses);

    _selectedDomains
      ..clear()
      ..addAll(widget.params.scopeFilters.domainIds);

    _selectedFields
      ..clear()
      ..addAll(widget.params.scopeFilters.fieldIds);

    _selectedSubfields
      ..clear()
      ..addAll(widget.params.scopeFilters.subfieldIds);
  }

  void _updateParams() {
    final newFilters = TrendScopeFilters(
      paperKinds: _selectedKinds,
      openAccessStatuses: _selectedOA,
      domainIds: _selectedDomains,
      fieldIds: _selectedFields,
      subfieldIds: _selectedSubfields,
    );

    final newParams = TrendsOverviewParams(
      yearFrom: _yearFrom,
      yearTo: _yearTo,
      minPapers: _minPapers,
      scopeFilters: newFilters,
      sortBy: widget.params.sortBy,
      limit: widget.params.limit,
    );

    widget.onChanged(newParams);
  }

  void _toggleFilter(List<String> list, String value) {
    setState(() {
      if (list.contains(value)) {
        list.remove(value);
      } else {
        list.add(value);
      }
    });
    _updateParams();
  }

  void _clearAll() {
    setState(() {
      _yearFrom = 2020;
      _yearTo = 2026;
      _minPapers = 1;
      _selectedKinds.clear();
      _selectedOA.clear();
      _selectedDomains.clear();
      _selectedFields.clear();
      _selectedSubfields.clear();
    });
    _updateParams();
  }

  String _scopeSearchQuery() {
    final labels = [
      ..._selectedSubfields,
      ..._selectedFields,
      ..._selectedDomains,
      ..._selectedKinds,
      ..._selectedOA,
    ].where((value) => value.trim().isNotEmpty).toList();
    return labels.isEmpty ? 'research' : labels.first;
  }

  Map<String, String> _scopeQueryParameters({String? q}) {
    return {
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      if (_selectedDomains.isNotEmpty) 'domainIds': _selectedDomains.join(','),
      if (_selectedFields.isNotEmpty) 'fieldIds': _selectedFields.join(','),
      if (_selectedSubfields.isNotEmpty)
        'subfieldIds': _selectedSubfields.join(','),
      if (_selectedKinds.isNotEmpty) 'paperKinds': _selectedKinds.join(','),
      if (_selectedOA.isNotEmpty) 'openAccessStatuses': _selectedOA.join(','),
      if (_yearFrom != null) 'yearFrom': _yearFrom.toString(),
      if (_yearTo != null) 'yearTo': _yearTo.toString(),
    };
  }

  String _routeWithQuery(String path, Map<String, String> queryParameters) {
    return Uri(path: path, queryParameters: queryParameters).toString();
  }

  Widget _buildMultiSelectChips({
    required String title,
    required List<TrendFacetBucket> buckets,
    required List<String> selectedList,
    required bool isDark,
  }) {
    if (buckets.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: Color(0xFF94A3B8),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: buckets.map((bucket) {
            final isSelected = selectedList.contains(bucket.id);
            return ChoiceChip(
              label: Text(
                '${bucket.name} (${bucket.count})',
                style: const TextStyle(fontSize: 11),
              ),
              selected: isSelected,
              selectedColor: const Color(0xFF06B6D4),
              onSelected: (_) => _toggleFilter(selectedList, bucket.id),
            );
          }).toList(),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? const Color(0xFF1A2332) : theme.cardColor;
    final borderColor = isDark
        ? const Color(0xFF26334A)
        : const Color(0xFFE2E8F0);

    final facets = widget.overview.facets;

    // Count total matched publications
    final totalPublications = widget.overview.totalPapersInWindow;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Scope Summary Card
        Card(
          elevation: 0,
          margin: EdgeInsets.zero,
          color: const Color(0xFF0F172A).withValues(alpha: 0.04),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: borderColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.shield, color: Color(0xFF06B6D4), size: 18),
                        SizedBox(width: 8),
                        Text(
                          'Current Scope Summary',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                    TextButton(
                      onPressed: _clearAll,
                      child: const Text(
                        'Reset',
                        style: TextStyle(fontSize: 12, color: Colors.red),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Publications in scope: $totalPublications papers',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: Color(0xFF06B6D4),
                  ),
                ),
                if (_selectedDomains.isNotEmpty ||
                    _selectedFields.isNotEmpty ||
                    _selectedSubfields.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Taxonomy path: ${_selectedDomains.join(', ')}'
                    '${_selectedFields.isNotEmpty ? ' ➔ ${_selectedFields.join(', ')}' : ''}'
                    '${_selectedSubfields.isNotEmpty ? ' ➔ ${_selectedSubfields.join(', ')}' : ''}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                const Divider(),
                const SizedBox(height: 4),
                const Text(
                  'These filters change every Signals, Compare, Search, Report, and Explain result dynamically.',
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    fontStyle: FontStyle.italic,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Year range selector
        const Text(
          'Publication Year Range',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _yearFrom,
                decoration: InputDecoration(
                  labelText: 'From Year',
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                items: List.generate(10, (index) => 2018 + index)
                    .map(
                      (y) =>
                          DropdownMenuItem(value: y, child: Text(y.toString())),
                    )
                    .toList(),
                onChanged: (val) {
                  setState(() => _yearFrom = val);
                  _updateParams();
                },
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _yearTo,
                decoration: InputDecoration(
                  labelText: 'To Year',
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                items: List.generate(10, (index) => 2018 + index)
                    .map(
                      (y) =>
                          DropdownMenuItem(value: y, child: Text(y.toString())),
                    )
                    .toList(),
                onChanged: (val) {
                  setState(() => _yearTo = val);
                  _updateParams();
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        if (facets != null) ...[
          // Taxonomy selectors
          _buildMultiSelectChips(
            title: 'Taxonomy Domains',
            buckets: facets.domains,
            selectedList: _selectedDomains,
            isDark: isDark,
          ),
          _buildMultiSelectChips(
            title: 'Taxonomy Fields',
            buckets: facets.fields,
            selectedList: _selectedFields,
            isDark: isDark,
          ),
          _buildMultiSelectChips(
            title: 'Taxonomy Subfields',
            buckets: facets.subfields,
            selectedList: _selectedSubfields,
            isDark: isDark,
          ),

          // Publication selectors
          _buildMultiSelectChips(
            title: 'Paper Type',
            buckets: facets.paperKinds,
            selectedList: _selectedKinds,
            isDark: isDark,
          ),
          _buildMultiSelectChips(
            title: 'Open Access Status',
            buckets: facets.openAccessStatuses,
            selectedList: _selectedOA,
            isDark: isDark,
          ),
        ],

        const Divider(height: 32),

        // Recommended Actions
        const Text(
          'Recommended Actions in this Scope',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          color: cardBg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: borderColor),
          ),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(
                  Icons.trending_up,
                  color: Color(0xFF22C55E),
                ),
                title: const Text(
                  'Find signals in this scope',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                ),
                trailing: const Icon(Icons.chevron_right, size: 16),
                onTap: widget.onGoToSignals,
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.search, color: Color(0xFF06B6D4)),
                title: const Text(
                  'Search scoped papers',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                ),
                trailing: const Icon(Icons.chevron_right, size: 16),
                onTap: () {
                  unawaited(
                    context.push(
                      _routeWithQuery(
                        '/search',
                        _scopeQueryParameters(q: _scopeSearchQuery()),
                      ),
                    ),
                  );
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(
                  Icons.description,
                  color: Color(0xFFA78BFA),
                ),
                title: const Text(
                  'Generate scoped report',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                ),
                trailing: const Icon(Icons.chevron_right, size: 16),
                onTap: () {
                  unawaited(
                    context.push(
                      _routeWithQuery(
                        '/reports',
                        {
                          'create': 'true',
                          'topic': _scopeSearchQuery(),
                          ..._scopeQueryParameters(),
                        },
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 48),
      ],
    );
  }
}
