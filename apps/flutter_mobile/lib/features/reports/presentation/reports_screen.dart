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

/// Build a grounded report in four steps (setup, preview, edit the evidence
/// pack, follow the generation) and list the reader's reports. The steps
/// live in `report_builder/`; this screen holds the state and the requests.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({
    this.initialProjectId,
    this.initialTopic,
    this.initialQuery,
    this.initialYearFrom,
    this.initialYearTo,
    this.initialScopeFilters = const TrendScopeFilters(),
    super.key,
  });

  final String? initialProjectId;
  final String? initialTopic;
  final String? initialQuery;
  final int? initialYearFrom;
  final int? initialYearTo;
  final TrendScopeFilters initialScopeFilters;

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
      // Reload either way: a failed delete puts the row back.
      if (mounted) ref.invalidate(reportsProvider(_listParams));
    }
  }

  void _follow(String id) {
    setState(() {
      _selectedId = id;
      _step = 4;
    });
    _startPolling();
  }

  void _newReport() {
    _stopPolling();
    setState(() {
      _step = 1;
      _showErrors = false;
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

    return Scaffold(
      appBar: AppBar(title: Text(context.t('RAG Reports Workbench'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(reportsProvider(_listParams));
          if (selectedId != null) ref.invalidate(reportProvider(selectedId));
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ReportStepIndicator(step: _step),
            const SizedBox(height: 16),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: KeyedSubtree(key: ValueKey(_step), child: stepView),
            ),
            const SizedBox(height: 24),
            LumiSectionHeader(title: context.t('My reports')),
            if (reports.hasValue)
              MyReportsList(
                reports: reports.requireValue.reports,
                selectedId: selectedId,
                onOpen: (id) => unawaited(context.push('/report/$id')),
                onFollow: _follow,
                onDelete: _deleteReport,
              )
            else if (reports.hasError)
              LumiErrorState(
                message: context.t(failureMessageKey(reports.error!)),
                retrying: reports.isLoading,
                onRetry: () => ref.invalidate(reportsProvider(_listParams)),
                inline: true,
              )
            else
              const LumiSkeleton(rows: 3, height: 96),
          ],
        ),
      ),
    );
  }
}
