import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json({ documents: [] });
}));

router.post('/upload', asyncHandler(async (req, res) => {
  res.status(201).json({ document: {} });
}));

export default router;
