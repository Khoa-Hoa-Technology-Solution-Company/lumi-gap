import 'package:flutter_mobile/features/search/data/search_api.dart';
import 'package:flutter_mobile/features/trends/data/trends_api.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TrendScopeFilters', () {
    test('parses scoped URL query parameters without losing facet meaning', () {
      final filters = TrendScopeFilters.fromQuery(const {
        'paperKinds': 'article,review',
        'openAccessStatuses': 'gold,green',
        'citationBands': '10-49,100-499',
        'subfieldIds': 'https://openalex.org/subfields/1702',
        'topicIds': 'https://openalex.org/topics/t12547',
      });

      expect(filters.paperKinds, ['article', 'review']);
      expect(filters.openAccessStatuses, ['gold', 'green']);
      expect(filters.citationBands, ['10-49', '100-499']);
      expect(filters.subfieldIds, ['https://openalex.org/subfields/1702']);
      expect(filters.topicIds, ['https://openalex.org/topics/t12547']);
    });
  });

  group('SearchParams', () {
    // Search still filters by domain; only the trends screen is limited to the IT scope.
    test('serializes exact scoped filters for backend search', () {
      final query = SearchParams(
        q: 'natural language processing',
        scopeFilters: TrendScopeFilters.fromQuery(const {
          'paperKinds': 'article,review',
          'openAccessStatuses': 'gold',
          'citationBands': '50-99',
          'domainIds': 'https://openalex.org/domains/1',
        }),
      ).toQuery();

      expect(query['paperKinds'], 'article,review');
      expect(query['openAccessStatuses'], 'gold');
      expect(query['citationBands'], '50-99');
      expect(query['domainIds'], 'https://openalex.org/domains/1');
    });
  });

  group('TrendsOverviewParams', () {
    test('ranks by verdict, which the API accepts (no momentum)', () {
      const params = TrendsOverviewParams(sortBy: 'trend');
      expect(params.toQuery()['sortBy'], 'trend');
    });

    test('the default window is the last 15 years', () {
      final years = defaultTrendYears(DateTime(2026, 11, 17));
      expect(years.to, 2026);
      expect(years.from, 2011);
    });
  });

  group('trend models', () {
    test(
      'a topic carries its classification; the headline change follows the verdict',
      () {
        final overview = TrendsOverview.fromJson({
          'testedTopicCount': 311,
          'scopeVersion': 'it-v1',
          'verdictCounts': {
            'rising': 71,
            'saturated': 12,
            'past_peak': 4,
            'declining': 169,
            'stable': 53,
            'insufficient': 2,
          },
          'topics': [
            {
              'topic': 'Large language models',
              'totalPapers': 1200,
              'yearlyBreakdown': <Object>[],
              'classification': {
                'verdict': 'rising',
                'confidence': 'high',
                'yearsUsed': 15,
                'mannKendall': {
                  's': 90,
                  'z': 4.1,
                  'tau': 0.8,
                  'pValue': 0.0001,
                },
                'qValue': 0.001,
                'relativeChangePct': 12.5,
                'recentRelativeChangePct': 20.1,
                'peakRatio': 1,
              },
            },
            {
              'topic': 'Expert systems',
              'totalPapers': 400,
              'yearlyBreakdown': <Object>[],
              'classification': {
                'verdict': 'past_peak',
                'relativeChangePct': 3.0,
                'recentRelativeChangePct': -9.4,
                'peakRatio': 0.4,
              },
            },
            {
              'topic': 'No test',
              'totalPapers': 3,
              'yearlyBreakdown': <Object>[],
            },
          ],
          'risingKeywords': [
            {
              'keyword': 'agents',
              'totalPapers': 50,
              'yearlyBreakdown': <Object>[],
              'shift': {
                'term': 'agents',
                'papersA': 5,
                'papersB': 45,
                'logOddsRatio': 2,
                'z': 5.2,
                'pValue': 0.0001,
                'qValue': 0.001,
              },
            },
            {'keyword': 'old', 'totalPapers': 4, 'yearlyBreakdown': <Object>[]},
          ],
        });

        expect(overview.testedTopicCount, 311);
        expect(overview.scopeVersion, 'it-v1');
        expect(overview.verdictCounts[TrendVerdict.pastPeak], 4);

        final [rising, pastPeak, untested] = overview.topics;
        expect(rising.verdict, TrendVerdict.rising);
        expect(rising.classification!.confidence, 'high');
        expect(rising.classification!.pValue, 0.0001);
        expect(rising.classification!.headlineChangePct, 12.5);
        expect(pastPeak.verdict, TrendVerdict.pastPeak);
        expect(pastPeak.classification!.headlineChangePct, -9.4);
        expect(untested.classification, isNull);
        expect(untested.verdict, TrendVerdict.insufficient);

        final [agents, old] = overview.risingKeywords;
        expect(agents.z, 5.2);
        expect(agents.papersB, 45);
        expect(agents.significant, isTrue);
        expect(old.significant, isFalse);
      },
    );

    test('the topic detail reads its conclusion from statistics', () {
      final detail = PublicationTrend.fromJson({
        'topic': 'Graph neural networks',
        'statistics': {
          'classification': {
            'verdict': 'saturated',
            'recentRelativeChangePct': 0.8,
          },
        },
      });
      expect(detail.classification!.verdict, TrendVerdict.saturated);
      expect(PublicationTrend.fromJson({'topic': 'x'}).classification, isNull);
    });
  });
}
