import 'package:freezed_annotation/freezed_annotation.dart';

part 'api_envelope.freezed.dart';
part 'api_envelope.g.dart';

@freezed
abstract class ResponseMeta with _$ResponseMeta {
  const factory ResponseMeta({
    int? page,
    int? pageSize,
    int? totalItems,
    int? totalPages,
    bool? hasNextPage,
  }) = _ResponseMeta;

  factory ResponseMeta.fromJson(Map<String, dynamic> json) => _$ResponseMetaFromJson(json);
}

@freezed
abstract class ApiErrorDetail with _$ApiErrorDetail {
  const factory ApiErrorDetail({
    required String code,
    required String message,
    dynamic details,
  }) = _ApiErrorDetail;

  factory ApiErrorDetail.fromJson(Map<String, dynamic> json) => _$ApiErrorDetailFromJson(json);
}

@Freezed(genericArgumentFactories: true)
abstract class ApiResponse<T> with _$ApiResponse<T> {
  const factory ApiResponse({
    required bool success,
    T? data,
    ApiErrorDetail? error,
    ResponseMeta? meta,
  }) = _ApiResponse<T>;

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) =>
      _$ApiResponseFromJson(json, fromJsonT);
}
