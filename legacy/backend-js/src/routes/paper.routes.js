import { Router } from 'express';
import {
  createPaper,
  acceptPaperPdf,
  cancelMyPaperRequest,
  deletePaper,
  getAllPapers,
  getMyPapers,
  getPaperById,
  getPaperPdfDownloadUrl,
  updatePaper,
  updatePaperStatus,
  deletePaperPdf,
  uploadPaperPdf,
  rejectPaperPdf,
} from '../controllers/paper.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { uploadSinglePdf } from '../middlewares/upload.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/papers:
 *   post:
 *     summary: Create a paper download request
 *     tags: [Papers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, doi, paperType, paperLink, abstract, publishedYear]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Deep Learning for Scientific Paper Retrieval
 *               doi:
 *                 type: string
 *                 example: 10.1234/liem.2026.001
 *               paperType:
 *                 type: string
 *                 example: Survey
 *               paperLink:
 *                 type: string
 *                 example: https://example.com/paper/001
 *               abstract:
 *                 type: string
 *                 example: This paper studies scientific paper retrieval.
 *               authors:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [Nguyen Van A, Tran Thi B]
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [research, retrieval, deep learning]
 *               publishedYear:
 *                 type: number
 *                 example: 2026
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, doi, paperType, paperLink, abstract, publishedYear]
 *             properties:
 *               title:
 *                 type: string
 *               doi:
 *                 type: string
 *               paperType:
 *                 type: string
 *               paperLink:
 *                 type: string
 *               abstract:
 *                 type: string
 *               authors:
 *                 type: array
 *                 items:
 *                   type: string
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *               publishedYear:
 *                 type: number
 *               pdf:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Paper request created
 */
router.post('/', requireAuth, uploadSinglePdf, createPaper);

/**
 * @swagger
 * /api/papers/my-requests:
 *   get:
 *     summary: Get current user's paper requests
 *     tags: [Papers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of current user's requests
 */
router.get('/my-requests', requireAuth, getMyPapers);

/**
 * @swagger
 * /api/papers:
 *   get:
 *     summary: Admin gets all paper requests
 *     tags: [Admin Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, rejected, downloaded, not-downloaded]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all paper requests
 */
router.get('/', requireAuth, requireRole('admin'), getAllPapers);

/**
 * @swagger
 * /api/papers/{id}:
 *   get:
 *     summary: Get one paper request
 *     tags: [Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paper detail
 */
router.get('/:id', requireAuth, getPaperById);

router.get('/:id/pdf-url', requireAuth, getPaperPdfDownloadUrl);

/**
 * @swagger
 * /api/papers/{id}:
 *   patch:
 *     summary: Admin updates paper request details
 *     tags: [Admin Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Updated Paper Title
 *               doi:
 *                 type: string
 *                 example: 10.1234/liem.2026.updated
 *               paperType:
 *                 type: string
 *                 example: Research
 *               paperLink:
 *                 type: string
 *                 example: https://example.com/paper/updated
 *               abstract:
 *                 type: string
 *                 example: Updated abstract for this paper.
 *               authors:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [Nguyen Van A, Tran Thi B]
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [research, updated]
 *               publishedYear:
 *                 type: number
 *                 example: 2026
 *               status:
 *                 type: string
 *                 enum: [pending, rejected, downloaded, not-downloaded]
 *                 example: pending
 *     responses:
 *       200:
 *         description: Paper updated
 */
router.patch('/:id', requireAuth, requireRole('admin'), updatePaper);

/**
 * @swagger
 * /api/papers/{id}/status:
 *   patch:
 *     summary: Admin updates paper status
 *     tags: [Admin Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, rejected, downloaded, not-downloaded]
 *                 example: not-downloaded
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:id/status', requireAuth, requireRole('admin'), updatePaperStatus);

/**
 * @swagger
 * /api/papers/{id}/upload-pdf:
 *   post:
 *     summary: Upload a PDF for a paper if it does not already have one
 *     tags: [Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdf:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: PDF uploaded
 *       409:
 *         description: Paper already has a PDF
 */
router.post('/:id/upload-pdf', requireAuth, uploadSinglePdf, uploadPaperPdf);

router.patch('/:id/accept-pdf', requireAuth, acceptPaperPdf);

router.patch('/:id/reject-pdf', requireAuth, rejectPaperPdf);

router.delete('/:id/cancel', requireAuth, cancelMyPaperRequest);

/**
 * @swagger
 * /api/papers/{id}/pdf:
 *   delete:
 *     summary: Delete an uploaded PDF from a paper
 *     tags: [Admin Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF deleted
 */
router.delete('/:id/pdf', requireAuth, requireRole('admin'), deletePaperPdf);

/**
 * @swagger
 * /api/papers/{id}:
 *   delete:
 *     summary: Admin deletes a paper request
 *     tags: [Admin Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paper deleted
 */
router.delete('/:id', requireAuth, deletePaper);

export default router;
