import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_theme.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_controls.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_data.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_states.dart';
import 'package:flutter_mobile/features/trends/components/trend_verdict.dart';
import 'package:flutter_mobile/features/trends/data/trend_classification.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/readable_text.dart';

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
  AppLocale locale = AppLocale.en,
}) async {
  tester.view
    ..physicalSize = const Size(320, 900)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      locale: locale.locale,
      supportedLocales: AppLocale.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      theme: brightness == Brightness.dark
          ? AppTheme.darkTheme
          : AppTheme.lightTheme,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: const TextScaler.linear(1.3)),
        child: child!,
      ),
      home: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: child,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Widget _all({required ValueChanged<String> onTab, VoidCallback? onFilter}) =>
    Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LumiSegmentedTabs<String>(
          options: const [
            ('a', 'Active'),
            ('r', 'Resolved'),
            ('d', 'Dismissed'),
          ],
          selected: 'a',
          onChanged: onTab,
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: LumiSearchButton(hint: 'Search', onPressed: () {})),
            const SizedBox(width: 8),
            LumiFilterButton(activeCount: 2, onPressed: onFilter ?? () {}),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: LumiShortcutTile(
                icon: Icons.trending_up,
                label: 'Trends',
                onPressed: () {},
              ),
            ),
            Expanded(
              child: LumiShortcutTile(
                icon: Icons.lightbulb_outline,
                label: 'Gaps',
                onPressed: () {},
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const LumiHeroMetric(
          label: 'Fastest rising topic',
          value: '+138.6%',
          unit: 'per year',
        ),
        const SizedBox(height: 16),
        const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            TrendVerdictPill(verdict: TrendVerdict.rising),
            TrendVerdictPill(verdict: TrendVerdict.declining),
            TrendVerdictPill(verdict: TrendVerdict.stable),
            TrendVerdictPill(verdict: TrendVerdict.insufficient),
          ],
        ),
        const SizedBox(height: 16),
        const SizedBox(
          height: 360,
          child: LumiEmptyState(
            icon: Icons.lightbulb_outline,
            title: 'No research gaps yet',
            message: 'Analyze a topic to find open questions.',
          ),
        ),
      ],
    );

void main() {
  for (final brightness in Brightness.values) {
    testWidgets('readable and in place, ${brightness.name}', (tester) async {
      await _pump(tester, _all(onTab: (_) {}), brightness: brightness);
      expect(tester.takeException(), isNull);
      final page = brightness == Brightness.dark
          ? LumiColors.dark.background
          : LumiColors.light.background;
      expect(unreadableText(tester, page: page), isEmpty);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });
  }

  testWidgets('a tab reports only a change, and says which is selected',
      (tester) async {
    final picked = <String>[];
    await _pump(tester, _all(onTab: picked.add));
    await tester.tap(find.text('Active'));
    await tester.tap(find.text('Dismissed'));
    expect(picked, ['d']);
    expect(
      tester.getSemantics(find.text('Active')),
      matchesSemantics(
        isSelected: true,
        hasSelectedState: true,
        isButton: true,
        isInMutuallyExclusiveGroup: true,
        hasTapAction: true,
        hasFocusAction: true,
        isFocusable: true,
        label: 'Active',
      ),
    );
  });

  testWidgets('the filter badge counts what is in force and hides at 0',
      (tester) async {
    await _pump(tester, LumiFilterButton(activeCount: 0, onPressed: () {}));
    expect(find.text('0'), findsNothing);
    expect(find.bySemanticsLabel('Filters'), findsOneWidget);
    await _pump(tester, LumiFilterButton(activeCount: 3, onPressed: () {}));
    expect(find.text('3'), findsOneWidget);
    expect(find.bySemanticsLabel('Filters, 3 active'), findsOneWidget);
  });

  testWidgets('a sparkline needs 3 real points, else draws nothing',
      (tester) async {
    await _pump(
      tester,
      const Column(
        children: [
          LumiSparkline(key: Key('two'), values: [1, 5], color: Colors.transparent),
          LumiSparkline(key: Key('three'), values: [1, 5, 9], color: Colors.transparent),
        ],
      ),
    );
    expect(
      find.descendant(of: find.byKey(const Key('two')), matching: find.byType(CustomPaint)),
      findsNothing,
    );
    expect(
      find.descendant(of: find.byKey(const Key('three')), matching: find.byType(CustomPaint)),
      findsOneWidget,
    );
    expect(LumiSparkline.canDraw(const []), isFalse);
  });

  testWidgets('the search box is its own button, not part of nearby text',
      (tester) async {
    final handle = tester.ensureSemantics();
    await _pump(
      tester,
      Column(
        children: [
          const Text('Hello, Tran Thi B'),
          LumiSearchButton(hint: 'Search papers', onPressed: () {}),
          LumiShortcutTile(
            icon: Icons.show_chart,
            label: 'Trends',
            onPressed: () {},
          ),
          LumiFilterButton(activeCount: 1, onPressed: () {}),
        ],
      ),
    );
    // A screen reader can activate each one (double tap).
    for (final type in [LumiShortcutTile, LumiFilterButton]) {
      final node = tester.getSemantics(find.byType(type));
      expect(
        node.getSemanticsData().hasAction(SemanticsAction.tap),
        isTrue,
        reason: '$type',
      );
    }
    expect(
      tester.getSemantics(find.byType(LumiSearchButton)),
      matchesSemantics(
        label: 'Search papers',
        isButton: true,
        hasTapAction: true,
      ),
    );
    handle.dispose();
  });

  testWidgets('a locked choice ignores taps', (tester) async {
    final picked = <String>[];
    await _pump(
      tester,
      LumiSegmentedTabs<String>(
        options: const [('en', 'English'), ('vi', 'Vietnamese')],
        selected: 'en',
        enabled: false,
        onChanged: picked.add,
      ),
    );
    await tester.tap(find.text('Vietnamese'), warnIfMissed: false);
    expect(picked, isEmpty);
  });
}
