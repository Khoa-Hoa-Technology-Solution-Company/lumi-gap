import type { ISODateString } from "./common.js";

export interface AuthorAffiliation {
  name: string;
  country?: string;
  ror?: string; // Research Organization Registry ID
}

export interface Author {
  id: string;
  externalIds: {
    openalexId?: string;
    orcid?: string;
    scholarId?: string;
  };
  displayName: string;
  affiliations: AuthorAffiliation[];
  hIndex?: number;
  citedByCount?: number;
  worksCount?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
