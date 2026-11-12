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

String? validateSubmitPaper({
  required String title,
  required String doi,
  required String paperLink,
  required String abstractText,
  required String publicationYear,
  required String authors,
  required String keywords,
}) {
  final cleanTitle = title.trim();
  if (cleanTitle.length < 8 || countWords(cleanTitle) < 3) {
    return tk('Title must be at least 8 characters and 3 words.');
  }

  if (!RegExp(r'^10\.\d{4,9}/\S+$', caseSensitive: false).hasMatch(doi.trim())) {
    return tk('Please enter a valid DOI.');
  }

  if (!RegExp('^https?://', caseSensitive: false).hasMatch(paperLink.trim())) {
    return tk('Paper link must be a valid URL.');
  }

  final abstractWords = countWords(abstractText);
  if (abstractWords < 50 || abstractWords > 350) {
    return tk('Abstract must be between 50 and 350 words.');
  }

  final year = int.tryParse(publicationYear.trim());
  final currentYear = DateTime.now().year;
  if (year == null || year < 1900 || year > currentYear) {
    return tk('Publication year is invalid.');
  }

  if (csvList(authors).isEmpty || csvList(keywords).isEmpty) {
    return tk('At least one author and one keyword are required.');
  }

  return null;
}
