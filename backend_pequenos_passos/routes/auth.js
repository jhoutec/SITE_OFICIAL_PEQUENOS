// routes/auth.js
import express from 'express';
import { pool } from '../db.js';
import { signToken, authRequired } from '../middlewares/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// POST /auth/login { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Credenciais inválidas' });

  try {
    const { rows } = await pool.query('select * from users where email=$1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Email ou senha inválidos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Email ou senha inválidos' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    res.status(500).json({ message: 'Erro no login' });
  }
});

// GET /auth/me
router.get('/me', authRequired, (req, res) => {
  res.json({ decoded: req.user });
});

export default router;
