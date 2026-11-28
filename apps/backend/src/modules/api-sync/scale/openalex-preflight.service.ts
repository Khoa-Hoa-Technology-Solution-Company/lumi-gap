import crypto from "node:crypto";

import { AppError } from "../../../common/exceptions/app-error.js";
import { buildOpenAlexPageUrl, fetchOpenAlexGroupCounts } from "../providers/openalex.client.js";
import { hasApiKey } from "../../api-keys/api-key-pool.js";

const ELIGIBILITY_FILTER = "has_abstract:true";

/**
 * Provider-side gate before planning a long campaign. It returns only a
 * reproducible population snapshot; it deliberately creates no campaign and
 * downloads no work records.
 */
export const openAlexPreflightService = {
  async run() {
    if (!await hasApiKey("OPENALEX")) {
      throw AppError.conflict("An OpenAlex API key (Admin → API Keys or OPENALEX_API_KEY) is required before OpenAlex preflight can run");
    }

    const contractUrl = buildOpenAlexPageUrl({
      filterExpression: ELIGIBILITY_FILTER,
      cursor: "*",
      perPage: 100,
    });
    const snapshot = await fetchOpenAlexGroupCounts({
      filterExpression: ELIGIBILITY_FILTER,
      groupBy: "primary_topic.domain.id",
    });
    if (snapshot.groups.length === 0 || snapshot.total <= 0) {
      throw AppError.conflict("OpenAlex preflight returned no eligible works; campaign planning is blocked");
    }

    return {
      provider: "openalex" as const,
      planningAsOf: new Date().toISOString(),
      eligibilityFilter: ELIGIBILITY_FILTER,
      providerContract: {
        perPage: Number(contractUrl.searchParams.get("per_page")),
        hasApiKey: contractUrl.searchParams.has("api_key"),
        hasMailto: contractUrl.searchParams.has("mailto"),
      },
      population: {
        total: snapshot.total,
        domains: snapshot.groups.map((group) => ({
          openAlexId: group.key,
          name: group.displayName ?? group.key,
          count: group.count,
        })),
      },
      snapshotFingerprint: crypto
        .createHash("sha256")
        .update(JSON.stringify({ filter: ELIGIBILITY_FILTER, groups: snapshot.groups }))
        .digest("hex"),
    };
  },
};
