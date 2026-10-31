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

export interface CreateGithubRepoInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
  projectId?: string;
}

export interface CreatedGithubRepo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}
export interface InitializeGithubRepoInput {
  repository: string;
  branch: string;
  projectId: string;
}

export interface ManuscriptRemoteHistoryEntry {
  id: string;
  eventType: string;
  currentVersionRef: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
  metadata: Record<string, unknown>;
}
