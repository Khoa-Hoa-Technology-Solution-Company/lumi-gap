import { Router } from 'express';
import {
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
  updateUserStatus,
} from '../controllers/user.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Admin gets all users
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, admin]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, banned]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', getUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Admin gets one user
 *     tags: [Admin Users]
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
 *         description: User detail
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Admin updates user details
 *     tags: [Admin Users]
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
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               university:
 *                 type: string
 *                 example: FPT University
 *               studentId:
 *                 type: string
 *                 example: SE190001
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 example: user
 *               status:
 *                 type: string
 *                 enum: [active, banned]
 *                 example: active
 *     responses:
 *       200:
 *         description: User updated
 */
router.patch('/:id', updateUser);

/**
 * @swagger
 * /api/users/{id}/status:
 *   patch:
 *     summary: Admin updates user status
 *     tags: [Admin Users]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, banned]
 *                 example: banned
 *     responses:
 *       200:
 *         description: User status updated
 */
router.patch('/:id/status', updateUserStatus);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Admin deletes a user
 *     tags: [Admin Users]
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
 *         description: User deleted
 */
router.delete('/:id', deleteUser);

export default router;
