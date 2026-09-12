import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { Paper } from '../models/Paper.js';
import { User } from '../models/User.js';
import { deletePdfFromS3, getPdfDownloadUrl, isObjectStorageConfigured, isS3Path, uploadPdfToS3 } from '../utils/s3.js';
import { chargePaperRequestCredit, recordInvalidPdfUpload, refundPaperRequestCredit, rewardPaperUploadCredit, syncUserPoints } from '../utils/points.js';
import { calculatePaperQuality } from '../utils/paperQuality.js';
import { deletePapersWithRelatedData } from '../utils/paperCleanup.js';
import { escapeRegexSearch } from '../utils/search.js';
import {
  notifyAdminsPaperPdfUploaded,
  notifyAdminsPaperSubmitted,
  notifyPaperRequesterPdfUploaded,
  notifyUsersPaperApproved,
} from '../utils/notification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

const allowedPaperTypes = [
  'Survey',
  'Research',
  'Preprint',
  'Conference Paper',
  'Journal Article',
  'Book Chapter',
  'Thesis',
  'Technical Report',
  'Workshop Paper',
  'Review Article',
  'Case Study',
  'Position Paper',
  'Editorial',
  'White Paper',
  'Research Note',
  'Short Communication',
  'Letter to Editor',
  'News & Views',
  'Commentary',
  'Tutorial',
  'Abstract',
  'Extended Abstract',
  'Poster Paper',
  'Data Paper',
  'Software Paper',
  'Patent',
  'Book Review',
  'Erratum',
  'Corrigendum',
  'Retraction Notice',
  'Proposal',
  'Other',
];

const allowedSemesters = [
  'semester_1',
  'semester_2',
  'semester_3',
  'semester_4',
  'semester_5',
  'semester_6',
  'semester_7',
  'semester_8',
  'semester_9',
];

const allowedStatuses = ['pending', 'approved', 'rejected', 'downloaded', 'not-downloaded', 'pending-requester-acceptance'];

function normalizePaperStatus(status) {
  return status === 'approved' ? 'not-downloaded' : status;
}

function getApprovalStatus(paper) {
  return paper.pdfPath ? 'downloaded' : 'not-downloaded';
}

function isApprovedStatus(status) {
  return status === 'downloaded' || status === 'not-downloaded' || status === 'pending-requester-acceptance';
}

function getObjectIdValue(value) {
  return value?._id || value;
}

function isPdfWaitingRequesterAcceptance(paper) {
  if (!paper?.pdfPath || !paper.uploadedBy) return false;

  if (paper.status === 'pending-requester-acceptance') return true;

  return paper.status === 'pending' && !isSameObjectId(paper.uploadedBy, paper.requestedBy);
}

function isSameObjectId(left, right) {
  const leftId = getObjectIdValue(left);
  const rightId = getObjectIdValue(right);
  if (!leftId || !rightId) return false;
  return leftId.toString() === rightId.toString();
}

async function normalizeContributorPdfReviewStatus(paper) {
  if (!paper || paper.status !== 'pending' || !paper.pdfPath || !paper.uploadedBy) return paper;
  if (isSameObjectId(paper.uploadedBy, paper.requestedBy)) return paper;

  const uploader = await User.findById(getObjectIdValue(paper.uploadedBy)).select('role');
  if (uploader?.role === 'admin') return paper;

  paper.status = 'pending-requester-acceptance';
  try {
    await paper.save();
  } catch (err) {
    console.error('Failed to normalize contributor pdf review status for paper', paper._id, err);
    return paper;
  }
  return paper;
}

async function normalizeContributorPdfReviewStatuses(papers) {
  return Promise.all(papers.map((paper) => normalizeContributorPdfReviewStatus(paper)));
}

function normalizePaperUpdateStatus(status, paper) {
  return status === 'approved' ? getApprovalStatus(paper) : normalizePaperStatus(status);
}

function validateRejectionReason(value) {
  const reason = String(value || '').trim().replace(/\s+/g, ' ');

  if (reason.length < 5) {
    return { error: 'Rejection reason must be at least 5 characters' };
  }

  if (reason.length > 500) {
    return { error: 'Rejection reason must be 500 characters or fewer' };
  }

  return { reason };
}

function shouldNotifyApproval(previousStatus, nextStatus) {
  return !isApprovedStatus(previousStatus) && isApprovedStatus(nextStatus);
}

function isInvalidPaperId(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords.map((item) => String(item).trim()).filter(Boolean);
  if (typeof keywords === 'string') return keywords.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTitleForDuplicateCheck(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function buildTitleDuplicateRegex(title) {
  const normalizedTitle = normalizeTitleForDuplicateCheck(title);
  const flexibleWhitespaceTitle = escapeRegexLiteral(normalizedTitle).replace(/\s+/g, '\\s+');
  return new RegExp(`^${flexibleWhitespaceTitle}$`, 'i');
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function hasEnoughWords(value, minWords) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .length >= minWords;
}

function countWords(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word)).length;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePaperRequest({ title, doi, paperType, paperLink, abstract, keywords, publishedYear, relatedSemesters, applicationDomain, authors }) {
  const trimmedTitle = String(title).trim();
  const trimmedDoi = String(doi).trim();
  const trimmedPaperType = String(paperType).trim();
  const trimmedAbstract = String(abstract).trim();
  const publishedYearNumber = Number(publishedYear);
  const maxYear = new Date().getFullYear() + 1;
  const titleWordCount = countWords(trimmedTitle);
  const abstractWordCount = countWords(trimmedAbstract);

  if (trimmedTitle.length < 8 || !hasEnoughWords(trimmedTitle, 3)) {
    return 'Please enter a clearer paper title';
  }

  if (titleWordCount > 200) {
    return 'Paper title must be 200 words or fewer';
  }

  if (!/^10\.\d{4,9}\/\S+$/i.test(trimmedDoi)) {
    return 'Please enter a valid DOI';
  }

  if (!trimmedPaperType || !allowedPaperTypes.includes(trimmedPaperType)) {
    return 'Please Choose paper type';
  }

  if (!isHttpUrl(paperLink)) {
    return 'Please enter a valid paper link';
  }

  if (String(paperLink).trim().split(/\s+/).length !== 1) {
    return 'Please enter only one paper link for this request';
  }

  // authors required and must be meaningful
  const authorList = Array.isArray(authors) ? authors : String(authors || '').split(',').map((a) => a.trim()).filter(Boolean);
  if (!authorList || authorList.length === 0) {
    return 'Please enter at least one author';
  }
  if (authorList.some((a) => a.length < 2)) {
    return 'Please enter valid author names';
  }

  // enforce abstract word count between 50 and 350 words
  if (abstractWordCount < 50 || abstractWordCount > 350) {
    return 'Word Count Limit: The abstract must contain between 50 and 350 words. Please revise your text to proceed.';
  }

  if (keywords.length === 0 || keywords.some((keyword) => keyword.length < 2)) {
    return 'Please enter at least one meaningful keyword';
  }
  // relatedSemesters is required (except when only PDF provided) and must contain allowed values
  const semesters = Array.isArray(relatedSemesters)
    ? relatedSemesters
    : String(relatedSemesters || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!semesters || semesters.length === 0) {
    return 'Please select at least one related semester';
  }

  if (semesters.some((s) => !allowedSemesters.includes(s))) {
    return 'Invalid related semesters selected';
  }

  // applicationDomain is required
  const domain = String(applicationDomain || '').trim();
  if (!domain) return 'Please choose an application domain';
  if (domain.length > 200) return 'Application domain is too long';

  if (!Number.isInteger(publishedYearNumber) || publishedYearNumber < 1900 || publishedYearNumber > maxYear) {
    return `Publication year must be between 1900 and ${maxYear}`;
  }

  return '';
}

function getResetStatus(status) {
  return status === 'pending' ? 'pending' : 'not-downloaded';
}

async function applyUploadCreditReward(paper) {
  if (!paper?.uploadedBy || paper.status !== 'downloaded' || paper.uploadRewardedAt) return paper;

  const reward = paper.uploadCreditReward || 0;
  if (reward > 0) {
    await rewardPaperUploadCredit(getObjectIdValue(paper.uploadedBy), reward);
  }

  paper.uploadRewardedAt = new Date();
  await paper.save();
  return paper;
}

function resolvePaperPdfPath(pdfPath) {
  if (!pdfPath) return '';

  return path.resolve(uploadsDir, path.basename(pdfPath));
}

async function removeUploadedFile(file) {
  if (!file?.path) return;

  try {
    await fs.unlink(file.path);
  } catch {
    // Ignore cleanup failures.
  }
}

async function deleteStoredPdf(pdfPath) {
  if (!pdfPath) return;

  if (isS3Path(pdfPath)) {
    await deletePdfFromS3(pdfPath);
    return;
  }

  await removeUploadedFile({ path: resolvePaperPdfPath(pdfPath) });
}

async function storeUploadedPdf(file) {
  if (!file) return '';

  if (!isObjectStorageConfigured()) {
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = path.basename(String(file.originalname || 'paper.pdf'));
    const localFileName = `${Date.now()}-${safeName}`;
    const localPath = path.resolve(uploadsDir, localFileName);

    await fs.writeFile(localPath, file.buffer);
    return `/uploads/${localFileName}`;
  }

  return uploadPdfToS3(file);
}

export async function createPaper(req, res) {
  const { title, doi, paperType, paperLink, abstract, authors, keywords, publishedYear, relatedSemesters, applicationDomain } = req.body;
  const normalizedKeywords = normalizeKeywords(keywords);
  const isAdmin = req.user.role === 'admin';

  if (!title || !doi || !paperLink || !abstract || !publishedYear || !authors || String(authors).trim().length === 0) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!paperType) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Please Choose paper type' });
  }

  if (!relatedSemesters || String(relatedSemesters).trim().length === 0) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Please select at least one related semester' });
  }

  if (!applicationDomain || String(applicationDomain).trim().length === 0) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Please choose an application domain' });
  }

  if (normalizedKeywords.length === 0) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'At least one keyword is required' });
  }

  const validationError = validatePaperRequest({
    title,
    doi,
    paperType,
    paperLink,
    abstract,
    keywords: normalizedKeywords,
    publishedYear,
    relatedSemesters,
    applicationDomain,
    authors: normalizeStringList(authors),
  });

  if (validationError) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: validationError });
  }

  const publishedYearNumber = Number(publishedYear);
  const maxYear = new Date().getFullYear() + 1;

  if (!Number.isInteger(publishedYearNumber) || publishedYearNumber < 1900 || publishedYearNumber > maxYear) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: `Publication year must be between 1900 and ${maxYear}` });
  }

  const duplicate = await Paper.findOne({
    $or: [{ title: buildTitleDuplicateRegex(title) }, { doi: String(doi).trim() }, { paperLink: String(paperLink).trim() }],
  });
  if (duplicate) {
    await removeUploadedFile(req.file);
    return res.status(409).json({
      message: 'A paper with this title, DOI, or link already exists',
      duplicatePaperId: duplicate._id,
    });
  }

  const uploadedPdfPath = await storeUploadedPdf(req.file);

  const paperData = {
    title: normalizeTitleForDuplicateCheck(title),
    doi: String(doi).trim(),
    paperLink: String(paperLink).trim(),
    abstract: String(abstract).trim(),
    authors: normalizeStringList(authors),
    keywords: normalizedKeywords,
    publishedYear: publishedYearNumber,
    requestedBy: req.user._id,
  };

  if (paperType) {
    paperData.paperType = String(paperType).trim();
  }

  if (relatedSemesters) paperData.relatedSemesters = normalizeStringList(relatedSemesters);
  if (applicationDomain) paperData.applicationDomain = String(applicationDomain).trim();

  if (uploadedPdfPath) {
    paperData.pdfPath = uploadedPdfPath;
    paperData.uploadedBy = req.user._id;
    paperData.uploadedAt = new Date();
    paperData.status = isAdmin ? 'downloaded' : 'pending';
  } else if (isAdmin) {
    paperData.status = 'not-downloaded';
  }

  Object.assign(paperData, calculatePaperQuality(paperData));

  let paper;

  try {
    paper = await Paper.create(paperData);
  } catch (error) {
    await deleteStoredPdf(uploadedPdfPath);
    console.error('Failed to create paper:', error);
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create paper request' });
  }

  if (isAdmin && uploadedPdfPath) {
    await applyUploadCreditReward(paper);
  }

  if (!isAdmin) {
    await chargePaperRequestCredit(req.user._id);
  }

  await syncUserPoints(req.user._id);

  if (!isAdmin) {
    try {
      await notifyAdminsPaperSubmitted({
        paperId: paper._id,
        paperTitle: paper.title,
        requesterName: req.user.fullName,
        actorId: req.user._id,
      });
    } catch (error) {
      console.error('Failed to create admin notification for new paper:', error);
    }
  }

  res.status(201).json({ paper });
}

export async function getMyPapers(req, res) {
  const papers = await Paper.find({ requestedBy: req.user._id }).sort({ createdAt: -1 });
  await normalizeContributorPdfReviewStatuses(papers);
  res.json({ papers });
}

export async function getAllPapers(req, res) {
  const { status, search } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (search) {
    const escapedSearch = escapeRegexSearch(search);
    filter.$or = [
      { title: { $regex: escapedSearch, $options: 'i' } },
      { doi: { $regex: escapedSearch, $options: 'i' } },
      { paperType: { $regex: escapedSearch, $options: 'i' } },
      { paperLink: { $regex: escapedSearch, $options: 'i' } },
    ];
  }

  const papers = await Paper.find(filter)
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role')
    .sort({ createdAt: -1 });

  await normalizeContributorPdfReviewStatuses(papers);

  res.json({ papers });
}

export async function getPaperById(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id)
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  await normalizeContributorPdfReviewStatus(paper);

  if (req.user.role !== 'admin' && paper.requestedBy._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You do not have permission to view this paper' });
  }

  res.json({ paper });
}

export async function getPaperPdfDownloadUrl(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });
  if (!paper.pdfPath) return res.status(404).json({ message: 'PDF is not available for this paper' });

  if (req.user.role !== 'admin' && paper.requestedBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You do not have permission to download this PDF' });
  }

  const downloadUrl = await getPdfDownloadUrl(paper.pdfPath, `${paper.doi || paper.title}.pdf`);

  res.json({ downloadUrl });
}

export async function updatePaperStatus(req, res) {
  const { status, rejectionReason } = req.body;

  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const currentPaper = await Paper.findById(req.params.id).populate('requestedBy', 'fullName');

  if (!currentPaper) return res.status(404).json({ message: 'Paper not found' });

  const previousStatus = currentPaper.status;
  const nextStatus = normalizePaperUpdateStatus(status, currentPaper);
  const notifyApproval = shouldNotifyApproval(previousStatus, nextStatus);
  const statusUpdates = { status: nextStatus };

  if (nextStatus === 'rejected') {
    const reasonValidation = validateRejectionReason(rejectionReason);
    if (reasonValidation.error) {
      return res.status(400).json({ message: reasonValidation.error });
    }
    statusUpdates.rejectionReason = reasonValidation.reason;
  } else {
    statusUpdates.$unset = { rejectionReason: '' };
  }

  const qualityUpdates = calculatePaperQuality(currentPaper);
  const paper = await Paper.findByIdAndUpdate(req.params.id, { ...statusUpdates, ...qualityUpdates }, { new: true });
  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  await applyUploadCreditReward(paper);
  await syncUserPoints(paper.requestedBy);
  if (paper.uploadedBy) {
    await syncUserPoints(paper.uploadedBy);
  }

  if (notifyApproval) {
    try {
      await notifyUsersPaperApproved({
        paperId: paper._id,
        paperTitle: paper.title,
        requesterName: currentPaper.requestedBy?.fullName || 'A user',
        actorId: req.user._id,
        excludeUserId: currentPaper.requestedBy?._id,
      });
    } catch (error) {
      console.error('Failed to create user notification for approved paper:', error);
    }
  }

  res.json({ paper });
}

export async function updatePaper(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const existingPaper = await Paper.findById(req.params.id).populate('requestedBy', 'fullName');
  if (!existingPaper) return res.status(404).json({ message: 'Paper not found' });

  const allowedFields = [
    'title',
    'doi',
    'paperType',
    'paperLink',
    'abstract',
    'authors',
    'keywords',
    'publishedYear',
    'relatedSemesters',
    'applicationDomain',
    'status',
    'rejectionReason',
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields provided' });
  }

  if (updates.keywords !== undefined) {
    updates.keywords = normalizeKeywords(updates.keywords);
  }

  if (updates.relatedSemesters !== undefined) {
    updates.relatedSemesters = normalizeStringList(updates.relatedSemesters);

    if (updates.relatedSemesters.some((s) => !allowedSemesters.includes(s))) {
      return res.status(400).json({ message: 'Invalid related semesters selected' });
    }
  }

  if (updates.paperType !== undefined) {
    updates.paperType = String(updates.paperType).trim();

    if (!allowedPaperTypes.includes(updates.paperType)) {
      return res.status(400).json({ message: 'Please Choose paper type' });
    }
  }

  if (updates.authors !== undefined) {
    updates.authors = normalizeStringList(updates.authors);
  }

  if (updates.title !== undefined) {
    updates.title = normalizeTitleForDuplicateCheck(updates.title);
  }

  if (updates.doi !== undefined) {
    updates.doi = String(updates.doi).trim();
  }

  if (updates.paperLink !== undefined) {
    updates.paperLink = String(updates.paperLink).trim();
  }

  if (updates.publishedYear !== undefined) {
    const publishedYear = Number(updates.publishedYear);
    const maxYear = new Date().getFullYear() + 1;

    if (!Number.isInteger(publishedYear) || publishedYear < 1900 || publishedYear > maxYear) {
      return res.status(400).json({ message: `Publication year must be between 1900 and ${maxYear}` });
    }

    updates.publishedYear = publishedYear;
  }

  if (updates.applicationDomain !== undefined) {
    updates.applicationDomain = String(updates.applicationDomain).trim();
    if (updates.applicationDomain.length > 200) return res.status(400).json({ message: 'Application domain is too long' });
  }

  if (updates.status !== undefined && !allowedStatuses.includes(updates.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  if (updates.status !== undefined) {
    updates.status = normalizePaperUpdateStatus(updates.status, existingPaper);
  }

  if (updates.status === 'rejected') {
    const reasonValidation = validateRejectionReason(updates.rejectionReason || existingPaper.rejectionReason);
    if (reasonValidation.error) {
      return res.status(400).json({ message: reasonValidation.error });
    }
    updates.rejectionReason = reasonValidation.reason;
  } else if (updates.status !== undefined) {
    updates.$unset = { ...(updates.$unset || {}), rejectionReason: '' };
    delete updates.rejectionReason;
  }

  if (updates.title || updates.doi || updates.paperLink) {
    const duplicateFilters = [];

    if (updates.title) duplicateFilters.push({ title: buildTitleDuplicateRegex(updates.title) });
    if (updates.doi) duplicateFilters.push({ doi: String(updates.doi).trim() });
    if (updates.paperLink) duplicateFilters.push({ paperLink: String(updates.paperLink).trim() });

    const duplicate = await Paper.findOne({
      _id: { $ne: req.params.id },
      $or: duplicateFilters,
    });

    if (duplicate) {
      return res.status(409).json({
        message: 'A paper with this title, DOI, or link already exists',
        duplicatePaperId: duplicate._id,
      });
    }
  }

  Object.assign(updates, calculatePaperQuality({ ...existingPaper.toObject(), ...updates }));

  const paper = await Paper.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  await applyUploadCreditReward(paper);
  await syncUserPoints(paper.requestedBy);
  if (paper.uploadedBy) {
    await syncUserPoints(paper.uploadedBy);
  }

  const nextStatus = updates.status ?? existingPaper.status;
  const becameApproved = shouldNotifyApproval(existingPaper.status, nextStatus);

  if (becameApproved) {
    try {
      await notifyUsersPaperApproved({
        paperId: paper._id,
        paperTitle: paper.title,
        requesterName: existingPaper.requestedBy?.fullName || 'A user',
        actorId: req.user._id,
        excludeUserId: existingPaper.requestedBy?._id,
      });
    } catch (error) {
      console.error('Failed to create user notification for approved paper:', error);
    }
  }

  res.json({ paper });
}

export async function deletePaper(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  const isAdmin = req.user.role === 'admin';
  const isOwner = isSameObjectId(paper.requestedBy, req.user._id);

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'You can only delete your own paper requests' });
  }

  const shouldRefundRequestCredit = !isAdmin && isOwner && paper.status === 'pending';
  const affectedUserIds = await deletePapersWithRelatedData({ _id: paper._id });
  if (shouldRefundRequestCredit) {
    await refundPaperRequestCredit(req.user._id);
  }
  await Promise.all(affectedUserIds.map((userId) => syncUserPoints(userId)));

  res.json({ message: 'Paper deleted successfully', paperId: paper._id });
}

export async function cancelMyPaperRequest(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  if (!isSameObjectId(paper.requestedBy, req.user._id)) {
    return res.status(403).json({ message: 'You can only cancel your own paper requests' });
  }

  if (paper.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending paper requests can be cancelled' });
  }

  const affectedUserIds = await deletePapersWithRelatedData({ _id: paper._id });
  await refundPaperRequestCredit(req.user._id);
  await Promise.all(affectedUserIds.map((userId) => syncUserPoints(userId)));

  res.json({ message: 'Paper request cancelled successfully', paperId: paper._id });
}

export async function uploadPaperPdf(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'PDF file is required' });
  }

  const existingPaper = await Paper.findById(req.params.id);

  if (!existingPaper) {
    await removeUploadedFile(req.file);
    return res.status(404).json({ message: 'Paper not found' });
  }

  if (existingPaper.pdfPath) {
    await removeUploadedFile(req.file);
    return res.status(409).json({ message: 'This paper already has a PDF uploaded' });
  }

  const requesterId = existingPaper.requestedBy.toString();
  const uploaderId = req.user._id.toString();
  const isRequesterUpload = requesterId === uploaderId;
  const isAdminUpload = req.user.role === 'admin';
  const isApprovedWithoutPdf = existingPaper.status === 'not-downloaded' || existingPaper.status === 'approved';

  if (!isAdminUpload && !isRequesterUpload && !isApprovedWithoutPdf) {
    await removeUploadedFile(req.file);
    return res.status(403).json({ message: 'You can only upload a PDF after the request is approved without a PDF' });
  }

  if (existingPaper.status === 'rejected') {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Cannot upload a PDF for a rejected paper' });
  }

  const uploadedPdfPath = await storeUploadedPdf(req.file);
  let nextStatus = 'pending-requester-acceptance';

  if (isAdminUpload || isRequesterUpload) {
    nextStatus = isApprovedWithoutPdf ? 'downloaded' : existingPaper.status;
  }

  const paper = await Paper.findByIdAndUpdate(
    req.params.id,
    {
      pdfPath: uploadedPdfPath,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      status: nextStatus,
      ...calculatePaperQuality({ ...existingPaper.toObject(), pdfPath: uploadedPdfPath }),
    },
    { new: true }
  ).populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  if (!paper) {
    await deleteStoredPdf(uploadedPdfPath);
    await removeUploadedFile(req.file);
    return res.status(404).json({ message: 'Paper not found' });
  }

  await applyUploadCreditReward(paper);
  await syncUserPoints(paper.uploadedBy);
  if (nextStatus === 'downloaded') {
    await syncUserPoints(paper.requestedBy);
  }

  if (nextStatus === 'pending-requester-acceptance') {
    try {
      await notifyPaperRequesterPdfUploaded({
        paperId: paper._id,
        paperTitle: paper.title,
        uploaderName: req.user.fullName,
        actorId: req.user._id,
        requesterId: paper.requestedBy._id || paper.requestedBy,
      });
    } catch (error) {
      console.error('Failed to create requester notification for PDF upload:', error);
    }
  } else if (req.user.role === 'user') {
    try {
      await notifyAdminsPaperPdfUploaded({
        paperId: paper._id,
        paperTitle: paper.title,
        uploaderName: req.user.fullName,
        actorId: req.user._id,
      });
    } catch (error) {
      console.error('Failed to create admin notification for PDF upload:', error);
    }
  }

  res.json({ paper });
}

export async function acceptPaperPdf(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  if (paper.requestedBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the requester can accept this PDF' });
  }

  if (!isPdfWaitingRequesterAcceptance(paper)) {
    return res.status(400).json({ message: 'This paper does not have a PDF waiting for requester acceptance' });
  }

  const updatedPaper = await Paper.findByIdAndUpdate(
    req.params.id,
    { status: 'downloaded', ...calculatePaperQuality(paper) },
    { new: true }
  )
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  await applyUploadCreditReward(updatedPaper);
  await syncUserPoints(updatedPaper.requestedBy);
  if (updatedPaper.uploadedBy) {
    await syncUserPoints(updatedPaper.uploadedBy);
  }

  res.json({ paper: updatedPaper });
}

export async function rejectPaperPdf(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  if (paper.requestedBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the requester can reject this PDF' });
  }

  if (!isPdfWaitingRequesterAcceptance(paper)) {
    return res.status(400).json({ message: 'This paper does not have a PDF waiting for requester acceptance' });
  }

  const rejectedUploader = paper.uploadedBy;

  await deleteStoredPdf(paper.pdfPath);

  const updatedPaper = await Paper.findByIdAndUpdate(
    req.params.id,
    {
      $unset: { pdfPath: '', uploadedBy: '', uploadedAt: '' },
      status: 'not-downloaded',
      ...calculatePaperQuality({ ...paper.toObject(), pdfPath: '', uploadedBy: undefined, uploadedAt: undefined }),
    },
    { new: true }
  )
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  if (rejectedUploader) {
    await recordInvalidPdfUpload(rejectedUploader);
  }
  await syncUserPoints(updatedPaper.requestedBy);

  res.json({ paper: updatedPaper });
}

export async function deletePaperPdf(req, res) {
  if (isInvalidPaperId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(req.params.id);

  if (!paper) return res.status(404).json({ message: 'Paper not found' });

  if (!paper.pdfPath) {
    return res.status(400).json({ message: 'Paper does not have a PDF to delete' });
  }

  await deleteStoredPdf(paper.pdfPath);

  const updatedPaper = await Paper.findByIdAndUpdate(
    req.params.id,
    {
      $unset: { pdfPath: '', uploadedBy: '', uploadedAt: '' },
      status: getResetStatus(paper.status),
    },
    { new: true }
  )
    .populate('requestedBy', 'fullName email university role')
    .populate('uploadedBy', 'fullName university email role');

  if (!updatedPaper) return res.status(404).json({ message: 'Paper not found' });

  if (paper.uploadedBy) {
    await syncUserPoints(paper.uploadedBy);
  }

  res.json({ paper: updatedPaper });
}
