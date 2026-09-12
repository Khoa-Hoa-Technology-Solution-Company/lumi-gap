import { Router } from 'express';
import {
  createSystemAnnouncement,
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../controllers/notification.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', getMyNotifications);
router.post('/read-all', markAllNotificationsAsRead);
router.post('/announcements', requireRole('admin'), createSystemAnnouncement);
router.patch('/:id/read', markNotificationAsRead);

export default router;
