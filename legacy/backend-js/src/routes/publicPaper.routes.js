import { Router } from 'express';
import {
  downloadPublicPaper,
  getPublicPaperById,
  getPublicPaperYears,
  recordPaperView,
  searchPublicPapers,
} from '../controllers/publicPaper.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/public-papers:
 *   get:
 *     summary: Search visible papers for users
 *     tags: [Public Papers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: number
 *       - in: query
 *         name: hasPdf
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, yearDesc, yearAsc, rating, downloads]
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: List of visible papers
 */
router.get('/', searchPublicPapers);

router.get('/years', getPublicPaperYears);

/**
 * @swagger
 * /api/public-papers/{id}:
 *   get:
 *     summary: Get a visible paper detail
 *     tags: [Public Papers]
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
router.get('/:id', getPublicPaperById);

/**
 * @swagger
 * /api/public-papers/{id}/view:
 *   post:
 *     summary: Record a paper view
 *     tags: [Public Papers]
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
 *         description: View count updated
 */
router.post('/:id/view', recordPaperView);

/**
 * @swagger
 * /api/public-papers/{id}/download:
 *   post:
 *     summary: Get PDF download URL and record a download
 *     tags: [Public Papers]
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
 *         description: Download URL returned
 */
router.post('/:id/download', requireAuth, downloadPublicPaper);

export default router;
