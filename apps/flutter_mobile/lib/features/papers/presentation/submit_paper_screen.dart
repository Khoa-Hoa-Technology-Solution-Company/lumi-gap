import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_mobile/features/papers/data/papers_api.dart';
import 'package:flutter_mobile/features/papers/domain/submit_paper_validation.dart';
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
      _show('PDF must be 10MB or smaller.');
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
    final error = validateSubmitPaper(
      title: title.text,
      doi: doi.text,
      paperLink: paperLink.text,
      abstractText: abstractText.text,
      publicationYear: year.text,
      authors: authors.text,
      keywords: keywords.text,
    );
    if (error != null) {
      _show(error);
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
      if (mounted) context.go('/my-papers');
    } on Object catch (e) {
      _show(e.toString());
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
      title.text = 'Attention Is All You Need';
      doi.text = '10.48550/arXiv.1706.03762';
      paperLink.text = 'https://arxiv.org/abs/1706.03762';
      abstractText.text = 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.';
      year.text = '2017';
      paperKind = 'preprint';
      authors.text = 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, Illia Polosukhin';
      keywords.text = 'attention mechanism, transformer, deep learning, NLP';
      topics.text = 'Deep Learning, Natural Language Processing';
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
        title: Text(widget.editId == null ? 'Submit Paper' : 'Resubmit Paper'),
        centerTitle: false,
        scrolledUnderElevation: 0,
        actions: [
          if (widget.editId == null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: _autoFillTestData,
                icon: const Icon(Icons.auto_awesome, size: 16, color: Color(0xFF06B6D4)),
                label: const Text(
                  'Fill Test',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF06B6D4),
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
              gradient: LinearGradient(
                colors: [
                  colors.primary.withValues(alpha: .10),
                  colors.secondary.withValues(alpha: .06),
                ],
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: colors.primary.withValues(alpha: .16)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.upload_file_rounded,
                    color: Colors.white,
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
                            ? 'Direct submission'
                            : 'Fix and resubmit',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Your paper will stay pending until an admin completes the review.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const _SectionTitle(
            icon: Icons.description_outlined,
            title: 'Paper information',
            subtitle: 'Add the publication details',
          ),
          const SizedBox(height: 10),
          _FormCard(
            children: [
              _Field(
                label: 'Paper title',
                hint: 'Enter the full paper title',
                controller: title,
                icon: Icons.title_rounded,
              ),
              _Field(
                label: 'DOI',
                hint: '10.xxxx/xxxxx',
                controller: doi,
                icon: Icons.fingerprint_rounded,
              ),
              _Field(
                label: 'Paper link',
                hint: 'https://…',
                controller: paperLink,
                icon: Icons.link_rounded,
                keyboardType: TextInputType.url,
              ),
              _Field(
                label: 'Abstract',
                hint: 'Summarize the purpose, method, and findings…',
                helper: '${countWords(abstractText.text)} / 350 words',
                controller: abstractText,
                maxLines: 6,
                onChanged: (_) => setState(() {}),
              ),
              _Field(
                label: 'Publication year',
                controller: year,
                icon: Icons.calendar_today_outlined,
                keyboardType: TextInputType.number,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Publication type',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
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
                labelStyle: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11),
                ),
                onSelected: (_) => setState(() => paperKind = kind),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
          const _SectionTitle(
            icon: Icons.hub_outlined,
            title: 'Research metadata',
            subtitle: 'Separate multiple values with commas',
          ),
          const SizedBox(height: 10),
          _FormCard(
            children: [
              _Field(
                label: 'Authors',
                hint: 'Nguyen Van A, Tran Thi B',
                controller: authors,
                icon: Icons.people_outline_rounded,
              ),
              _Field(
                label: 'Keywords',
                hint: 'machine learning, RAG, education',
                controller: keywords,
                icon: Icons.tag_rounded,
              ),
              _Field(
                label: 'Topics',
                hint: 'Academic search, Trend analysis',
                controller: topics,
                icon: Icons.category_outlined,
              ),
              _Field(
                label: 'Open access URL',
                hint: 'https://…',
                controller: openAccessUrl,
                icon: Icons.public_rounded,
                keyboardType: TextInputType.url,
              ),
            ],
          ),
          const SizedBox(height: 24),
          const _SectionTitle(
            icon: Icons.picture_as_pdf_outlined,
            title: 'Paper file',
            subtitle: 'Optional PDF, maximum 10 MB',
          ),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _pickPdf,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(16),
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
                      borderRadius: BorderRadius.circular(12),
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
                          pdf?.name ?? 'Choose a PDF file',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          pdf == null
                              ? 'Tap to browse files'
                              : 'Ready to upload',
                          style: TextStyle(
                            fontSize: 11,
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
                        : const Color(0xFF16845B),
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
                borderRadius: BorderRadius.circular(15),
              ),
            ),
            icon: submitting
                ? const SizedBox.square(
                    dimension: 19,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.send_rounded, size: 20),
            label: Text(
              widget.editId == null
                  ? 'Submit for review'
                  : 'Resubmit for review',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  String _kindLabel(String kind) {
    if (kind == 'book-chapter') return 'Book chapter';
    return '${kind[0].toUpperCase()}${kind.substring(1)}';
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    this.hint,
    this.helper,
    this.icon,
    this.maxLines = 1,
    this.keyboardType,
    this.onChanged,
  });

  final String label;
  final String? hint;
  final String? helper;
  final IconData? icon;
  final TextEditingController controller;
  final int maxLines;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        keyboardType: keyboardType,
        onChanged: onChanged,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          helperStyle: const TextStyle(fontSize: 10),
          alignLabelWithHint: maxLines > 1,
          prefixIcon: icon == null ? null : Icon(icon, size: 19),
          filled: true,
          fillColor: Theme.of(context).colorScheme.surfaceContainerLowest,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 15,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: BorderSide(
              color: Theme.of(context).colorScheme.primary,
              width: 1.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _FormCard extends StatelessWidget {
  const _FormCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 16, 14, 2),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
    ),
    child: Column(children: children),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, size: 19, color: colors.primary),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
            Text(
              subtitle,
              style: TextStyle(fontSize: 11, color: colors.onSurfaceVariant),
            ),
          ],
        ),
      ],
    );
  }
}
