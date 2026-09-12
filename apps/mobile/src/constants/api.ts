/**
 * Centralised list of backend route paths. Shared in spirit with the web app
 * but kept local to mobile so the apps can evolve independently if needed.
 */
export const API_ROUTES = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    changePassword: "/auth/change-password",
    rankingsTop: "/auth/rankings/top",
    rankingsMe: "/auth/rankings/me",
  },
  papers: {
    list: "/papers",
    create: "/papers",
    detail: (id: string) => `/papers/${id}`,
    references: (id: string) => `/papers/${id}/references`,
    myRequests: "/papers/my-requests",
    uploadPdf: (id: string) => `/papers/${id}/upload-pdf`,
    acceptPdf: (id: string) => `/papers/${id}/accept-pdf`,
    rejectPdf: (id: string) => `/papers/${id}/reject-pdf`,
    cancel: (id: string) => `/papers/${id}/cancel`,
    update: (id: string) => `/papers/${id}`,
  },
  search: {
    semantic: "/search", 
  },
  trends: {
    overview: "/trends",
    topic: (topic: string) => `/trends/${encodeURIComponent(topic)}`,
  },
  quality: {
    view: (targetKind: "report" | "gap" | "paper", targetId: string) => `/quality/${targetKind}/${targetId}`,
    evaluate: "/quality/evaluate",
    rate: "/quality/rate",
    deleteRate: (ratingId: string) => `/quality/rate/${ratingId}`,
  },
  reports: {
    list: "/reports",
    detail: (id: string) => `/reports/${id}`,
    create: "/reports",
    delete: (id: string) => `/reports/${id}`,
  },
  bookmarks: {
    list: "/bookmarks",
    create: "/bookmarks",
    delete: (id: string) => `/bookmarks/${id}`,
    check: "/bookmarks/check",
    updateNote: (id: string) => `/bookmarks/${id}`,
  },
  notifications: {
    list: "/notifications",
    registerDeviceToken: "/notifications/device-token",
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: "/notifications/read-all",
  },
  analytics: {
    summary: "/analytics/search/summary",
  },
  gaps: {
    analyze: "/gaps/analyze",
    analyzeStatus: (id: string) => `/gaps/analyze/${id}`,
    list: "/gaps",
    patch: (id: string) => `/gaps/${id}`,
  },
  projects: {
    list: "/projects",
    create: "/projects",
    detail: (id: string) => `/projects/${id}`,
    update: (id: string) => `/projects/${id}`,
    delete: (id: string) => `/projects/${id}`,
    addPaper: (id: string) => `/projects/${id}/papers`,
    removePaper: (id: string, paperId: string) => `/projects/${id}/papers/${paperId}`,
    addMember: (id: string) => `/projects/${id}/members`,
    removeMember: (id: string, memberId: string) => `/projects/${id}/members/${memberId}`,
    chat: {
      send: (id: string) => `/projects/${id}/chat`,
      history: (id: string) => `/projects/${id}/chat`,
    },
  },
  admin: {
    sync: "/admin/sync",
    syncRuns: "/admin/sync/runs",
  },
} as const;
