import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getMetadata, uploadExcelFile } from '../controllers/excelController.js';

const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Standardize file name to current-database.xlsx for persistent cached loading
    cb(null, 'current-database.xlsx');
  }
});

// Validator rules: Excel extensions only
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    cb(null, true);
  } else {
    cb(new Error('Only Excel spreadsheet files are allowed (.xlsx, .xls)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max file size
});

router.get('/metadata', getMetadata);
// Accept single file key 'file' matching front-end axios payload
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer Upload Error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, uploadExcelFile);

export default router;
