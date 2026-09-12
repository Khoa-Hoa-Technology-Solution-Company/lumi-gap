import { Router } from 'express';
import { getMyRanking, getTopUsers, getUserRankingById } from '../controllers/ranking.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/rankings/top:
 *   get:
 *     summary: Get top users by contribution points
 *     tags: [Rankings]
 *     responses:
 *       200:
 *         description: Top users
 */
router.get('/top', getTopUsers);

/**
 * @swagger
 * /api/rankings/me:
 *   get:
 *     summary: Get current user's ranking
 *     tags: [Rankings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's ranking
 */
router.get('/me', requireAuth, getMyRanking);

/**
 * @swagger
 * /api/rankings/users/{id}:
 *   get:
 *     summary: Get a user's ranking by id
 *     tags: [Rankings]
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
 *         description: User ranking
 */
router.get('/users/:id', requireAuth, requireRole('admin'), getUserRankingById);

export default router;
