import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

let io;

function buildAllowedOrigins() {
  return [
    process.env.CLIENT_URL,
    ...(process.env.CLIENT_URLS || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
    `http://localhost:${process.env.PORT || 5000}`,
    `http://127.0.0.1:${process.env.PORT || 5000}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ].filter(Boolean);
}

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: buildAllowedOrigins(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Missing socket token'));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET || 'liemresearch_local_secret');
      socket.data.user = {
        id: payload.id,
        role: payload.role || 'user',
      };

      return next();
    } catch (_error) {
      return next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    if (user?.role) {
      socket.join(`role:${user.role}`);
    }

    if (user?.id) {
      socket.join(`user:${user.id}`);
    }
  });

  return io;
}

export function getSocket() {
  return io;
}

export function emitNotificationToRole(role, payload) {
  if (!io) return;

  io.to(`role:${role}`).emit('notification:new', payload);
}

export function emitNotificationToUser(userId, payload) {
  if (!io || !userId) return;

  io.to(`user:${userId.toString()}`).emit('notification:new', payload);
}
