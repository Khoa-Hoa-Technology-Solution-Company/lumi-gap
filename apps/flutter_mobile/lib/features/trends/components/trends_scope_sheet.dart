import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';

class TrendsScopeSheet extends StatefulWidget {
  const TrendsScopeSheet({
    required this.params,
    required this.facets,
    required this.onChanged,
    super.key,
  });

  final TrendsOverviewParams params;
  final TrendFacets facets;
  final ValueChanged<TrendsOverviewParams> onChanged;

  @override
  State<TrendsScopeSheet> createState() => _TrendsScopeSheetState();
}

class _TrendsScopeSheetState extends State<TrendsScopeSheet> {
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
    _yearFrom = widget.params.yearFrom;
    _yearTo = widget.params.yearTo;
    _minPapers = widget.params.minPapers;

    _selectedKinds.addAll(widget.params.scopeFilters.paperKinds);
    _selectedOA.addAll(widget.params.scopeFilters.openAccessStatuses);
    _selectedDomains.addAll(widget.params.scopeFilters.domainIds);
    _selectedFields.addAll(widget.params.scopeFilters.fieldIds);
    _selectedSubfields.addAll(widget.params.scopeFilters.subfieldIds);
  }

  void _apply() {
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
    Navigator.pop(context);
  }

  void _toggleFilter(List<String> list, String value) {
    setState(() {
      if (list.contains(value)) {
        list.remove(value);
      } else {
        list.add(value);
      }
    });
  }

  Widget _buildChipSection({
    required String title,
    required List<String> options,
    required List<String> selectedList,
    required bool isDark,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF94A3B8))),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: options.map((opt) {
            final isSelected = selectedList.contains(opt);
            return ChoiceChip(
              label: Text(opt.toUpperCase(), style: TextStyle(fontSize: 11, color: isSelected ? Colors.white : (isDark ? const Color(0xFF94A3B8) : Colors.black87))),
              selected: isSelected,
              selectedColor: const Color(0xFF06B6D4),
              backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              onSelected: (_) => _toggleFilter(selectedList, opt),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final paperKindsOptions = widget.facets.paperKinds.map((b) => b.id).toList();
    final oaOptions = widget.facets.openAccessStatuses.map((b) => b.id).toList();

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        top: 16,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF475569) : const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Data Scope Filters', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _yearFrom = null;
                      _yearTo = null;
                      _minPapers = 1;
                      _selectedKinds.clear();
                      _selectedOA.clear();
                      _selectedDomains.clear();
                      _selectedFields.clear();
                      _selectedSubfields.clear();
                    });
                  },
                  child: const Text('Reset', style: TextStyle(color: Color(0xFF06B6D4))),
                ),
              ],
            ),
            const Divider(height: 24),

            // Years setup
            const Text('Year Window', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF94A3B8))),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'From Year',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    keyboardType: TextInputType.number,
                    controller: TextEditingController(text: _yearFrom?.toString() ?? ''),
                    onChanged: (val) {
                      _yearFrom = int.tryParse(val);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'To Year',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    keyboardType: TextInputType.number,
                    controller: TextEditingController(text: _yearTo?.toString() ?? ''),
                    onChanged: (val) {
                      _yearTo = int.tryParse(val);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Minimum papers
            const Text('Minimum Papers threshold', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF94A3B8))),
            const SizedBox(height: 8),
            Slider(
              value: (_minPapers ?? 1).toDouble().clamp(1.0, 50.0),
              min: 1,
              max: 50,
              divisions: 49,
              activeColor: const Color(0xFF06B6D4),
              label: _minPapers?.toString() ?? '1',
              onChanged: (val) {
                setState(() {
                  _minPapers = val.toInt();
                });
              },
            ),
            const SizedBox(height: 16),

            if (paperKindsOptions.isNotEmpty)
              _buildChipSection(title: 'Paper Kind', options: paperKindsOptions, selectedList: _selectedKinds, isDark: isDark),
            if (oaOptions.isNotEmpty)
              _buildChipSection(title: 'Open Access Status', options: oaOptions, selectedList: _selectedOA, isDark: isDark),

            // Domain Selector
            if (widget.facets.domains.isNotEmpty) ...[
              const Text('Scientific Domains', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF94A3B8))),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                decoration: InputDecoration(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
                hint: const Text('All Domains'),
                items: widget.facets.domains.map((d) {
                  return DropdownMenuItem(value: d.id, child: Text(d.name, overflow: TextOverflow.ellipsis));
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() {
                      if (!_selectedDomains.contains(val)) _selectedDomains.add(val);
                    });
                  }
                },
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: _selectedDomains.map((id) {
                  final domain = widget.facets.domains.firstWhere((d) => d.id == id, orElse: () => TrendFacetBucket(id: id, name: id, count: 0));
                  return InputChip(
                    label: Text(domain.name, style: const TextStyle(fontSize: 10)),
                    onDeleted: () {
                      setState(() {
                        _selectedDomains.remove(id);
                      });
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
            ],

            // Field Selector
            if (widget.facets.fields.isNotEmpty) ...[
              const Text('Scientific Fields', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF94A3B8))),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                decoration: InputDecoration(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
                hint: const Text('All Fields'),
                items: widget.facets.fields.map((f) {
                  return DropdownMenuItem(value: f.id, child: Text(f.name, overflow: TextOverflow.ellipsis));
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() {
                      if (!_selectedFields.contains(val)) _selectedFields.add(val);
                    });
                  }
                },
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: _selectedFields.map((id) {
                  final field = widget.facets.fields.firstWhere((f) => f.id == id, orElse: () => TrendFacetBucket(id: id, name: id, count: 0));
                  return InputChip(
                    label: Text(field.name, style: const TextStyle(fontSize: 10)),
                    onDeleted: () {
                      setState(() {
                        _selectedFields.remove(id);
                      });
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
            ],

            // Apply button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF06B6D4),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _apply,
                child: const Text('Apply Scope Settings', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
