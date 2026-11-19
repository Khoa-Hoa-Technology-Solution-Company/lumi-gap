import 'package:flutter_mobile/features/papers/domain/paper_citation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const title = 'Federated learning in health care';

  group('APA 7', () {
    test('one author: no "et al."', () {
      expect(
        apaCitation(
          authors: ['Minh Nguyen'],
          title: title,
          year: 2024,
          journal: 'Nature Medicine',
        ),
        'Minh Nguyen. (2024). Federated learning in health care. Nature Medicine.',
      );
    });

    test('two and three authors: commas and "&" before the last', () {
      expect(
        apaCitation(authors: ['A', 'B'], title: title, year: 2024),
        'A, & B. (2024). Federated learning in health care.',
      );
      expect(
        apaCitation(authors: ['A', 'B', 'C'], title: title, year: 2024),
        'A, B, & C. (2024). Federated learning in health care.',
      );
    });

    test('21 authors: first 19, an ellipsis, then the last', () {
      final authors = [for (var i = 1; i <= 21; i++) 'A$i'];
      final c = apaCitation(authors: authors, title: title, year: 2024);
      expect(c, startsWith('A1, A2,'));
      expect(c, contains('A19, ... A21.'));
      expect(c, isNot(contains('A20')));
    });

    test('missing year is (n.d.); no authors puts the title first', () {
      expect(
        apaCitation(authors: const [], title: title, year: 0),
        'Federated learning in health care. (n.d.).',
      );
    });

    test('nothing is invented for missing parts', () {
      final c = apaCitation(authors: ['  ', 'A'], title: 'Why?', year: 2020);
      expect(c, 'A. (2020). Why?');
      expect(c, isNot(contains('Unknown')));
      expect(c, isNot(contains('N/A')));
    });
  });

  group('MLA 9', () {
    test('one, two, three authors', () {
      expect(
        mlaCitation(
          authors: ['Minh Nguyen'],
          title: title,
          year: 2024,
          journal: 'Nature Medicine',
        ),
        'Minh Nguyen. "Federated learning in health care." Nature Medicine, 2024.',
      );
      expect(
        mlaCitation(authors: ['A', 'B'], title: title, year: 2024),
        'A and B. "Federated learning in health care." 2024.',
      );
      expect(
        mlaCitation(authors: ['A', 'B', 'C'], title: title),
        'A, et al. "Federated learning in health care."',
      );
    });

    test('no authors starts with the title', () {
      expect(
        mlaCitation(authors: const [], title: 'Why?', journal: 'J'),
        '"Why?" J.',
      );
    });
  });
}
