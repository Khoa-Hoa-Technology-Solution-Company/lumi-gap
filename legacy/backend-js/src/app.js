import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import authRoutes from './routes/auth.routes.js';
import paperRoutes from './routes/paper.routes.js';
import publicPaperRoutes from './routes/publicPaper.routes.js';
import rankingRoutes from './routes/ranking.routes.js';
import ratingRoutes from './routes/rating.routes.js';
import userRoutes from './routes/user.routes.js';
import notificationRoutes from './routes/notification.routes.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '../uploads');
const extraClientUrls = (process.env.CLIENT_URLS || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const allowedOrigins = [
  process.env.CLIENT_URL,
  ...extraClientUrls,
  `http://localhost:${process.env.PORT || 5000}`,
  `http://127.0.0.1:${process.env.PORT || 5000}`,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  exposedHeaders: ['X-Access-Token'],
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsPath));
app.get('/uploads/:filename', (req, res, next) => {
  const { filename } = req.params;

  if (!filename) {
    return next();
  }

  return res.sendFile(path.join(uploadsPath, filename), (error) => {
    if (error) {
      next(error);
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ message: 'LiemResearch API is running' });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/public-papers', publicPaperRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

export default app;
