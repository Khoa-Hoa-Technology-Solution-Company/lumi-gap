import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_evidence_steps.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_setup_step.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status_step.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_step_indicator.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The reader's reports first; "New report" opens the four steps (setup,
/// preview, edit the evidence pack, follow the generation). A link from
/// another screen (a topic, a gap, a scope) opens the steps directly, with
/// what it carries filled in. The steps live in `report_builder/`; this
/// screen holds the state and the requests.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({
    this.initialProjectId,
    this.initialTopic,
    this.initialQuery,
    this.initialYearFrom,
    this.initialYearTo,
    this.initialScopeFilters = const TrendScopeFilters(),
    this.startBuilding = false,
    super.key,
  });

  final String? initialProjectId;
  final String? initialTopic;
  final String? initialQuery;
  final int? initialYearFrom;
  final int? initialYearTo;
  final TrendScopeFilters initialScopeFilters;

  /// Open on the steps rather than the list (a link asked for a report).
  final bool startBuilding;

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  // Only what the reader brought from another screen: no sample values, or
  // a report could be generated on a topic nobody chose.
  late final TextEditingController _topic =
      TextEditingController(text: widget.initialTopic ?? '');
  late final TextEditingController _query =
      TextEditingController(text: widget.initialQuery ?? '');

  /// Showing the steps; otherwise the list.
  late bool _building = widget.startBuilding;

  /// Reports being deleted: a second tap waits for the first.
  final Set<String> _deleting = {};

  int _step = 1;
  ReportLanguage _language = ReportLanguage.auto;
  bool _deepAnalysis = false;
  bool _showErrors = false;
  bool _loadingPreview = false;
  bool _creating = false;
  PreviewReportEvidenceResponse? _preview;
  Set<String> _selectedPaperIds = {};
  String? _selectedId;
  Timer? _pollTimer;
  bool _disposed = false;

  ReportsParams get _listParams =>
      ReportsParams(projectId: widget.initialProjectId);

  @override
  void dispose() {
    _disposed = true;
    _topic.dispose();
    _query.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    // Never after dispose: a timer started then would poll forever.
    if (_disposed) return;
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      final id = _selectedId;
      if (id != null) ref.invalidate(reportProvider(id));
      ref.invalidate(reportsProvider(_listParams));
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
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

  Future<void> _fetchPreview() async {
    if (_loadingPreview) return;
    if (reportQueryError(_query.text) != null) {
      setState(() => _showErrors = true);
      return;
    }
    setState(() => _loadingPreview = true);
    try {
      final preview = await ref.read(reportsApiProvider).previewEvidence(
            query: _query.text.trim(),
            topic: _topic.text.trim(),
            projectId: widget.initialProjectId,
            yearFrom: widget.initialYearFrom,
            yearTo: widget.initialYearTo,
            fast: true,
            scopeFilters: widget.initialScopeFilters,
          );
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _selectedPaperIds = {for (final p in preview.papers) p.id};
        _step = 2;
      });
    } on Object catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _loadingPreview = false);
    }
  }

  Future<void> _createReport() async {
    if (_creating || _selectedPaperIds.isEmpty) return;
    setState(() => _creating = true);
    try {
      final id = await ref.read(reportsApiProvider).create(
            query: _query.text.trim(),
            topic: _topic.text.trim(),
            projectId: widget.initialProjectId,
            yearFrom: widget.initialYearFrom,
            yearTo: widget.initialYearTo,
            deepAnalysis: _deepAnalysis,
            language: _language,
            // In the order retrieval returned them, not the tap order.
            selectedPaperIds: [
              for (final p in _preview?.papers ?? const <ReportEvidencePaper>[])
                if (_selectedPaperIds.contains(p.id)) p.id,
            ],
            scopeFilters: widget.initialScopeFilters,
          );
      ref.invalidate(reportsProvider(_listParams));
      if (!mounted) return;
      setState(() {
        _selectedId = id;
        _step = 4;
      });
      _startPolling();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.t(
              'Report queued. Worker will generate it in the background.',
            ),
          ),
        ),
      );
    } on Object catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _deleteReport(String id) async {
    if (!_deleting.add(id)) return;
    setState(() {});
    try {
      await ref.read(reportsApiProvider).delete(id);
      if (mounted && _selectedId == id) {
        _stopPolling();
        setState(() {
          _selectedId = null;
          if (_step == 4) _step = 1;
        });
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('Report deleted successfully'))),
        );
      }
    } on Object catch (e) {
      _showError(e);
    } finally {
      _deleting.remove(id);
      // Reload either way: a failed delete puts the row back.
      if (mounted) {
        setState(() {});
        ref.invalidate(reportsProvider(_listParams));
      }
    }
  }

  void _follow(String id) {
    setState(() {
      _selectedId = id;
      _step = 4;
      _building = true;
    });
    _startPolling();
  }

  void _newReport() {
    _stopPolling();
    setState(() {
      _step = 1;
      _showErrors = false;
      _building = true;
    });
  }

  /// Back to the list. What was typed stays, so "New report" picks it up.
  void _closeSteps() {
    _stopPolling();
    setState(() {
      _building = false;
      if (_step == 4) _step = 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final reports = ref.watch(reportsProvider(_listParams));
    final selectedId = _selectedId;
    final selected =
        selectedId == null ? null : ref.watch(reportProvider(selectedId));

    if (selectedId != null) {
      // Poll only while the report is still being produced.
      ref.listen(reportProvider(selectedId), (_, next) {
        final status = next.value?.status;
        if (status == null) return;
        if (ReportState.parse(status).inProgress) {
          if (_pollTimer == null) _startPolling();
        } else {
          _stopPolling();
        }
      });
    }

    final Widget stepView = switch (_step) {
      1 => ReportSetupStep(
          topic: _topic,
          query: _query,
          language: _language,
          deepAnalysis: _deepAnalysis,
          loading: _loadingPreview,
          showErrors: _showErrors,
          onLanguage: (v) => setState(() => _language = v),
          onDeepAnalysis: (v) => setState(() => _deepAnalysis = v),
          onPreview: () => unawaited(_fetchPreview()),
          onEdited: () => setState(() {}),
        ),
      2 => ReportPreviewStep(
          papers: _preview?.papers ?? const [],
          onBack: () => setState(() => _step = 1),
          onNext: () => setState(() => _step = 3),
        ),
      3 => ReportEditStep(
          papers: _preview?.papers ?? const [],
          selectedIds: _selectedPaperIds,
          creating: _creating,
          onToggle: (id, {required selected}) => setState(() {
            selected ? _selectedPaperIds.add(id) : _selectedPaperIds.remove(id);
          }),
          onBack: () => setState(() => _step = 2),
          onGenerate: () => unawaited(_createReport()),
        ),
      _ => ReportStatusStep(
          report: selected,
          onNewReport: _newReport,
          onRetry: () {
            if (selectedId != null) ref.invalidate(reportProvider(selectedId));
          },
        ),
    };

    Future<void> refresh() async {
      ref.invalidate(reportsProvider(_listParams));
      if (selectedId != null) ref.invalidate(reportProvider(selectedId));
    }

    if (_building) {
      // Opened from the list, Back returns to it; opened by a link, Back
      // goes back to where the link was.
      final backToList = !widget.startBuilding;
      return PopScope(
        canPop: !backToList,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _closeSteps();
        },
        child: Scaffold(
          appBar: AppBar(
            title: Text(context.t('New report')),
            leading: backToList
                ? IconButton(
                    tooltip: context.t('Close'),
                    icon: const Icon(Icons.close),
                    onPressed: _closeSteps,
                  )
                : null,
          ),
          body: RefreshIndicator(
            onRefresh: refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                ReportStepIndicator(step: _step),
                const SizedBox(height: 16),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: KeyedSubtree(key: ValueKey(_step), child: stepView),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final Widget list;
    if (reports.hasValue) {
      final items = reports.requireValue.reports;
      list = items.isEmpty
          ? LumiEmptyState(
              icon: Icons.description_outlined,
              title: context.t('No reports yet'),
              message: context.t(
                'A report answers one question from papers you choose.',
              ),
              actionLabel: context.t('New report'),
              onAction: _newReport,
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 96),
              children: [
                MyReportsList(
                  reports: items,
                  selectedId: selectedId,
                  deleting: _deleting,
                  onOpen: (id) => unawaited(context.push('/report/$id')),
                  onFollow: _follow,
                  onDelete: _deleteReport,
                ),
              ],
            );
    } else if (reports.hasError) {
      list = LumiErrorState(
        message: context.t(failureMessageKey(reports.error!)),
        retrying: reports.isLoading,
        onRetry: () => ref.invalidate(reportsProvider(_listParams)),
      );
    } else {
      list = const LumiPageSkeleton(height: 88);
    }

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Reports'))),
      // The empty list carries the same action in its message.
      floatingActionButton: reports.value?.reports.isNotEmpty ?? false
          ? FloatingActionButton.extended(
              onPressed: _newReport,
              icon: const Icon(Icons.add),
              label: Text(context.t('New report')),
            )
          : null,
      body: RefreshIndicator(onRefresh: refresh, child: list),
    );
  }
}
