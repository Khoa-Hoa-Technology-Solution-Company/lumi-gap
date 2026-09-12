import 'package:flutter_mobile/features/papers/domain/submit_paper_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SubmitPaperValidation', () {
    test('accepts a valid direct paper submission', () {
      final result = validateSubmitPaper(
        title: 'Large Language Models for Research Education',
        doi: '10.1234/example.paper',
        paperLink: 'https://example.com/paper',
        abstractText: List.filled(60, 'research').join(' '),
        publicationYear: DateTime.now().year.toString(),
        authors: 'Alice Nguyen, Bob Tran',
        keywords: 'LLM, RAG',
      );

      expect(result, isNull);
    });

    test('rejects invalid DOI before a network request is made', () {
      final result = validateSubmitPaper(
        title: 'Large Language Models for Research Education',
        doi: 'bad-doi',
        paperLink: 'https://example.com/paper',
        abstractText: List.filled(60, 'research').join(' '),
        publicationYear: DateTime.now().year.toString(),
        authors: 'Alice Nguyen',
        keywords: 'LLM',
      );

      expect(result, 'Please enter a valid DOI.');
    });
  });
}
