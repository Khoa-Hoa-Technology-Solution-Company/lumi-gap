import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/errors/failure_message.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/domain/submit_paper_validation.dart';
import 'package:flutter_mobile/features/papers/presentation/submit_paper_parts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class SubmitPaperScreen extends ConsumerStatefulWidget {
  const SubmitPaperScreen({super.key, this.editId});

  final String? editId;

  @override
  ConsumerState<SubmitPaperScreen> createState() => _SubmitPaperScreenState();
}

class _SubmitPaperScreenState extends ConsumerState<SubmitPaperScreen> {
  final title = TextEditingController();
  final doi = TextEditingController();
  final paperLink = TextEditingController();
  final abstractText = TextEditingController();
  final year = TextEditingController(text: DateTime.now().year.toString());
  final authors = TextEditingController();
  final keywords = TextEditingController();
  final topics = TextEditingController();
  final openAccessUrl = TextEditingController();
  String paperKind = 'article';
  PaperSubmitFile? pdf;
  bool submitting = false;

  /// True after the first attempt to send: errors show under the fields
  /// from then on, and update as the reader fixes them.
  bool _showErrors = false;

  Map<String, String> get _errors => submitPaperFieldErrors(
        title: title.text,
        doi: doi.text,
        paperLink: paperLink.text,
        abstractText: abstractText.text,
        publicationYear: year.text,
        authors: authors.text,
        keywords: keywords.text,
      );

  String? _errorOf(String field) {
    if (!_showErrors) return null;
    final key = _errors[field];
    return key == null ? null : context.t(key);
  }

  void _edited(String _) {
    if (_showErrors) setState(() {});
  }

  @override
  void dispose() {
    for (final controller in [
      title,
      doi,
      paperLink,
      abstractText,
      year,
      authors,
      keywords,
      topics,
      openAccessUrl,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
    );
    final file = result?.files.single;
    if (file == null || file.path == null) return;
    if ((file.size) > 10 * 1024 * 1024) {
      if (!mounted) return;
      _show(context.t('PDF must be 10MB or smaller.'));
      return;
    }
    setState(
      () => pdf = PaperSubmitFile(
        path: file.path!,
        name: file.name,
        mimeType: 'application/pdf',
      ),
    );
  }

  Future<void> _submit() async {
    if (submitting) return;
    if (_errors.isNotEmpty) {
      setState(() => _showErrors = true);
      _show(context.t('Please fix the errors under the fields.'));
      return;
    }
    setState(() => submitting = true);
    final input = SubmitPaperInput(
      title: title.text,
      doi: doi.text,
      paperLink: paperLink.text,
      abstractText: abstractText.text,
      publicationYear: int.parse(year.text),
      paperKind: paperKind,
      authors: csvList(authors.text),
      keywords: csvList(keywords.text),
      topics: csvList(topics.text),
      openAccessUrl: openAccessUrl.text,
      pdf: pdf,
    );
    try {
      if (widget.editId == null) {
        await ref.read(papersApiProvider).create(input);
      } else {
        await ref.read(papersApiProvider).update(widget.editId!, input);
      }
      ref.invalidate(myPapersProvider);
      // Replace, not go: Back then returns to where the reader came from,
      // never to the form that was just sent.
      if (mounted) context.pushReplacement('/my-papers');
    } on Object catch (e) {
      if (mounted) _show(context.t(failureMessageKey(e)));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  void _show(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _autoFillTestData() {
    setState(() {
      // i18n-ignore-start: sample paper used to prefill the demo form
      title.text = 'Attention Is All You Need';
      doi.text = '10.48550/arXiv.1706.03762';
      paperLink.text = 'https://arxiv.org/abs/1706.03762';
      abstractText.text = 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.';
      year.text = '2017';
      paperKind = 'preprint';
      authors.text = 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, Illia Polosukhin';
      keywords.text = 'attention mechanism, transformer, deep learning, NLP';
      topics.text = 'Deep Learning, Natural Language Processing';
      // i18n-ignore-end
      openAccessUrl.text = 'https://arxiv.org/pdf/1706.03762.pdf';
    });
  }

  @override
  Widget build(BuildContext context) {
    final kinds = [
      'article',
      'proceedings',
      'preprint',
      'review',
      'book-chapter',
      'other',
    ];
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.editId == null ? context.t('Submit Paper') : context.t('Resubmit Paper')),
        centerTitle: false,
        scrolledUnderElevation: 0,
        actions: [
          // Sample data for demos and manual testing; never in a release
          // build, where it would put someone else's paper in the form.
          if (kDebugMode && widget.editId == null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: _autoFillTestData,
                icon: Icon(Icons.summarize_outlined, size: 16, color: context.lumi.primary),
                label: Text(
                  context.t('Fill Test'),
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: context.lumi.primary,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.lumi.primarySoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: context.lumi.line),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.primary,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.upload_file_rounded,
                    color: context.lumi.onPrimary,
                    size: 21,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.editId == null
                            ? context.t('Direct submission')
                            : context.t('Fix and resubmit'),
                        style: context.type.bodyLarge!.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.t('Your paper will stay pending until an admin completes the review.'),
                        style: context.type.bodySmall!.copyWith(
                          height: 1.4,
                          // On `primarySoft`: `muted` is under 4.5:1 there.
                          color: context.lumi.foregroundSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          SubmitSectionTitle(
            icon: Icons.description_outlined,
            title: context.t('Paper information'),
            subtitle: context.t('Add the publication details'),
          ),
          const SizedBox(height: 10),
          SubmitFormCard(
            children: [
              SubmitField(
                label: context.t('Paper title'),
                errorText: _errorOf('title'),
                onChanged: _edited,
                hint: context.t('Enter the full paper title'),
                controller: title,
                icon: Icons.title_rounded,
              ),
              SubmitField(
                label: context.t('DOI'),
                errorText: _errorOf('doi'),
                onChanged: _edited,
                hint: context.t('10.xxxx/xxxxx'),
                controller: doi,
                icon: Icons.fingerprint_rounded,
              ),
              SubmitField(
                label: context.t('Paper link'),
                errorText: _errorOf('paperLink'),
                onChanged: _edited,
                hint: context.t('https://…'),
                controller: paperLink,
                icon: Icons.link_rounded,
                keyboardType: TextInputType.url,
              ),
              SubmitField(
                label: context.t('Abstract'),
                errorText: _errorOf('abstract'),
                hint: context.t('Summarize the purpose, method, and findings…'),
                helper: context.t('{{count}} / 350 words', {'count': countWords(abstractText.text)}),
                controller: abstractText,
                maxLines: 6,
                onChanged: (_) => setState(() {}),
              ),
              SubmitField(
                label: context.t('Publication year'),
                errorText: _errorOf('year'),
                onChanged: _edited,
                controller: year,
                icon: Icons.calendar_today_outlined,
                keyboardType: TextInputType.number,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            context.t('Publication type'),
            style: context.type.bodyMedium!.copyWith(
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 9),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: kinds.map((kind) {
              final selected = paperKind == kind;
              return ChoiceChip(
                label: Text(_kindLabel(kind)),
                selected: selected,
                showCheckmark: selected,
                side: BorderSide(
                  color: selected ? colors.primary : colors.outlineVariant,
                ),
                selectedColor: colors.primaryContainer,
                backgroundColor: colors.surface,
                labelStyle: context.type.bodySmall!.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                onSelected: (_) => setState(() => paperKind = kind),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
          SubmitSectionTitle(
            icon: Icons.hub_outlined,
            title: context.t('Research metadata'),
            subtitle: context.t('Separate multiple values with commas'),
          ),
          const SizedBox(height: 10),
          SubmitFormCard(
            children: [
              SubmitField(
                label: context.t('Authors'),
                errorText: _errorOf('authors'),
                onChanged: _edited,
                hint: context.t('Nguyen Van A, Tran Thi B'),
                controller: authors,
                icon: Icons.people_outline_rounded,
              ),
              SubmitField(
                label: context.t('Keywords'),
                errorText: _errorOf('keywords'),
                onChanged: _edited,
                hint: context.t('machine learning, RAG, education'),
                controller: keywords,
                icon: Icons.tag_rounded,
              ),
              SubmitField(
                label: context.t('Topics'),
                hint: context.t('Academic search, Trend analysis'),
                controller: topics,
                icon: Icons.category_outlined,
              ),
              SubmitField(
                label: context.t('Open access URL'),
                hint: context.t('https://…'),
                controller: openAccessUrl,
                icon: Icons.public_rounded,
                keyboardType: TextInputType.url,
              ),
            ],
          ),
          const SizedBox(height: 24),
          SubmitSectionTitle(
            icon: Icons.picture_as_pdf_outlined,
            title: context.t('Paper file'),
            subtitle: context.t('Optional PDF, maximum 10 MB'),
          ),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: _pickPdf,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: pdf == null
                      ? colors.outlineVariant
                      : colors.primary.withValues(alpha: .45),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: colors.error.withValues(alpha: .08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.picture_as_pdf_rounded,
                      color: colors.error,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          pdf?.name ?? context.t('Choose a PDF file'),
                          overflow: TextOverflow.ellipsis,
                          style: context.type.bodyMedium!.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          pdf == null
                              ? context.t('Tap to browse files')
                              : context.t('Ready to upload'),
                          style: context.type.bodySmall!.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    pdf == null
                        ? Icons.add_circle_outline_rounded
                        : Icons.check_circle_rounded,
                    color: pdf == null
                        ? colors.primary
                        : context.lumi.success,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 26),
          FilledButton.icon(
            onPressed: submitting ? null : _submit,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(54),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            icon: submitting
                ? SizedBox.square(
                    dimension: 19,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: context.lumi.onPrimary,
                    ),
                  )
                : const Icon(Icons.send_rounded, size: 20),
            label: Text(
              widget.editId == null
                  ? context.t('Submit for review')
                  : context.t('Resubmit for review'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  String _kindLabel(String kind) {
    if (kind == 'book-chapter') return context.t('Book chapter');
    return '${kind[0].toUpperCase()}${kind.substring(1)}';
  }
}
