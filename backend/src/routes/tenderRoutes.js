import express from 'express';
import { 
  getAllTenders, 
  getFilters, 
  queryTenders
} from '../controllers/tenderController.js';

const router = express.Router();

router.get('/', getAllTenders);
router.get('/filters', getFilters);
router.post('/query', queryTenders);

export default router;
