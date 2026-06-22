import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json({ prompts: [] });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ prompt: {} });
}));

export default router;
