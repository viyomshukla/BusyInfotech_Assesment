import jwt from 'jsonwebtoken';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: MAX_AGE_MS,
  };
}