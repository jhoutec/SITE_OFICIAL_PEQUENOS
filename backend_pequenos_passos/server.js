// server.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { pool, migrate } from './db.js';

// Rotas podem estar em CommonJS (module.exports)
// Usamos um bridge para funcionar com import ESM:
import * as authRoutesRaw from './routes/auth.js';
import * as productRoutesRaw from './routes/products.js';
import * as orderRoutesRaw from './routes/orders.js';
import * as uploadsRoutesRaw from './routes/uploads.js';
const asRouter = (m) => m.default || m;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = acessível na LAN

// ---------- Middlewares ----------
app.use(
  helmet({
    // Permite carregar imagens/vídeos externos (ex.: Cloudinary) em <img>/<video>
    crossOriginResourcePolicy: false,
  })
);

// se você enviar payloads maiores (ex.: assinaturas Cloudinary)
app.use(express.json({ limit: '5mb' }));

// CORS com origens do .env (CORS_ORIGINS, separadas por vírgula).
// Se não setar, permite todos os origins.
const allowed = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowed.length === 0) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS bloqueado: ' + origin));
    },
    credentials: true,
  })
);

app.use(morgan('tiny'));

// ---------- Health ----------
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() })); // alias p/ front

// ---------- Rotas ----------
const authRoutes = asRouter(authRoutesRaw);
const productRoutes = asRouter(productRoutesRaw);
const orderRoutes = asRouter(orderRoutesRaw);
const uploadsRoutes = asRouter(uploadsRoutesRaw);

app.use('/uploads', uploadsRoutes);
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

// Prefixo /api (compatibilidade com o front)
app.use('/api/uploads', uploadsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// ---------- Handler de erros ----------
app.use((err, _req, res, _next) => {
  console.error(err);
  const msg = err?.message || 'Internal error';
  if (msg.startsWith('CORS bloqueado')) return res.status(403).json({ message: msg });
  res.status(500).json({ message: msg });
});

// ---------- Bootstrap ----------
async function bootstrap() {
  await migrate();

  // cria admin se faltar
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const { rows } = await pool.query('select id from users where email=$1', [process.env.ADMIN_EMAIL]);
    if (!rows[0]) {
      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await pool.query(
        'insert into users (name, email, password_hash, role) values ($1,$2,$3,$4)',
        [process.env.ADMIN_NAME || 'Admin', process.env.ADMIN_EMAIL, hash, 'admin']
      );
      console.log('✅ Admin criado:', process.env.ADMIN_EMAIL);
    }
  }
}

bootstrap().then(() => {
  const hostToShow = HOST === '0.0.0.0' ? (process.env.PUBLIC_IP || '192.168.0.6') : HOST;
  app.listen(PORT, HOST, () => {
    console.log(`🚀 API rodando em http://${hostToShow}:${PORT}`);
  });
});
