import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { signToken } from '../utils/token.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Missing access token' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'liemresearch_local_secret');
    const user = await User.findById(payload.id);

    if (!user) {
      return res.status(401).json({ message: 'Invalid access token' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ message: 'Your account has been banned' });
    }

    req.user = user;
    res.setHeader('X-Access-Token', signToken(user));
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired access token' });
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'liemresearch_local_secret');
      const user = await User.findById(payload.id);
      if (user && user.status !== 'banned') req.user = user;
    }
  } catch (_error) {
    req.user = undefined;
  }

  next();
}
