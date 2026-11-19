import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/theme/app_typography.dart';

// The building blocks of the submit paper form.

class SubmitField extends StatelessWidget {
  const SubmitField({
    required this.label,
    required this.controller,
    this.hint,
    this.helper,
    this.icon,
    this.maxLines = 1,
    this.keyboardType,
    this.onChanged,
    this.errorText,
    super.key,
  });

  final String label;
  final String? hint;
  final String? helper;
  final IconData? icon;
  final TextEditingController controller;
  final int maxLines;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;

  /// Shown under the field, in place of the helper.
  final String? errorText;

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
          errorText: errorText,
          errorMaxLines: 3,
          helperStyle: context.type.bodySmall,
          alignLabelWithHint: maxLines > 1,
          prefixIcon: icon == null ? null : Icon(icon, size: 19),
          filled: true,
          fillColor: Theme.of(context).colorScheme.surfaceContainerLowest,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 15,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
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

class SubmitFormCard extends StatelessWidget {
  const SubmitFormCard({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 16, 14, 2),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
    ),
    child: Column(children: children),
  );
}

class SubmitSectionTitle extends StatelessWidget {
  const SubmitSectionTitle({
    required this.icon,
    required this.title,
    required this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: colors.primary),
        const SizedBox(width: 8),
        // Expanded: a long subtitle wraps instead of overflowing.
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              Text(
                subtitle,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: colors.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
