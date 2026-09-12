export interface PaperRequester {
  _id: string;
  email?: string;
  fullName?: string;
  role?: string;
  avatarUrl?: string;
}

export type PaperRequesterValue = string | PaperRequester;

export function formatPaperRequester(requester: PaperRequesterValue | null | undefined): string | null {
  if (!requester) return null;
  if (typeof requester === "string") return requester;
  return requester.fullName?.trim() || requester.email?.trim() || requester._id;
}
