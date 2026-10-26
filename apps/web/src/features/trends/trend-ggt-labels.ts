import type { TrendGgtClass } from "@trend/shared-types";

/**
 * Nelis threshold bands, described by their bounds only. The paper's names
 * ("Consistent growth", …) claim a stability the paper's 50% rule would have
 * to confirm; that rule is not applied (stabilityChecked = false), so those
 * names are never shown as a conclusion (P2.2). The API keeps the codes.
 */
export const GGT_THRESHOLD_BAND_LABEL: Record<TrendGgtClass, string> = {
  consistent_decrease: "Mean GGT below −10%",
  no_consistent_growth: "Mean GGT between −5% and 5%",
  consistent_growth: "Mean GGT between 5% and 15%",
  consistent_strong_growth: "Mean GGT between 15% and 40%",
  consistent_intense_growth: "Mean GGT between 40% and 80%",
  unsustainable_growth: "Mean GGT above 80%",
  unclassified: "Between the threshold bands of the paper",
};

