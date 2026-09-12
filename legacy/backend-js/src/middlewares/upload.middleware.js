import multer from 'multer';
import { recordInvalidPdfUpload } from '../utils/points.js';

export const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
});

export function uploadSinglePdf(req, res, next) {
  uploadPdf.single('pdf')(req, res, async (err) => {
    if (!err) {
      next();
      return;
    }

    if (req.user?._id && err.message === 'Only PDF files are allowed') {
      await recordInvalidPdfUpload(req.user._id);
      res.status(400).json({ message: 'Please upload a valid PDF file' });
      return;
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'PDF file must be 50MB or smaller' });
      return;
    }

    next(err);
  });
}
