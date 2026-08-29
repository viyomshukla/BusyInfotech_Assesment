import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/providers', async (req, res) => {
  const providers = await User.find({ role: 'PROVIDER' }).sort({ name: 1 });
  res.json(providers);
});

router.get('/', requireRole('FRONT_DESK'), async (req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  res.json(users);
});

export default router;