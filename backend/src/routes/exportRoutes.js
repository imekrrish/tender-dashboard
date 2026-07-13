import express from 'express';
import { downloadXlsx, downloadCsv } from '../controllers/exportController.js';

const router = express.Router();

router.post('/xlsx', downloadXlsx);
router.post('/csv', downloadCsv);

export default router;
