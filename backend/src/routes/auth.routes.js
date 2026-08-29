import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import User, { ROLES } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken, cookieOptions } from '../utils/token.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(ROLES),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', validate(registerSchema), async (req, res) => {
  const { email, password, name, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, name, role });

  res.status(201).json(user);
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await user.checkPassword(password);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.cookie('token', signToken(user), cookieOptions());
  res.json(user);
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions());
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;