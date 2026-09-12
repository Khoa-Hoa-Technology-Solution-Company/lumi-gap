// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'papers_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_PaperExternalIds _$PaperExternalIdsFromJson(Map<String, dynamic> json) =>
    _PaperExternalIds(
      doi: json['doi'] as String?,
      openalexId: json['openalexId'] as String?,
      semanticScholarId: json['semanticScholarId'] as String?,
      arxivId: json['arxivId'] as String?,
      pubmedId: json['pubmedId'] as String?,
    );

Map<String, dynamic> _$PaperExternalIdsToJson(_PaperExternalIds instance) =>
    <String, dynamic>{
      'doi': instance.doi,
      'openalexId': instance.openalexId,
      'semanticScholarId': instance.semanticScholarId,
      'arxivId': instance.arxivId,
      'pubmedId': instance.pubmedId,
    };

_PaperAuthorRef _$PaperAuthorRefFromJson(Map<String, dynamic> json) =>
    _PaperAuthorRef(
      displayName: json['displayName'] as String,
      position: (json['position'] as num).toInt(),
      authorId: json['authorId'] as String?,
      isCorresponding: json['isCorresponding'] as bool?,
    );

Map<String, dynamic> _$PaperAuthorRefToJson(_PaperAuthorRef instance) =>
    <String, dynamic>{
      'displayName': instance.displayName,
      'position': instance.position,
      'authorId': instance.authorId,
      'isCorresponding': instance.isCorresponding,
    };

_PaperKeyword _$PaperKeywordFromJson(Map<String, dynamic> json) =>
    _PaperKeyword(
      keywordName: json['keywordName'] as String,
      keywordId: json['keywordId'] as String?,
      detectedBy: json['detectedBy'] as String?,
      confidence: (json['confidence'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$PaperKeywordToJson(_PaperKeyword instance) =>
    <String, dynamic>{
      'keywordName': instance.keywordName,
      'keywordId': instance.keywordId,
      'detectedBy': instance.detectedBy,
      'confidence': instance.confidence,
    };

_PaperTopic _$PaperTopicFromJson(Map<String, dynamic> json) => _PaperTopic(
  topicName: json['topicName'] as String,
  topicId: json['topicId'] as String?,
  openalexTopicId: json['openalexTopicId'] as String?,
  detectedBy: json['detectedBy'] as String?,
  confidence: (json['confidence'] as num?)?.toDouble(),
  isPrimary: json['isPrimary'] as bool?,
  subfieldId: json['subfieldId'] as String?,
  subfieldName: json['subfieldName'] as String?,
  fieldId: json['fieldId'] as String?,
  fieldName: json['fieldName'] as String?,
  domainId: json['domainId'] as String?,
  domainName: json['domainName'] as String?,
);

Map<String, dynamic> _$PaperTopicToJson(_PaperTopic instance) =>
    <String, dynamic>{
      'topicName': instance.topicName,
      'topicId': instance.topicId,
      'openalexTopicId': instance.openalexTopicId,
      'detectedBy': instance.detectedBy,
      'confidence': instance.confidence,
      'isPrimary': instance.isPrimary,
      'subfieldId': instance.subfieldId,
      'subfieldName': instance.subfieldName,
      'fieldId': instance.fieldId,
      'fieldName': instance.fieldName,
      'domainId': instance.domainId,
      'domainName': instance.domainName,
    };

_Paper _$PaperFromJson(Map<String, dynamic> json) => _Paper(
  id: json['id'] as String,
  title: json['title'] as String,
  publicationYear: (json['publicationYear'] as num).toInt(),
  citationCount: (json['citationCount'] as num).toInt(),
  dataStatus: json['dataStatus'] as String,
  dataQualityScore: (json['dataQualityScore'] as num).toDouble(),
  isAiAnalyzable: json['isAiAnalyzable'] as bool,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  abstractText: json['abstractText'] as String?,
  externalIds: json['externalIds'] == null
      ? const PaperExternalIds()
      : PaperExternalIds.fromJson(json['externalIds'] as Map<String, dynamic>),
  authors:
      (json['authors'] as List<dynamic>?)
          ?.map((e) => PaperAuthorRef.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  journalName: json['journalName'] as String?,
  paperKind: json['paperKind'] as String?,
  language: json['language'] as String?,
  openAccessStatus: json['openAccessStatus'] as String?,
  openAccessUrl: json['openAccessUrl'] as String?,
  licenseName: json['licenseName'] as String?,
  keywords:
      (json['keywords'] as List<dynamic>?)
          ?.map((e) => PaperKeyword.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  topics:
      (json['topics'] as List<dynamic>?)
          ?.map((e) => PaperTopic.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  fwci: (json['fwci'] as num?)?.toDouble(),
  relatedWorksCount: (json['relatedWorksCount'] as num?)?.toInt(),
  primaryProvider: json['primaryProvider'] as String?,
  downloadCost: (json['downloadCost'] as num?)?.toDouble(),
  uploadCreditReward: (json['uploadCreditReward'] as num?)?.toDouble(),
  pdfPath: json['pdfPath'] as String?,
  paperLink: json['paperLink'] as String?,
  paperStatus: json['paperStatus'] as String?,
  rejectionReason: json['rejectionReason'] as String?,
);

Map<String, dynamic> _$PaperToJson(_Paper instance) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'publicationYear': instance.publicationYear,
  'citationCount': instance.citationCount,
  'dataStatus': instance.dataStatus,
  'dataQualityScore': instance.dataQualityScore,
  'isAiAnalyzable': instance.isAiAnalyzable,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'abstractText': instance.abstractText,
  'externalIds': instance.externalIds,
  'authors': instance.authors,
  'journalName': instance.journalName,
  'paperKind': instance.paperKind,
  'language': instance.language,
  'openAccessStatus': instance.openAccessStatus,
  'openAccessUrl': instance.openAccessUrl,
  'licenseName': instance.licenseName,
  'keywords': instance.keywords,
  'topics': instance.topics,
  'fwci': instance.fwci,
  'relatedWorksCount': instance.relatedWorksCount,
  'primaryProvider': instance.primaryProvider,
  'downloadCost': instance.downloadCost,
  'uploadCreditReward': instance.uploadCreditReward,
  'pdfPath': instance.pdfPath,
  'paperLink': instance.paperLink,
  'paperStatus': instance.paperStatus,
  'rejectionReason': instance.rejectionReason,
};
