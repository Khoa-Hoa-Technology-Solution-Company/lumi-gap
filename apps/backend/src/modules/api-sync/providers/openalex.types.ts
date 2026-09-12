/**
 * Minimal typing of the OpenAlex `Work` object — only the fields we read.
 * Everything is optional because the normalizer must be permissive: a missing
 * field becomes undefined rather than throwing.
 * Ref: https://docs.openalex.org/api-entities/works/work-object
 */
export interface OpenAlexWork {
  id?: string; // "https://openalex.org/W2741809807"
  doi?: string | null; // "https://doi.org/10.7717/peerj.4375"
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null; // "2018-02-13"
  language?: string | null;
  type?: string | null; // "article", "review", "preprint", ...
  cited_by_count?: number | null;
  fwci?: number | null;
  citation_normalized_percentile?: {
    value?: number | null;
    is_in_top_1_percent?: boolean | null;
    is_in_top_10_percent?: boolean | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  referenced_works?: string[] | null; // ["https://openalex.org/W123", ...]
  related_works?: string[] | null; // ["https://openalex.org/W456", ...]
  authorships?: OpenAlexAuthorship[];
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: {
    is_oa?: boolean;
    oa_status?: string; // "gold" | "green" | "hybrid" | "bronze" | "closed" | "diamond"
    oa_url?: string | null;
  } | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[];
  keywords?: { id?: string; display_name?: string; score?: number }[];
}

export interface OpenAlexTopic {
  id?: string;
  display_name?: string;
  score?: number;
  subfield?: OpenAlexTopicLevel | null;
  field?: OpenAlexTopicLevel | null;
  domain?: OpenAlexTopicLevel | null;
}

export interface OpenAlexTopicLevel {
  id?: string;
  display_name?: string;
}

export interface OpenAlexAuthorship {
  author_position?: string; // "first" | "middle" | "last"
  is_corresponding?: boolean;
  author?: { id?: string; display_name?: string; orcid?: string | null };
  institutions?: { display_name?: string; country_code?: string; ror?: string }[];
}

export interface OpenAlexLocation {
  is_oa?: boolean;
  license?: string | null;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: {
    id?: string;
    display_name?: string;
    issn_l?: string | null;
    issn?: string[] | null;
    host_organization_name?: string | null;
    type?: string;
    is_oa?: boolean;
  } | null;
}

export interface OpenAlexPage {
  meta: { count: number; next_cursor: string | null; per_page: number };
  results: OpenAlexWork[];
}

export interface OpenAlexGroupPage {
  meta: { count: number; per_page: number };
  group_by: Array<{ key: string; key_display_name?: string; count: number }>;
}
