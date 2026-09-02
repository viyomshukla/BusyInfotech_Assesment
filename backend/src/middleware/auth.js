import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// The cookie is the primary carrier, but Safari ships with "Prevent cross-site
// tracking" on, and the API and the site sit on different registrable domains
// in production — so Safari drops the cookie and every request looks signed
// out. The same token is therefore accepted from an Authorization header.
function readToken(req) {
  const header = req.get('authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return req.cookies?.token ?? null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
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