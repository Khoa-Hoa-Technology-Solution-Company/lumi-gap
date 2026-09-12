import mongoose from 'mongoose';
import { Paper } from '../models/Paper.js';
import { User } from '../models/User.js';
import { getPdfDownloadUrl } from '../utils/s3.js';
import { chargePaperDownloadCredit } from '../utils/points.js';
import { calculatePaperQuality } from '../utils/paperQuality.js';
import { escapeRegexSearch } from '../utils/search.js';

const visibleStatuses = ['approved', 'downloaded', 'not-downloaded', 'pending-requester-acceptance'];

function isInvalidPaperId(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

function getObjectIdValue(value) {
  return value?._id || value;
}

function isSameObjectId(left, right) {
  const leftId = getObjectIdValue(left);
  const rightId = getObjectIdValue(right);
  if (!leftId || !rightId) return false;
  return leftId.toString() === rightId.toString();
}

async function repairPendingContributorPdfReviews(filter = {}) {
  const papers = await Paper.find({
    ...filter,
    status: 'pending',
    pdfPath: { $exists: true, $ne: '' },
    uploadedBy: { $exists: true },
  }).select('requestedBy uploadedBy status pdfPath');

  for (const paper of papers) {
    if (isSameObjectId(paper.uploadedBy, paper.requestedBy)) continue;

    const uploader = await User.findById(getObjectIdValue(paper.uploadedBy)).select('role');
    if (uploader?.role === 'admin') continue;

    paper.status = 'pending-requester-acceptance';
    try {
      await paper.save();
    } catch (err) {
      console.error('Failed to update paper status during repair:', err);
      // Skip problematic documents to avoid crashing the server
      continue;
    }
  }
}

async function ensurePaperQuality(paper) {
  if (!paper || paper.qualityScore > 0 || paper.qualityTier > 0) return paper;

  Object.assign(paper, calculatePaperQuality(paper));
  try {
    await paper.save();
  } catch (err) {
    console.error('Failed to update paper quality score:', err);
  }

  return paper;
}

function buildSearchFilter(query, { includeYear = true } = {}) {
  const filter = { status: { $in: visibleStatuses } };
  const andConditions = [];

  if (query.search) {
    const search = escapeRegexSearch(query.search);
    andConditions.push({
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { doi: { $regex: search, $options: 'i' } },
        { paperType: { $regex: search, $options: 'i' } },
        { paperLink: { $regex: search, $options: 'i' } },
        { abstract: { $regex: search, $options: 'i' } },
        { authors: { $regex: search, $options: 'i' } },
        { keywords: { $regex: search, $options: 'i' } },
      ],
    });
  }

  if (includeYear && query.year && Number.isInteger(Number(query.year))) {
    filter.publishedYear = Number(query.year);
  }

  if (query.relatedSemesters) {
    const semesters = String(query.relatedSemesters)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (semesters.length > 0) {
      andConditions.push({ relatedSemesters: { $in: semesters } });
    }
  }

  if (query.applicationDomain) {
    andConditions.push({ applicationDomain: { $regex: escapeRegexSearch(query.applicationDomain), $options: 'i' } });
  }

  if (query.hasPdf === 'true') {
    filter.pdfPath = { $exists: true, $ne: '' };
    filter.status = 'downloaded';
  }

  if (query.hasPdf === 'false') {
    andConditions.push({
      $or: [{ pdfPath: { $exists: false } }, { pdfPath: '' }],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  return filter;
}

function buildSort(sortBy) {
  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    yearDesc: { publishedYear: -1 },
    yearAsc: { publishedYear: 1 },
    rating: { averageRating: -1, totalRatings: -1 },
    downloads: { downloadCount: -1 },
  };

  return sortOptions[sortBy] || sortOptions.newest;
}

export async function searchPublicPapers(req, res) {
  await repairPendingContributorPdfReviews();

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const filter = buildSearchFilter(req.query);

  const [papers, total] = await Promise.all([
    Paper.find(filter)
      .populate('requestedBy', 'fullName university role')
      .populate('uploadedBy', 'fullName university role')
      .sort(buildSort(req.query.sortBy))
      .skip(skip)
      .limit(limit),
    Paper.countDocuments(filter),
  ]);

  await Promise.all(papers.map((paper) => ensurePaperQuality(paper)));

  res.json({
    papers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function getPublicPaperYears(req, res) {
  const filter = buildSearchFilter(req.query, { includeYear: false });
  const years = await Paper.distinct('publishedYear', filter);

  res.json({
    years: years
      .filter((year) => Number.isInteger(Number(year)))
      .map((year) => String(year))
      .sort((a, b) => b.localeCompare(a)),
  });
}

export async function getPublicPaperById(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  await repairPendingContributorPdfReviews({ _id: req.params.id });

  const paper = await Paper.findOne({
    _id: req.params.id,
    status: { $in: visibleStatuses },
  })
    .populate('requestedBy', 'fullName university role')
    .populate('uploadedBy', 'fullName university role');

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  await ensurePaperQuality(paper);

  res.json({ paper });
}

export async function recordPaperView(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findOneAndUpdate(
    { _id: req.params.id, status: { $in: visibleStatuses } },
    { $inc: { viewCount: 1 } },
    { new: true }
  );

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  res.json({ viewCount: paper.viewCount });
}

export async function downloadPublicPaper(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findOne(
    {
      _id: req.params.id,
      status: 'downloaded',
      pdfPath: { $exists: true, $ne: '' },
    }
  );

  if (!paper) return res.status(404).json({ message: 'PDF is not available for this paper' });
  await ensurePaperQuality(paper);
  if (paper.qualityTier === 0 || paper.downloadCost === null) {
    return res.status(403).json({ message: 'This paper does not meet the minimum quality score for download' });
  }

  const creditCharge = await chargePaperDownloadCredit({ userId: req.user._id, paper });
  paper.downloadCount += 1;
  await paper.save();

  const filename = `${paper.doi || paper.title}.pdf`;
  const downloadUrl = await getPdfDownloadUrl(paper.pdfPath, filename);

  res.json({
    downloadUrl,
    downloadCount: paper.downloadCount,
    creditCost: creditCharge.cost,
    isRepeatDownload: creditCharge.isRepeatDownload,
  });
}
