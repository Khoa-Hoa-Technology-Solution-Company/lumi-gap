import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_evidence_steps.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_setup_step.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status.dart';
import 'package:flutter_mobile/features/reports/presentation/report_builder/report_status_step.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pump(WidgetTester tester, Widget child) async {
  tester.view
    ..physicalSize = const Size(412, 1400)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      locale: AppLocale.en.locale,
      supportedLocales: AppLocale.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      theme: AppTheme.lightTheme,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
  await tester.pumpAndSettle();
}

const _papers = [
  ReportEvidencePaper(id: 'a', title: 'Paper A', year: 2024, citations: 1),
  ReportEvidencePaper(id: 'b', title: 'Paper B', citations: 3),
];

void main() {
  test('question rules are the API rules', () {
    expect(reportQueryError(''), 'Enter a research question.');
    expect(reportQueryError('  ab '), 'Use at least 3 characters.');
    expect(reportQueryError('abc'), isNull);
    expect(reportQueryError('x' * 500), isNull);
    expect(reportQueryError('x' * 501), 'Use at most 500 characters.');
  });

  test('report states: known codes, unknown is never shown raw', () {
    expect(ReportState.parse('GENERATING'), ReportState.generating);
    expect(ReportState.parse('queued').inProgress, isTrue);
    expect(ReportState.parse('ready').inProgress, isFalse);
    expect(ReportState.parse('weird'), ReportState.unknown);
    expect(ReportState.unknown.label, 'Unknown');
  });

  testWidgets('no paper selected: cannot generate, and says why',
      (tester) async {
    var generated = 0;
    await _pump(
      tester,
      ReportEditStep(
        papers: _papers,
        selectedIds: const {},
        creating: false,
        onToggle: (_, {required selected}) {},
        onBack: () {},
        onGenerate: () => generated++,
      ),
    );
    expect(
      find.text('Select at least one paper to ground the report.'),
      findsOneWidget,
    );
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Generate Report'),
    );
    expect(button.onPressed, isNull);
    expect(generated, 0);
    // A missing year is left out, not "N/A".
    expect(find.text('3 cites'), findsOneWidget);
    expect(find.textContaining('N/A'), findsNothing);
  });

  testWidgets('a failed report says it failed, not "still writing"',
      (tester) async {
    await _pump(
      tester,
      ReportStatusStep(
        report: const AsyncData(
          AnalyticalReport(id: 'r1', query: 'q', status: 'failed'),
        ),
        onNewReport: () {},
        onRetry: () {},
      ),
    );
    expect(find.text('Failed'), findsOneWidget);
    expect(find.text('The report could not be generated.'), findsOneWidget);
    expect(find.textContaining('compiling'), findsNothing);
    expect(find.text('View Full Report'), findsNothing);
  });

  testWidgets('a running report shows a translated state, no raw code',
      (tester) async {
    await _pump(
      tester,
      ReportStatusStep(
        report: const AsyncData(
          AnalyticalReport(id: 'r1', query: 'q', status: 'generating'),
        ),
        onNewReport: () {},
        onRetry: () {},
      ),
    );
    expect(find.text('Generating'), findsOneWidget);
    expect(find.text('GENERATING'), findsNothing);
  });

  testWidgets('deleting a report asks first', (tester) async {
    final deleted = <String>[];
    await _pump(
      tester,
      MyReportsList(
        reports: const [
          ReportListItem(id: 'r1', query: 'q', status: 'ready', topic: 'T'),
        ],
        selectedId: null,
        onOpen: (_) {},
        onFollow: (_) {},
        onDelete: (id) async => deleted.add(id),
      ),
    );
    await tester.drag(find.text('T'), const Offset(-600, 0));
    await tester.pumpAndSettle();
    expect(
      find.text('Delete this report? This cannot be undone.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(deleted, isEmpty);
    expect(find.text('T'), findsOneWidget);
  });
}
