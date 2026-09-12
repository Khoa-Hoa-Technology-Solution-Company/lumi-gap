/** ISO-8601 datetime string, e.g. "2026-05-25T10:30:00.000Z". */
export type ISODateString = string;

/** Standard envelope for all backend JSON responses. */
export type ApiResponse<T> =
  | { success: true; data: T; meta?: ResponseMeta }
  | { success: false; error: ApiError };

export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export type SortOrder = "asc" | "desc";

export interface SortOption<TField extends string = string> {
  field: TField;
  order: SortOrder;
}
