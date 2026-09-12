import { Router } from 'express';
import {
  createPaperComment,
  createRating,
  deletePaperComment,
  deleteRating,
  getPaperComments,
  getPaperRatings,
  getRatingById,
  togglePaperCommentLike,
  updateRating,
} from '../controllers/rating.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/ratings/papers/{paperId}:
 *   get:
 *     summary: Get ratings for a paper
 *     tags: [Ratings]
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of paper ratings
 */
router.get('/papers/:paperId', getPaperRatings);

router.get('/papers/:paperId/comments', optionalAuth, getPaperComments);

/**
 * @swagger
 * /api/ratings/papers/{paperId}:
 *   post:
 *     summary: Create current user's rating for a paper
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paperId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comment:
 *                 type: string
 *                 example: Useful paper for retrieval research.
 *     responses:
 *       201:
 *         description: Rating created
 */
router.post('/papers/:paperId', requireAuth, createRating);

router.post('/papers/:paperId/comments', requireAuth, createPaperComment);

router.patch('/comments/:id/like', requireAuth, togglePaperCommentLike);

router.delete('/comments/:id', requireAuth, deletePaperComment);

/**
 * @swagger
 * /api/ratings/{id}:
 *   get:
 *     summary: Get one rating
 *     tags: [Ratings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rating detail
 */
router.get('/:id', getRatingById);

/**
 * @swagger
 * /api/ratings/{id}:
 *   patch:
 *     summary: Update current user's rating
 *     tags: [Ratings]
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
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               comment:
 *                 type: string
 *                 example: Updated comment.
 *     responses:
 *       200:
 *         description: Rating updated
 */
router.patch('/:id', requireAuth, updateRating);

/**
 * @swagger
 * /api/ratings/{id}:
 *   delete:
 *     summary: Delete current user's rating
 *     tags: [Ratings]
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
 *         description: Rating deleted
 */
router.delete('/:id', requireAuth, deleteRating);

export default router;
