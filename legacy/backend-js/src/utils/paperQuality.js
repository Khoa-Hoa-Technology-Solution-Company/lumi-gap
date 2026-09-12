const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;

export const QUALITY_TIERS = [
  { tier: 0, name: 'Không hợp lệ', minScore: 0, maxScore: 49, downloadCost: null, uploadCreditReward: 0 },
  { tier: 1, name: 'Cơ Bản', minScore: 50, maxScore: 64, downloadCost: 20, uploadCreditReward: 100 },
  { tier: 2, name: 'Chuẩn Học Thuật', minScore: 65, maxScore: 79, downloadCost: 30, uploadCreditReward: 150 },
  { tier: 3, name: 'Giá Trị Cao', minScore: 80, maxScore: 91, downloadCost: 50, uploadCreditReward: 200 },
  { tier: 4, name: 'Tinh Hoa', minScore: 92, maxScore: 100, downloadCost: 80, uploadCreditReward: 300 },
];

function hasValue(value) {
  return String(value || '').trim().length > 0;
}

function getArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function scoreMetadata(paper) {
  return Math.min(
    15,
    (hasValue(paper.title) ? 3 : 0) +
      (getArray(paper.authors).length > 0 ? 3 : 0) +
      (paper.publishedYear ? 2 : 0) +
      (hasValue(paper.abstract) ? 4 : 0) +
      (getArray(paper.keywords).length > 0 || hasValue(paper.applicationDomain) ? 3 : 0)
  );
}

function scoreSource(paper) {
  if (DOI_PATTERN.test(String(paper.doi || '').trim())) return 15;
  if (/arxiv|hal|zenodo|repository|repo/i.test(String(paper.paperLink || ''))) return 8;
  if (hasValue(paper.paperLink)) return 10;
  if (hasValue(paper.pdfPath)) return 2;
  return 0;
}

function scoreDuplicate(paper) {
  return paper.isDuplicate ? 0 : paper.needsDuplicateReview ? 10 : 20;
}

function scoreRelevance(paper) {
  const hasDomain = hasValue(paper.applicationDomain);
  const hasSemesters = getArray(paper.relatedSemesters).length > 0;
  const hasKeywords = getArray(paper.keywords).length > 0;

  if (hasDomain && hasSemesters && hasKeywords) return 15;
  if ((hasDomain && hasKeywords) || (hasDomain && hasSemesters)) return 10;
  if (hasDomain || hasSemesters || hasKeywords) return 5;
  return 0;
}

function scorePrestige(paper) {
  const paperType = String(paper.paperType || '').toLowerCase();

  if (paperType.includes('journal') || paperType.includes('conference')) return 15;
  if (paperType.includes('preprint') || paperType.includes('technical')) return 8;
  if (paperType.includes('research') || paperType.includes('survey') || paperType.includes('review')) return 10;
  return hasValue(paper.paperType) ? 3 : 0;
}

function scoreUtility(paper) {
  const paperType = String(paper.paperType || '').toLowerCase();
  const abstract = String(paper.abstract || '').toLowerCase();

  if (paperType.includes('data') || paperType.includes('software') || /dataset|benchmark|code/.test(abstract)) return 15;
  if (/method|experiment|result/.test(abstract)) return 12;
  if (paperType.includes('survey') || paperType.includes('review')) return 12;
  if (paperType.includes('case')) return 8;
  return hasValue(paper.abstract) ? 3 : 0;
}

export function getQualityTier(score) {
  return QUALITY_TIERS.find((tier) => score >= tier.minScore && score <= tier.maxScore) || QUALITY_TIERS[0];
}

export function calculatePaperQuality(paper) {
  const componentScores = {
    metadataScore: scoreMetadata(paper),
    sourceScore: scoreSource(paper),
    duplicateScore: scoreDuplicate(paper),
    relevanceScore: scoreRelevance(paper),
    prestigeScore: scorePrestige(paper),
    utilityScore: scoreUtility(paper),
  };
  const qualityScore = Object.values(componentScores).reduce((sum, score) => sum + score, 0);
  const tier = getQualityTier(qualityScore);

  return {
    ...componentScores,
    qualityScore,
    qualityTier: tier.tier,
    qualityTierName: tier.name,
    downloadCost: tier.downloadCost,
    uploadCreditReward: tier.uploadCreditReward,
  };
}
