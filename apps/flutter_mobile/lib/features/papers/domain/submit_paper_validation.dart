import 'package:flutter_mobile/core/i18n/i18n.dart';

int countWords(String value) {
  return value.trim().split(RegExp(r'\s+')).where((word) {
    return RegExp('[a-z0-9]', caseSensitive: false).hasMatch(word);
  }).length;
}

List<String> csvList(String value) {
  return value
      .split(',')
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();
}

/// Every problem of the form, by field, as `context.t` keys, so each one is
/// shown under its own field. Insertion order is the form's order.
Map<String, String> submitPaperFieldErrors({
  required String title,
  required String doi,
  required String paperLink,
  required String abstractText,
  required String publicationYear,
  required String authors,
  required String keywords,
}) {
  final errors = <String, String>{};
  final cleanTitle = title.trim();
  if (cleanTitle.length < 8 || countWords(cleanTitle) < 3) {
    errors['title'] = tk('Title must be at least 8 characters and 3 words.');
  }
  if (!RegExp(r'^10\.\d{4,9}/\S+$', caseSensitive: false)
      .hasMatch(doi.trim())) {
    errors['doi'] = tk('Please enter a valid DOI.');
  }
  if (!RegExp('^https?://', caseSensitive: false).hasMatch(paperLink.trim())) {
    errors['paperLink'] = tk('Paper link must be a valid URL.');
  }
  final abstractWords = countWords(abstractText);
  if (abstractWords < 50 || abstractWords > 350) {
    errors['abstract'] = tk('Abstract must be between 50 and 350 words.');
  }
  final year = int.tryParse(publicationYear.trim());
  if (year == null || year < 1900 || year > DateTime.now().year) {
    errors['year'] = tk('Publication year is invalid.');
  }
  if (csvList(authors).isEmpty) {
    errors['authors'] = tk('At least one author is required.');
  }
  if (csvList(keywords).isEmpty) {
    errors['keywords'] = tk('At least one keyword is required.');
  }
  return errors;
}

/// The first problem, in the form's order, or null when it can be sent.
String? validateSubmitPaper({
  required String title,
  required String doi,
  required String paperLink,
  required String abstractText,
  required String publicationYear,
  required String authors,
  required String keywords,
}) {
  final errors = submitPaperFieldErrors(
    title: title,
    doi: doi,
    paperLink: paperLink,
    abstractText: abstractText,
    publicationYear: publicationYear,
    authors: authors,
    keywords: keywords,
  );
  return errors.isEmpty ? null : errors.values.first;
}
