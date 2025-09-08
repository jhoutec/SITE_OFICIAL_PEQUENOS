// middlewares/auth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    name: user.name || '',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d', subject: String(user.id) });
}

export function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, name, iat, exp, sub }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

// alias para compatibilidade antiga
export const requireAuth = authRequired;

export default { authRequired, adminOnly, requireAuth, signToken };
