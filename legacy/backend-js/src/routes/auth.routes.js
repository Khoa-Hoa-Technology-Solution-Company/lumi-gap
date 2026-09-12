import { Router } from 'express';
import { changePassword, deleteMe, login, me, register, updateMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a normal user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, university, email, password, confirmPassword]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               university:
 *                 type: string
 *                 example: FPT University
 *               email:
 *                 type: string
 *                 example: user@liemresearch.com
 *               password:
 *                 type: string
 *                 example: User123456
 *               confirmPassword:
 *                 type: string
 *                 example: User123456
 *     responses:
 *       201:
 *         description: User registered
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@liemresearch.com
 *               password:
 *                 type: string
 *                 example: Admin123456
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current logged-in user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 */
router.get('/me', requireAuth, me);

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update current user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
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
 *               # studentId removed from profile
 *     responses:
 *       200:
 *         description: Updated user
 */
router.patch('/me', requireAuth, updateMe);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change current user's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: User123456
 *               newPassword:
 *                 type: string
 *                 example: User123456New
 *               confirmPassword:
 *                 type: string
 *                 example: User123456New
 *     responses:
 *       200:
 *         description: Password updated
 */
router.post('/change-password', requireAuth, changePassword);

/**
 * @swagger
 * /api/auth/me:
 *   delete:
 *     summary: Delete current user's account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 example: User123456
 *     responses:
 *       200:
 *         description: Account deleted
 */
router.delete('/me', requireAuth, deleteMe);

export default router;
