class ApiRoutes {
  ApiRoutes._();

  // Auth
  static const String authRegister = '/auth/register';
  static const String authLogin = '/auth/login';
  static const String authRefresh = '/auth/refresh';
  static const String authLogout = '/auth/logout';
  static const String authMe = '/auth/me';
  static const String authChangePassword = '/auth/change-password';
  static const String authRankingsTop = '/auth/rankings/top';
  static const String authRankingsMe = '/auth/rankings/me';

  // Papers
  static const String papersList = '/papers';
  static const String papersCreate = '/papers';
  static String papersDetail(String id) => '/papers/$id';
  static String papersReferences(String id) => '/papers/$id/references';
  static const String papersMyRequests = '/papers/my-requests';
  static String papersUploadPdf(String id) => '/papers/$id/upload-pdf';
  static String papersAcceptPdf(String id) => '/papers/$id/accept-pdf';
  static String papersRejectPdf(String id) => '/papers/$id/reject-pdf';
  static String papersCancel(String id) => '/papers/$id/cancel';
  static String papersUpdate(String id) => '/papers/$id';

  // Search
  static const String searchSemantic = '/search';

  // Trends
  static const String trendsOverview = '/trends';
  static const String trendsCompare = '/trends/compare';
  static const String trendsTopicCandidates = '/trends/topic-candidates';
  static const String trendsRelationships = '/trends/relationships';
  static const String trendsExplain = '/trends/explain';
  static const String trendsExplainHistory = '/trends/explain/history';
  static String trendsTopic(String topic) =>
      '/trends/${Uri.encodeComponent(topic)}';

  // Quality
  static String qualityView(String targetKind, String targetId) =>
      '/quality/$targetKind/$targetId';
  static const String qualityEvaluate = '/quality/evaluate';
  static const String qualityRate = '/quality/rate';
  static String qualityDeleteRate(String ratingId) => '/quality/rate/$ratingId';

  // Reports
  static const String reportsList = '/reports';
  static const String reportsEvidencePreview = '/reports/evidence-preview';
  static String reportsDetail(String id) => '/reports/$id';
  static const String reportsCreate = '/reports';
  static String reportsDelete(String id) => '/reports/$id';

  // Bookmarks
  static const String bookmarksList = '/bookmarks';
  static const String bookmarksCreate = '/bookmarks';
  static String bookmarksDelete(String id) => '/bookmarks/$id';
  static const String bookmarksCheck = '/bookmarks/check';
  static String bookmarksUpdateNote(String id) => '/bookmarks/$id';

  // Notifications
  static const String notificationsList = '/notifications';
  static const String notificationsRegisterDeviceToken =
      '/notifications/device-token';
  static String notificationsMarkRead(String id) => '/notifications/$id/read';
  static const String notificationsMarkAllRead = '/notifications/read-all';

  // Analytics
  static const String analyticsSummary = '/analytics/search/summary';

  // Gaps
  static const String gapsAnalyze = '/gaps/analyze';
  static String gapsAnalyzeStatus(String id) => '/gaps/analyze/$id';
  static const String gapsList = '/gaps';
  static String gapsPatch(String id) => '/gaps/$id';

  // Projects
  static const String projectsList = '/projects';
  static const String projectsCreate = '/projects';
  static String projectsDetail(String id) => '/projects/$id';
  static String projectsUpdate(String id) => '/projects/$id';
  static String projectsDelete(String id) => '/projects/$id';
  static String projectsAddPaper(String id) => '/projects/$id/papers';
  static String projectsRemovePaper(String id, String paperId) =>
      '/projects/$id/papers/$paperId';
  static String projectsAddMember(String id) => '/projects/$id/members';
  static String projectsRemoveMember(String id, String memberId) =>
      '/projects/$id/members/$memberId';
  static String projectsChatSend(String id) => '/projects/$id/chat';
  static String projectsChatHistory(String id) => '/projects/$id/chat';
  static String projectsChatPin(String id, String messageId) =>
      '/projects/$id/chat/$messageId/pin';
  static String projectsTeamChat(String id) => '/projects/$id/team-chat';
  static String projectsTeamChatRead(String id, String messageId) =>
      '/projects/$id/team-chat/$messageId/read';
  static String projectsTeamChatMessage(String id, String messageId) =>
      '/projects/$id/team-chat/$messageId';

  // Admin
  static const String adminSync = '/admin/sync';
  static const String adminSyncRuns = '/admin/sync/runs';
  static const String adminEmbed = '/admin/embed';
  static const String adminEmbedStatus = '/admin/embed/status';
  static const String adminPipelineStatus = '/admin/pipeline/status';
  static const String adminEvaluationSummary = '/admin/evaluation/summary';
  static const String adminStats = '/admin/stats';
}
