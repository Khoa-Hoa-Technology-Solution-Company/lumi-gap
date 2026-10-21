export interface GithubConnectionStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  expiresAt: string | null;
  installUrl: string | null;
}
export interface GithubRepositoryOption {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  writable: boolean;
}
export interface GithubRepositories {
  repositories: GithubRepositoryOption[];
  page: number;
  hasMore: boolean;
}
