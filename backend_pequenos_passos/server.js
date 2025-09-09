// server.js
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { pool, migrate } from './db.js';

// Rotas exportadas como ESM default ou module.exports
import * as authRoutesRaw from './routes/auth.js';
import * as productRoutesRaw from './routes/products.js';
import * as orderRoutesRaw from './routes/orders.js';
import * as uploadsRoutesRaw from './routes/uploads.js';
const asRouter = (m) => m.default || m;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

// --------- Segurança / utilidades ---------
app.set('trust proxy', true);
app.use(
  helmet({
    crossOriginResourcePolicy: false, // permite imagens/vídeos externos
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

// --------- CORS ---------
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

// --------- Health / root ---------
app.get('/', (_req, res) =>
  res.json({ ok: true, service: 'pequenos-passos-backend', ts: Date.now() })
);
app.get('/health', (_req, res) =>
  res.json({ ok: true, uptime: process.uptime() })
);
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, uptime: process.uptime() })
);

// --------- Rotas ---------
const authRoutes = asRouter(authRoutesRaw);
const productRoutes = asRouter(productRoutesRaw);
const orderRoutes = asRouter(orderRoutesRaw);
const uploadsRoutes = asRouter(uploadsRoutesRaw);

// sem /api
app.use('/uploads', uploadsRoutes);
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

// com /api (compat front)
app.use('/api/uploads', uploadsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// --------- 404 ---------
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/api/health')) return next();
  return res.status(404).json({ message: 'Rota não encontrada' });
});

// --------- Handler de erros ---------
app.use((err, _req, res, _next) => {
  console.error(err);
  const msg = err?.message || 'Internal error';
  if (msg.startsWith('CORS bloqueado')) {
    return res.status(403).json({ message: msg });
  }
  res.status(500).json({ message: msg });
});

// --------- Inicialização do DB (não bloqueante) ---------
async function initDatabase() {
  try {
    // teste rápido de conexão
    await pool.query('select 1');
    console.log('✅ Conectado ao Postgres');

    // migração em background
    await migrate();

    // cria admin padrão se não existir
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const { rows } = await pool.query('select id from users where email=$1', [
        process.env.ADMIN_EMAIL,
      ]);
      if (!rows[0]) {
        const bcrypt = (await import('bcryptjs')).default;
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await pool.query(
          'insert into users (name, email, password_hash, role) values ($1,$2,$3,$4)',
          [
            process.env.ADMIN_NAME || 'Admin',
            process.env.ADMIN_EMAIL,
            hash,
            'admin',
          ]
        );
        console.log('✅ Admin criado:', process.env.ADMIN_EMAIL);
      }
    }
  } catch (e) {
    // NÃO derruba o processo: mantém /api/health online
    console.error('❌ Falha ao inicializar banco/migrações:', e.message);
    console.error(
      'Verifique DATABASE_URL/SSL no Render. O app continua servindo /api/health.'
    );
  }
}

// --------- Start do servidor ---------
const server = app.listen(PORT, HOST, () => {
  const hostToShow =
    HOST === '0.0.0.0' ? (process.env.PUBLIC_IP || '127.0.0.1') : HOST;
  console.log(`🚀 API rodando em http://${hostToShow}:${PORT}`);
  // dispara init do banco sem bloquear o boot
  initDatabase();
});

// --------- Shutdown limpo ---------
const shutdown = async (signal) => {
  try {
    console.log(`\n${signal} recebido. Encerrando...`);
    server.close(() => {
      console.log('HTTP fechado.');
    });
    await pool.end().catch(() => {});
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
