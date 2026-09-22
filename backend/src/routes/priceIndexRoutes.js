import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getMeta, query, uploadPriceIndexFile } from '../controllers/priceIndexController.js';

const router = express.Router();

// Kept separate from the tender workbook so uploading one never clobbers the other.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'current-price-index.xlsx');
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    cb(null, true);
  } else {
    cb(new Error('Only Excel spreadsheet files are allowed (.xlsx, .xls)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get('/meta', getMeta);
router.post('/query', query);
router.post(
  '/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Price index upload error:', err);
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  uploadPriceIndexFile
);

export default router;
