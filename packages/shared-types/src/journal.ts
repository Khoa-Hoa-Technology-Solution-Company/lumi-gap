import type { ISODateString } from "./common.js";

export interface Journal {
  id: string;
  externalIds: {
    openalexId?: string;
    issn?: string[];
    crossrefId?: string;
  };
  name: string;
  publisher?: string;
  type?: "journal" | "conference" | "repository" | "book-series" | "other";
  isOpenAccess?: boolean;
  homepageUrl?: string;
  worksCount?: number;
  citedByCount?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
