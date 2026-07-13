import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import excelRouter from './routes/excelRoutes.js';
import tenderRouter from './routes/tenderRoutes.js';
import exportRouter from './routes/exportRoutes.js';
import { getNews } from './controllers/tenderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Self-initialization: ensure uploads folder exists and contains default Excel if none uploaded yet
const uploadsDir = path.join(__dirname, '../uploads');
const currentDbPath = path.join(uploadsDir, 'current-database.xlsx');
const defaultDbPath = path.join(__dirname, 'data/Auction Tracker Database_Version 1.xlsx');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created backend/uploads/ directory.');
  }

  if (!fs.existsSync(currentDbPath)) {
    if (fs.existsSync(defaultDbPath)) {
      fs.copyFileSync(defaultDbPath, currentDbPath);
      console.log('Initialized current-database.xlsx with default template.');
    } else {
      console.warn('Warning: Default Excel template not found at data/ folder.');
    }
  }
} catch (e) {
  console.error('Failed to initialize uploads folder:', e);
}

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: allow all by default; set CORS_ORIGIN to a comma-separated list of
// allowed origins (e.g. your Vercel URL) to lock it down in production.
const corsEnv = (process.env.CORS_ORIGIN || '*').trim();
const allowedOrigins = corsEnv === '*' ? '*' : corsEnv.split(',').map((o) => o.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 2. Map route namespaces
app.use('/api/excel', excelRouter);
app.use('/api/tenders', tenderRouter);
app.use('/api/export', exportRouter);
app.get('/api/news', getNews);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Express Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
