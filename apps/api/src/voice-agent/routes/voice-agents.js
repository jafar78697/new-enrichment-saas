import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

// GET /api/voice/agents
router.get('/', asyncHandler(async (req, res) => {
  res.json({ agents: [] });
}));

// POST /api/voice/agents
router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ agent: {} });
}));

// PATCH /api/voice/agents/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  res.json({ agent: {} });
}));

// DELETE /api/voice/agents/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  res.status(204).send();
}));

export default router;
