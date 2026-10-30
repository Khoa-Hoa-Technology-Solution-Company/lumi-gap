import {
  contributionCategories,
  defaultContributionCategoryWeights,
  type AllocationShareInput,
  type ContributionCategoryKey,
  type ContributionMatrixCategoryInput,
  type ContributionMatrixMemberBreakdown,
  type ContributionMatrixView,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

const TOTAL_BASIS_POINTS = 10000;
const RAW_SCALE = 10000; // 1 basis point = 10,000 raw units (100% = 100,000,000 raw units)

export const CONTRIBUTION_CATEGORY_LABELS: Record<ContributionCategoryKey, string> = {
  CONCEPTUALIZATION_METHODOLOGY: "Conceptualization & Methodology",
  LITERATURE_DATA: "Literature & Data",
  EXECUTION_VALIDATION: "Execution & Validation",
  WRITING_REVISION: "Writing & Revision",
};

/**
 * Formats integer basis points (10000 = 100%) deterministically without floating-point drift.
 * Examples:
 * - 4550 -> "45.5%"
 * - 3600 -> "36%"
 * - 1850 -> "18.5%"
 * - 3333 -> "33.33%"
 */
export function formatBasisPointsAsPercentage(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(basisPoints));
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  if (fraction === 0) {
    return `${sign}${whole}%`;
  }
  const fracPadded = String(fraction).padStart(2, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracPadded}%`;
}

/**
 * Formats raw units (100,000,000 = 100%) deterministically up to 4 decimal places.
 */
export function formatRawUnitsAsPercentage(rawUnits: number): string {
  const sign = rawUnits < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(rawUnits));
  const whole = Math.trunc(abs / 1_000_000);
  const fraction = abs % 1_000_000;
  if (fraction === 0) {
    return `${sign}${whole}%`;
  }
  const fracPadded = String(fraction).padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracPadded}%`;
}

export interface CalculateContributionMatrixOptions {
  rosterUserIds: string[];
  categories: ContributionMatrixCategoryInput[];
  requireComplete?: boolean;
  allowedEvidenceIds?: Set<string>;
}

export interface CalculatedContributionMatrixResult {
  matrix: ContributionMatrixView;
  shares: AllocationShareInput[];
}

export function createDefaultContributionMatrixCategories(
  rosterUserIds: string[],
): ContributionMatrixCategoryInput[] {
  return contributionCategories.map((category) => ({
    category,
    weightBasisPoints: defaultContributionCategoryWeights[category],
    zeroWeightReason: "",
    evidenceIds: [],
    shares: rosterUserIds.map((userId) => ({
      userId,
      basisPoints: 0,
      rationale: "",
    })),
  }));
}

export function calculateContributionMatrix(
  options: CalculateContributionMatrixOptions,
): CalculatedContributionMatrixResult {
  const {
    rosterUserIds,
    categories,
    requireComplete = true,
    allowedEvidenceIds,
  } = options;

  if (!Array.isArray(rosterUserIds) || rosterUserIds.length === 0) {
    throw AppError.badRequest("Contribution matrix requires at least one project member in the roster");
  }
  const rosterSet = new Set(rosterUserIds);
  if (rosterSet.size !== rosterUserIds.length) {
    throw AppError.badRequest("Contribution matrix roster contains duplicate members");
  }

  if (!Array.isArray(categories) || categories.length !== contributionCategories.length) {
    throw AppError.badRequest("Contribution matrix must configure all four contribution categories");
  }

  const seenCategories = new Set<ContributionCategoryKey>();
  const categoryMap = new Map<ContributionCategoryKey, ContributionMatrixCategoryInput>();

  for (const cat of categories) {
    if (!contributionCategories.includes(cat.category)) {
      throw AppError.badRequest(`Invalid contribution category: ${String(cat.category)}`);
    }
    if (seenCategories.has(cat.category)) {
      throw AppError.badRequest(`Duplicate contribution category: ${cat.category}`);
    }
    if (
      typeof cat.weightBasisPoints !== "number"
      || !Number.isInteger(cat.weightBasisPoints)
      || cat.weightBasisPoints < 0
      || cat.weightBasisPoints > TOTAL_BASIS_POINTS
    ) {
      throw AppError.badRequest(
        `Category weight for ${CONTRIBUTION_CATEGORY_LABELS[cat.category]} must be an integer between 0 and 10000 basis points`,
      );
    }
    seenCategories.add(cat.category);
    categoryMap.set(cat.category, cat);
  }

  const orderedCategories = contributionCategories.map((key) => categoryMap.get(key)!);

  const totalWeightBasisPoints = orderedCategories.reduce(
    (sum, cat) => sum + cat.weightBasisPoints,
    0,
  );

  if (requireComplete && totalWeightBasisPoints !== TOTAL_BASIS_POINTS) {
    throw AppError.badRequest(
      `Category weights must sum to 100% (10000 basis points); received ${formatBasisPointsAsPercentage(totalWeightBasisPoints)} (${totalWeightBasisPoints} basis points)`,
    );
  }
  if (!requireComplete && totalWeightBasisPoints > TOTAL_BASIS_POINTS) {
    throw AppError.badRequest(
      `Category weights cannot exceed 100% (10000 basis points); received ${totalWeightBasisPoints} basis points`,
    );
  }

  const normalizedCategories: ContributionMatrixView["categories"] = [];

  for (const cat of orderedCategories) {
    const label = CONTRIBUTION_CATEGORY_LABELS[cat.category];
    const zeroWeightReason = (cat.zeroWeightReason ?? "").trim();

    if (requireComplete && cat.weightBasisPoints === 0 && zeroWeightReason.length < 5) {
      throw AppError.badRequest(
        `Category "${label}" has 0% weight and requires an explicit explanation for weight redistribution`,
      );
    }

    const rawEvidenceIds = cat.evidenceIds ?? [];
    const dedupedEvidenceIds: string[] = [];
    const seenEvidence = new Set<string>();
    for (const evidenceId of rawEvidenceIds) {
      const trimmedId = evidenceId.trim();
      if (!trimmedId || seenEvidence.has(trimmedId)) continue;
      if (allowedEvidenceIds && !allowedEvidenceIds.has(trimmedId)) {
        throw AppError.badRequest(
          `Evidence item ${trimmedId} referenced in "${label}" does not belong to this project`,
        );
      }
      seenEvidence.add(trimmedId);
      dedupedEvidenceIds.push(trimmedId);
    }

    if (!Array.isArray(cat.shares)) {
      throw AppError.badRequest(`Category "${label}" must provide member shares`);
    }

    const shareByUser = new Map<string, { basisPoints: number; rationale: string }>();
    for (const share of cat.shares) {
      if (!rosterSet.has(share.userId)) {
        throw AppError.badRequest(`Member ${share.userId} in "${label}" is not in the allocation roster`);
      }
      if (shareByUser.has(share.userId)) {
        throw AppError.badRequest(`Duplicate member share for ${share.userId} in "${label}"`);
      }
      if (
        typeof share.basisPoints !== "number"
        || !Number.isInteger(share.basisPoints)
        || share.basisPoints < 0
        || share.basisPoints > TOTAL_BASIS_POINTS
      ) {
        throw AppError.badRequest(
          `Member share in "${label}" must be an integer between 0 and 10000 basis points`,
        );
      }
      shareByUser.set(share.userId, {
        basisPoints: share.basisPoints,
        rationale: (share.rationale ?? "").trim(),
      });
    }

    if (requireComplete && shareByUser.size !== rosterUserIds.length) {
      throw AppError.badRequest(`Category "${label}" must include a share entry for every roster member`);
    }

    const orderedShares = rosterUserIds.map((userId) => {
      const entry = shareByUser.get(userId) ?? { basisPoints: 0, rationale: "" };
      const rawWeighted = cat.weightBasisPoints * entry.basisPoints;
      return {
        userId,
        basisPoints: entry.basisPoints,
        weightedBasisPoints: Math.round(rawWeighted / RAW_SCALE),
        rationale: entry.rationale,
      };
    });

    const categoryShareSum = orderedShares.reduce((sum, s) => sum + s.basisPoints, 0);

    if (cat.weightBasisPoints === 0) {
      if (categoryShareSum !== 0) {
        throw AppError.badRequest(
          `Inactive category "${label}" (0% weight) cannot have non-zero member shares`,
        );
      }
    } else if (requireComplete && categoryShareSum !== TOTAL_BASIS_POINTS) {
      throw AppError.badRequest(
        `Member shares in "${label}" must sum to 100% (10000 basis points); received ${formatBasisPointsAsPercentage(categoryShareSum)} (${categoryShareSum} basis points)`,
      );
    }

    normalizedCategories.push({
      category: cat.category,
      weightBasisPoints: cat.weightBasisPoints,
      zeroWeightReason,
      evidenceIds: dedupedEvidenceIds,
      shares: orderedShares,
    });
  }

  // Deterministic C(i) = SUM_k [ W(k) * S(i,k) ] calculation using integer arithmetic
  const rawMemberTotals = rosterUserIds.map((userId) => {
    let rawTotal = 0;
    const categoryShares: ContributionMatrixMemberBreakdown["categoryShares"] = [];

    for (const cat of normalizedCategories) {
      const memberShare = cat.shares.find((s) => s.userId === userId)!;
      const rawProduct = cat.weightBasisPoints * memberShare.basisPoints;
      rawTotal += rawProduct;
      categoryShares.push({
        category: cat.category,
        weightBasisPoints: cat.weightBasisPoints,
        shareBasisPoints: memberShare.basisPoints,
        weightedBasisPoints: Math.round(rawProduct / RAW_SCALE),
        exactWeightedPercentage: formatRawUnitsAsPercentage(rawProduct),
        ...(memberShare.rationale ? { rationale: memberShare.rationale } : {}),
      });
    }

    const flooredBasisPoints = Math.trunc(rawTotal / RAW_SCALE);
    const remainder = rawTotal % RAW_SCALE;

    return {
      userId,
      rawTotal,
      flooredBasisPoints,
      remainder,
      categoryShares,
    };
  });

  const totalRawUnits = rawMemberTotals.reduce((sum, item) => sum + item.rawTotal, 0);
  const targetTotalBasisPoints =
    totalRawUnits === TOTAL_BASIS_POINTS * RAW_SCALE
      ? TOTAL_BASIS_POINTS
      : Math.round(totalRawUnits / RAW_SCALE);

  const currentFloorSum = rawMemberTotals.reduce((sum, item) => sum + item.flooredBasisPoints, 0);
  const remainderToDistribute = Math.max(0, targetTotalBasisPoints - currentFloorSum);

  // Largest Remainder Method (Hamilton method) with deterministic tie-breaking
  const sortedByRemainder = [...rawMemberTotals].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.rawTotal !== a.rawTotal) return b.rawTotal - a.rawTotal;
    return a.userId.localeCompare(b.userId);
  });

  const bonusUsers = new Set(
    sortedByRemainder.slice(0, remainderToDistribute).map((item) => item.userId),
  );

  const memberTotals: ContributionMatrixMemberBreakdown[] = rawMemberTotals.map((item) => {
    const basisPoints = item.flooredBasisPoints + (bonusUsers.has(item.userId) ? 1 : 0);
    return {
      userId: item.userId,
      basisPoints,
      percentage: formatBasisPointsAsPercentage(basisPoints),
      exactPercentage: formatRawUnitsAsPercentage(item.rawTotal),
      categoryShares: item.categoryShares,
    };
  });

  const shares: AllocationShareInput[] = memberTotals.map((member) => {
    const breakdownParts = member.categoryShares
      .filter((cs) => cs.weightBasisPoints > 0)
      .map(
        (cs) =>
          `${CONTRIBUTION_CATEGORY_LABELS[cs.category]} (${formatBasisPointsAsPercentage(cs.weightBasisPoints)} × ${formatBasisPointsAsPercentage(cs.shareBasisPoints)})`,
      );
    const customNotes = member.categoryShares
      .map((cs) => cs.rationale?.trim())
      .filter((note): note is string => Boolean(note));

    const defaultRationale =
      member.basisPoints === 0
        ? "Zero total share agreed across active contribution matrix categories."
        : `Matrix allocation (${member.percentage}): ${breakdownParts.join(" + ")}.`;

    return {
      userId: member.userId,
      basisPoints: member.basisPoints,
      rationale: customNotes.length > 0 ? `${customNotes.join("; ")} [${defaultRationale}]` : defaultRationale,
    };
  });

  return {
    matrix: {
      formulaVersion: "CONTRIBUTION_MATRIX_V1",
      categories: normalizedCategories,
      memberTotals,
    },
    shares,
  };
}
