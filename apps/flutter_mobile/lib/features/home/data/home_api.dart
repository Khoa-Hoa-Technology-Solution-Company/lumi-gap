import 'package:dio/dio.dart';
import 'package:flutter_mobile/core/constants/api_routes.dart';
import 'package:flutter_mobile/core/network/api_client.dart';
import 'package:flutter_mobile/features/home/data/home_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final homeApiProvider = Provider<HomeApi>((ref) {
  return HomeApi(ref.watch(apiClientProvider).dio);
});

/// Two independent providers: a failure of one never takes the other down.
final FutureProvider<HomeOverview> homeOverviewProvider =
    FutureProvider.autoDispose<HomeOverview>((ref) {
      return ref.watch(homeApiProvider).getOverview();
    });

final FutureProvider<HomeResearchOverview> homeResearchProvider =
    FutureProvider.autoDispose<HomeResearchOverview>((ref) {
      return ref.watch(homeApiProvider).getResearch();
    });

class HomeApi {
  const HomeApi(this._dio);

  final Dio _dio;

  Future<HomeOverview> getOverview() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.homeOverview);
    return HomeOverview.fromJson(_data(res));
  }

  Future<HomeResearchOverview> getResearch() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiRoutes.homeResearch);
    return HomeResearchOverview.fromJson(_data(res));
  }

  Json _data(Response<Map<String, dynamic>> res) {
    final data = res.data?['data'];
    if (data is! Json) {
      throw const FormatException('Unexpected /home response');
    }
    return data;
  }
}
