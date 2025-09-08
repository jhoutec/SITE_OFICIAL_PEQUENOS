// routes/auth.mjs
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { z } from 'zod';
import 'dotenv/config';

const router = express.Router();

// Pool PG (funciona com sua DATABASE_URL do Supabase; SSL liberado para evitar erro de certificado)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

// POST /auth/login -> retorna { token, user }
router.post('/login', async (req, res) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }

    const { email, password } = parsed.data;

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const secret = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('auth/login error:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// (opcional) GET /auth/me para validar token rapidamente
router.get('/me', (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Sem token.' });

    const secret = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, secret);
    return res.json({ ok: true, decoded });
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
});

export default router;
