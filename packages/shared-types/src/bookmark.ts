import type { ISODateString } from "./common.js";
import type { Paper } from "./paper.js";
import type { AnalyticalReport } from "./report.js";

export type BookmarkTargetKind = "paper" | "report";

export interface Bookmark {
  id: string;
  userId: string;
  targetKind: BookmarkTargetKind;
  targetId: string;
  note?: string | null;
  paperDetail?: Paper;
  reportDetail?: AnalyticalReport;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateBookmarkRequest {
  targetKind: BookmarkTargetKind;
  targetId: string;
  note?: string | null;
}
