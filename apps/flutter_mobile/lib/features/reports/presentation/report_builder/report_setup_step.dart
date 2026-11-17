import 'package:flutter/material.dart';
import 'package:flutter_mobile/core/i18n/i18n.dart';
import 'package:flutter_mobile/core/theme/lumi_colors.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_card.dart';
import 'package:flutter_mobile/core/widgets/lumi/lumi_text_field.dart';
import 'package:flutter_mobile/features/reports/data/reports_api.dart';

/// Same bounds as the API (`report.schema.ts`).
abstract final class ReportLimits {
  static const int queryMin = 3;
  static const int queryMax = 500;
  static const int topicMax = 200;
}

/// Error key for the research question, or null when it can be sent.
String? reportQueryError(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return tk('Enter a research question.');
  if (text.length < ReportLimits.queryMin) {
    return tk('Use at least 3 characters.');
  }
  if (text.length > ReportLimits.queryMax) {
    return tk('Use at most 500 characters.');
  }
  return null;
}

/// Step 1: what the report is about, its language and depth.
class ReportSetupStep extends StatelessWidget {
  const ReportSetupStep({
    required this.topic,
    required this.query,
    required this.language,
    required this.deepAnalysis,
    required this.loading,
    required this.showErrors,
    required this.onLanguage,
    required this.onDeepAnalysis,
    required this.onPreview,
    required this.onEdited,
    super.key,
  });

  final TextEditingController topic;
  final TextEditingController query;
  final ReportLanguage language;
  final bool deepAnalysis;
  final bool loading;

  /// True once the reader has tried to go on: errors show from then on.
  final bool showErrors;
  final ValueChanged<ReportLanguage> onLanguage;
  final ValueChanged<bool> onDeepAnalysis;
  final VoidCallback onPreview;
  final VoidCallback onEdited;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lumi = context.lumi;
    final queryError = showErrors ? reportQueryError(query.text) : null;

    return LumiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Topic and question'),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          LumiTextField(
            label: context.t('Topic'),
            controller: topic,
            enabled: !loading,
            maxLength: ReportLimits.topicMax,
            hintText: context.t('e.g. LLM in education...'),
            textInputAction: TextInputAction.next,
            onChanged: (_) => onEdited(),
          ),
          const SizedBox(height: 16),
          LumiTextField(
            label: context.t('Research question'),
            isRequired: true,
            controller: query,
            enabled: !loading,
            minLines: 3,
            maxLines: 5,
            maxLength: ReportLimits.queryMax,
            hintText: context.t(
              'What should the report answer?',
            ),
            errorText: queryError == null ? null : context.t(queryError),
            onChanged: (_) => onEdited(),
          ),
          const SizedBox(height: 16),
          Text(context.t('Report language'), style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          DropdownButtonFormField<ReportLanguage>(
            isExpanded: true,
            initialValue: language,
            items: [
              DropdownMenuItem(
                value: ReportLanguage.auto,
                child: Text(context.t('Auto-detect Language')),
              ),
              DropdownMenuItem(
                value: ReportLanguage.en,
                child: Text(context.t('English')),
              ),
              DropdownMenuItem(
                value: ReportLanguage.vi,
                child: Text(context.t('Vietnamese')),
              ),
            ],
            onChanged: loading
                ? null
                : (v) {
                    if (v != null) onLanguage(v);
                  },
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: deepAnalysis,
            onChanged: loading ? null : onDeepAnalysis,
            title: Text(
              context.t('Deep Analysis'),
              style: theme.textTheme.titleSmall,
            ),
            subtitle: Text(
              context.t(
                'Searches further to find more evidence. Takes longer.',
              ),
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: lumi.foregroundSecondary),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: loading ? null : onPreview,
              child: loading
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: lumi.onPrimary,
                      ),
                    )
                  : Text(context.t('Preview Evidence Pack')),
            ),
          ),
        ],
      ),
    );
  }
}
