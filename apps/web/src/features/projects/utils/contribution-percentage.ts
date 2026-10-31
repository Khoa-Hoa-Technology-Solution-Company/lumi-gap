import {
  contributionCategories,
  defaultContributionCategoryWeights,
  type AllocationShareInput,
  type ContributionCategoryKey,
  type ContributionMatrixCategoryInput,
  type ContributionMatrixMemberBreakdown,
  type ContributionMatrixView,
} from "@trend/shared-types";

/** Parse user-entered percentages without floating-point rounding. */
export function percentBasisPoints(value: string): number | null {
  if (!/^(?:100|[0-9]{1,2})(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, decimals = ""] = value.split(".");
  const number = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return number <= 10000 ? number : null;
}

export function formatBasisPoints(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(basisPoints));
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  if (fraction === 0) return `${sign}${whole}%`;
  return `${sign}${whole}.${String(fraction).padStart(2, "0").replace(/0+$/, "")}%`;
}

export function basisPointsToInputString(basisPoints: number): string {
  const abs = Math.max(0, Math.trunc(basisPoints));
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0+$/, "")}`;
}

export const CONTRIBUTION_CATEGORY_META: Record<
  ContributionCategoryKey,
  { title: string; examples: string; defaultWeightBp: number }
> = {
  CONCEPTUALIZATION_METHODOLOGY: {
    title: "Conceptualization & Methodology",
    examples: "Research idea, questions, gap formulation, methodology design, research protocol",
    defaultWeightBp: defaultContributionCategoryWeights.CONCEPTUALIZATION_METHODOLOGY,
  },
  LITERATURE_DATA: {
    title: "Literature & Data",
    examples: "Literature review, paper screening, evidence extraction, dataset collection & curation",
    defaultWeightBp: defaultContributionCategoryWeights.LITERATURE_DATA,
  },
  EXECUTION_VALIDATION: {
    title: "Execution & Validation",
    examples: "Experiments, software implementation, statistical analysis, model evaluation, reproducibility",
    defaultWeightBp: defaultContributionCategoryWeights.EXECUTION_VALIDATION,
  },
  WRITING_REVISION: {
    title: "Writing & Revision",
    examples: "Manuscript drafting, academic writing, scientific revision, reviewer response, documentation",
    defaultWeightBp: defaultContributionCategoryWeights.WRITING_REVISION,
  },
};

export function createInitialMatrixCategories(
  rosterUserIds: string[],
  existingMatrix?: ContributionMatrixView | null,
): ContributionMatrixCategoryInput[] {
  return contributionCategories.map((category) => {
    const existing = existingMatrix?.categories.find((c) => c.category === category);
    const weightBasisPoints = existing ? existing.weightBasisPoints : defaultContributionCategoryWeights[category];
    return {
      category,
      weightBasisPoints,
      zeroWeightReason: existing?.zeroWeightReason ?? "",
      evidenceIds: existing?.evidenceIds ?? [],
      shares: rosterUserIds.map((userId) => {
        const existingShare = existing?.shares.find((s) => s.userId === userId);
        return {
          userId,
          basisPoints: existingShare?.basisPoints ?? (rosterUserIds.length === 1 && weightBasisPoints > 0 ? 10000 : 0),
          rationale: existingShare?.rationale ?? "",
        };
      }),
    };
  });
}

export interface ClientMatrixCalculation {
  totalWeightBasisPoints: number;
  weightsValid: boolean;
  categoryStatus: Record<
    ContributionCategoryKey,
    {
      weightBasisPoints: number;
      shareSumBasisPoints: number;
      sharesValid: boolean;
      zeroWeightValid: boolean;
    }
  >;
  memberTotals: ContributionMatrixMemberBreakdown[];
  shares: AllocationShareInput[];
  isCompleteAndValid: boolean;
}

export function computeClientContributionMatrix(
  rosterUserIds: string[],
  categories: ContributionMatrixCategoryInput[],
): ClientMatrixCalculation {
  const orderedCategories = contributionCategories.map((key) => {
    const found = categories.find((c) => c.category === key);
    return (
      found ?? {
        category: key,
        weightBasisPoints: defaultContributionCategoryWeights[key],
        zeroWeightReason: "",
        evidenceIds: [],
        shares: rosterUserIds.map((userId) => ({ userId, basisPoints: 0, rationale: "" })),
      }
    );
  });

  const totalWeightBasisPoints = orderedCategories.reduce((sum, c) => sum + c.weightBasisPoints, 0);
  const weightsValid =
    totalWeightBasisPoints === 10000
    && orderedCategories.every(
      (c) => Number.isInteger(c.weightBasisPoints) && c.weightBasisPoints >= 0 && c.weightBasisPoints <= 10000,
    );

  const categoryStatus = {} as ClientMatrixCalculation["categoryStatus"];
  let allCategoriesValid = true;

  for (const cat of orderedCategories) {
    const shareSumBasisPoints = rosterUserIds.reduce((sum, userId) => {
      const entry = cat.shares.find((s) => s.userId === userId);
      return sum + (entry?.basisPoints ?? 0);
    }, 0);
    const individualValid = rosterUserIds.every((userId) => {
      const entry = cat.shares.find((s) => s.userId === userId);
      return entry !== undefined && Number.isInteger(entry.basisPoints) && entry.basisPoints >= 0 && entry.basisPoints <= 10000;
    });
    const sharesValid =
      individualValid && (cat.weightBasisPoints === 0 ? shareSumBasisPoints === 0 : shareSumBasisPoints === 10000);
    const zeroWeightValid = cat.weightBasisPoints > 0 || (cat.zeroWeightReason ?? "").trim().length >= 5;

    categoryStatus[cat.category] = {
      weightBasisPoints: cat.weightBasisPoints,
      shareSumBasisPoints,
      sharesValid,
      zeroWeightValid,
    };

    if (!sharesValid || !zeroWeightValid) {
      allCategoriesValid = false;
    }
  }

  const rawMemberTotals = rosterUserIds.map((userId) => {
    let rawTotal = 0;
    const categoryShares: ContributionMatrixMemberBreakdown["categoryShares"] = [];
    for (const cat of orderedCategories) {
      const share = cat.shares.find((s) => s.userId === userId) ?? { userId, basisPoints: 0, rationale: "" };
      const rawProduct = cat.weightBasisPoints * share.basisPoints;
      rawTotal += rawProduct;
      categoryShares.push({
        category: cat.category,
        weightBasisPoints: cat.weightBasisPoints,
        shareBasisPoints: share.basisPoints,
        weightedBasisPoints: Math.round(rawProduct / 10000),
        exactWeightedPercentage: formatBasisPoints(Math.round(rawProduct / 10000)),
        ...(share.rationale ? { rationale: share.rationale } : {}),
      });
    }
    return {
      userId,
      rawTotal,
      flooredBasisPoints: Math.trunc(rawTotal / 10000),
      remainder: rawTotal % 10000,
      categoryShares,
    };
  });

  const totalRawUnits = rawMemberTotals.reduce((sum, item) => sum + item.rawTotal, 0);
  const targetTotalBp = totalRawUnits === 100_000_000 ? 10000 : Math.round(totalRawUnits / 10000);
  const floorSum = rawMemberTotals.reduce((sum, item) => sum + item.flooredBasisPoints, 0);
  const remainderToDistribute = Math.max(0, targetTotalBp - floorSum);

  const sortedByRemainder = [...rawMemberTotals].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.rawTotal !== a.rawTotal) return b.rawTotal - a.rawTotal;
    return a.userId.localeCompare(b.userId);
  });
  const bonusUsers = new Set(sortedByRemainder.slice(0, remainderToDistribute).map((x) => x.userId));

  const memberTotals: ContributionMatrixMemberBreakdown[] = rawMemberTotals.map((item) => {
    const basisPoints = item.flooredBasisPoints + (bonusUsers.has(item.userId) ? 1 : 0);
    return {
      userId: item.userId,
      basisPoints,
      percentage: formatBasisPoints(basisPoints),
      exactPercentage: formatBasisPoints(basisPoints),
      categoryShares: item.categoryShares,
    };
  });

  const shares: AllocationShareInput[] = memberTotals.map((member) => {
    const activeParts = member.categoryShares
      .filter((cs) => cs.weightBasisPoints > 0)
      .map(
        (cs) =>
          `${CONTRIBUTION_CATEGORY_META[cs.category].title} (${formatBasisPoints(cs.weightBasisPoints)} × ${formatBasisPoints(cs.shareBasisPoints)})`,
      );
    const defaultRationale =
      member.basisPoints === 0
        ? "Zero total share agreed across active contribution matrix categories."
        : `Matrix allocation (${member.percentage}): ${activeParts.join(" + ")}.`;
    return {
      userId: member.userId,
      basisPoints: member.basisPoints,
      rationale: defaultRationale,
    };
  });

  return {
    totalWeightBasisPoints,
    weightsValid,
    categoryStatus,
    memberTotals,
    shares,
    isCompleteAndValid: weightsValid && allCategoriesValid && rosterUserIds.length > 0,
  };
}
