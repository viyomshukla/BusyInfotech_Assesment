import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
  };
}