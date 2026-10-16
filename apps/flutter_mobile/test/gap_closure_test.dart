import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/gaps/data/gaps_api.dart';
import 'package:flutter_mobile/features/gaps/presentation/gap_closure_widgets.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _gapJson([Map<String, dynamic> extra = const {}]) => {
  'id': 'g1',
  'topic': 'topic',
  'title': 'A gap',
  'description': 'desc',
  'rationale': '',
  ...extra,
};

ResearchGapItem _gap([Map<String, dynamic> extra = const {}]) =>
    ResearchGapItem.fromJson(_gapJson(extra));

Widget _host(Widget child, {Brightness brightness = Brightness.light}) {
  return MaterialApp(
    theme: ThemeData(brightness: brightness),
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );
}

void main() {
  group('closure parsing', () {
    test('missing closure fields mean NOT_CHECKED with no check', () {
      final gap = _gap();
      expect(gap.closureStatus, GapClosureStatus.notChecked);
      expect(gap.latestClosureCheck, isNull);
    });

    test('unknown status and malformed check are tolerated', () {
      final gap = _gap({
        'closureStatus': 'SOMETHING_NEW',
        'latestClosureCheck': 'oops',
      });
      expect(gap.closureStatus, GapClosureStatus.notChecked);
      expect(gap.latestClosureCheck, isNull);
    });

    test('parses every status', () {
      expect(
        _gap({'closureStatus': 'CLOSED'}).closureStatus,
        GapClosureStatus.closed,
      );
      expect(
        _gap({'closureStatus': 'OPEN_CERTIFIED'}).closureStatus,
        GapClosureStatus.openCertified,
      );
      expect(
        _gap({'closureStatus': 'ABSTAIN'}).closureStatus,
        GapClosureStatus.abstain,
      );
      expect(
        _gap({'closureStatus': 'NOT_CHECKED'}).closureStatus,
        GapClosureStatus.notChecked,
      );
    });

    test(
      'parses latestClosureCheck with integer bound and optional fields absent',
      () {
        final gap = _gap({
          'closureStatus': 'OPEN_CERTIFIED',
          'latestClosureCheck': {
            'checkId': 'c1',
            'status': 'DECIDED',
            'decision': 'OPEN_CERTIFIED',
            'bound': 0.1533,
            'judgeKind': 'HUMAN',
            'decidedAt': '2026-10-15T08:30:00.000Z',
          },
        });
        final check = gap.latestClosureCheck!;
        expect(check.checkId, 'c1');
        expect(check.status, 'DECIDED');
        expect(check.decision, GapClosureStatus.openCertified);
        expect(check.bound, 0.1533);
        expect(check.judgeKind, 'HUMAN');
        expect(check.decidedAt, DateTime.utc(2026, 10, 15, 8, 30));

        final running = _gap({
          'latestClosureCheck': {
            'checkId': 'c2',
            'status': 'SEARCHING',
            'bound': 1,
          },
        }).latestClosureCheck!;
        expect(running.decision, isNull);
        expect(running.bound, 1.0);
        expect(running.judgeKind, isNull);
        expect(running.decidedAt, isNull);
      },
    );
  });

  group('formatting', () {
    test('risk percent rounds up to one decimal', () {
      expect(formatClosureRiskPercent(0.1533), '15.4');
      expect(formatClosureRiskPercent(0.15), '15.0');
      expect(formatClosureRiskPercent(0.1), '10.0');
      expect(formatClosureRiskPercent(0.0), '0.0');
      expect(formatClosureRiskPercent(1.0), '100.0');
      expect(formatClosureRiskPercent(0.15001), '15.1');
      expect(formatClosureRiskPercent(1.7), '100.0');
    });

    test('bound is shown with four decimals, never below the real value', () {
      expect(formatClosureBound(0.1533), '0.1533');
      expect(formatClosureBound(0.15331), '0.1534');
      expect(formatClosureBound(0.1), '0.1000');
    });

    test('judge label', () {
      expect(closureJudgeLabel('AI'), 'AI');
      expect(closureJudgeLabel('HUMAN'), 'Human-confirmed');
      expect(closureJudgeLabel(null), isNull);
      expect(closureJudgeLabel('OTHER'), isNull);
    });
  });

  group('badge mapping', () {
    test('NOT_CHECKED', () {
      expect(ClosureBadgeSpec.forGap(_gap()).label, 'Not checked');
    });

    test('CLOSED', () {
      expect(
        ClosureBadgeSpec.forGap(_gap({'closureStatus': 'CLOSED'})).label,
        'Already answered',
      );
    });

    test('OPEN_CERTIFIED shows the risk rounded up', () {
      final spec = ClosureBadgeSpec.forGap(
        _gap({
          'closureStatus': 'OPEN_CERTIFIED',
          'latestClosureCheck': {
            'checkId': 'c',
            'status': 'DECIDED',
            'bound': 0.1533,
          },
        }),
      );
      expect(spec.label, 'Open · risk ≤ 15.4%');
      expect(spec.semanticsLabel, contains('15.4 percent'));
    });

    test('OPEN_CERTIFIED without a bound falls back to plain Open', () {
      expect(
        ClosureBadgeSpec.forGap(
          _gap({'closureStatus': 'OPEN_CERTIFIED'}),
        ).label,
        'Open',
      );
    });

    test('ABSTAIN', () {
      expect(
        ClosureBadgeSpec.forGap(_gap({'closureStatus': 'ABSTAIN'})).label,
        'Needs review',
      );
    });

    test(
      'every badge text has at least 4.5:1 contrast against its tinted background',
      () {
        for (final status in [
          'NOT_CHECKED',
          'CLOSED',
          'OPEN_CERTIFIED',
          'ABSTAIN',
        ]) {
          final spec = ClosureBadgeSpec.forGap(_gap({'closureStatus': status}));
          for (final isDark in [false, true]) {
            final surface = isDark ? const Color(0xFF1A2332) : Colors.white;
            final fg = spec.color(isDark: isDark);
            final bg = Color.alphaBlend(fg.withValues(alpha: 0.12), surface);
            expect(
              _contrast(fg, bg),
              greaterThanOrEqualTo(4.5),
              reason: '$status dark=$isDark',
            );
          }
        }
      },
    );
  });

  group('widgets', () {
    testWidgets('badge renders its text and a semantics label', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        _host(
          GapClosureBadge(
            gap: _gap({
              'closureStatus': 'OPEN_CERTIFIED',
              'latestClosureCheck': {
                'checkId': 'c',
                'status': 'DECIDED',
                'bound': 0.1533,
              },
            }),
          ),
        ),
      );

      expect(find.text('Open · risk ≤ 15.4%'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp('false-novelty risk at most 15.4 percent'),
        ),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('section shows bound, judge, date and the web-app note', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          GapClosureSection(
            gap: _gap({
              'closureStatus': 'OPEN_CERTIFIED',
              'latestClosureCheck': {
                'checkId': 'c',
                'status': 'DECIDED',
                'decision': 'OPEN_CERTIFIED',
                'bound': 0.1533,
                'judgeKind': 'AI',
                'decidedAt': '2026-10-15T12:00:00.000Z',
              },
            }),
          ),
        ),
      );

      expect(find.text('Closure check'), findsOneWidget);
      expect(find.text('B ≤ 0.1533 (false-novelty risk)'), findsOneWidget);
      expect(find.text('AI'), findsOneWidget);
      expect(find.text('2026-10-15'), findsOneWidget);
      expect(
        find.text('Screening and decisions are done on the web app.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'section for an unchecked gap shows only the status and the note',
      (tester) async {
        await tester.pumpWidget(
          _host(GapClosureSection(gap: _gap()), brightness: Brightness.dark),
        );

        expect(find.text('Not checked'), findsOneWidget);
        expect(find.textContaining('B ≤'), findsNothing);
        expect(
          find.text('Screening and decisions are done on the web app.'),
          findsOneWidget,
        );
      },
    );

    testWidgets('section mentions a running check', (tester) async {
      await tester.pumpWidget(
        _host(
          GapClosureSection(
            gap: _gap({
              'latestClosureCheck': {'checkId': 'c', 'status': 'SCREENING'},
            }),
          ),
        ),
      );

      expect(find.text('A closure check is in progress.'), findsOneWidget);
    });
  });
}

double _luminance(Color c) => c.computeLuminance();

double _contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}
