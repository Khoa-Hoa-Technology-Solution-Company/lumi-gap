import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tagKeys } from "./use-tags";
import { taxonomyKeys } from "./use-taxonomy";

/** Refetches every admin tag, taxonomy node and keyword query, e.g. after an import added papers. */
export function useRefreshCatalog() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: tagKeys.all });
    void qc.invalidateQueries({ queryKey: taxonomyKeys.all });
  }, [qc]);
}
