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
        'domainIds': 'https://openalex.org/domains/4',
        'fieldIds': 'https://openalex.org/fields/27',
        'subfieldIds': 'https://openalex.org/subfields/2735',
        'topicIds': 'https://openalex.org/topics/t12547',
      });

      expect(filters.paperKinds, ['article', 'review']);
      expect(filters.openAccessStatuses, ['gold', 'green']);
      expect(filters.citationBands, ['10-49', '100-499']);
      expect(filters.domainIds, ['https://openalex.org/domains/4']);
      expect(filters.fieldIds, ['https://openalex.org/fields/27']);
      expect(filters.subfieldIds, ['https://openalex.org/subfields/2735']);
      expect(filters.topicIds, ['https://openalex.org/topics/t12547']);
    });
  });

  group('SearchParams', () {
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
}
