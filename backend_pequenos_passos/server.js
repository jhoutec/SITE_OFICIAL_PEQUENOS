// server.js (ESM)
// Requisitos: "type": "module" no package.json

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { pool } from './db.js';                 // cria Pool do pg com SSL
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import { runMigrations } from './migrations/init.js';

const app = express();

// ===== Config / Environment =====
const PORT = process.env.PORT || 8000;
// Pode definir uma ou mais origens separadas por vírgula
// Ex.: ORIGIN="https://meusite.com,https://admin.meusite.com"
const ORIGIN = (process.env.ORIGIN || '*').trim();

// ===== Middlewares básicos =====
app.set('trust proxy', true);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== CORS =====
let corsOptions = {};
if (ORIGIN === '*') {
  corsOptions = { origin: true, credentials: true };
} else {
  const origins = ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  corsOptions = {
    origin(origin, cb) {
      // Permite ferramentas sem origin (curl, health-check) e as origens configuradas
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS bloqueado para origem: ${origin}`));
    },
    credentials: true,
  };
}
app.use(cors(corsOptions));

// ===== Logs =====
app.use(morgan('combined'));

// ===== Healthcheck rápido =====
app.get('/api/health', async (req, res) => {
  // tenta pingar DB sem derrubar caso falhe
  let db = false;
  try {
    await pool.query('SELECT 1');
    db = true;
  } catch (_) { /* mantém db=false */ }

  res.json({
    ok: true,
    uptime: process.uptime(),
    db,
    ts: new Date().toISOString(),
  });
});

// ===== Rotas da API =====
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

// Raiz opcional (útil pra ver no Render que está vivo)
app.get('/', (req, res) => {
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Pequenos Passos API</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu; padding:24px">
  <h1>🚀 API Pequenos Passos</h1>
  <p>Veja <code>/api/health</code>, <code>/api/products</code> e <code>/api/orders</code>.</p>
</body></html>`);
});

// 404 (após rotas)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Handler de erro (não deixa processo cair)
app.use((err, req, res, _next) => {
  console.error('❌ Unhandled error:', err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ===== Subida + Migrações =====
async function bootstrap() {
  // Tenta rodar migrações, mas não derruba o app se falhar
  try {
    await runMigrations();
    console.log('✅ Migrações OK');
  } catch (e) {
    console.error('❌ Falha ao inicializar banco/migrações:\n', e?.message || e);
    console.error('Verifique DATABASE_URL/SSL. O app continua servindo /api/health.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API rodando em http://0.0.0.0:${PORT}`);
  });
}

// Para garantir que rejeições não derrubem:
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  UncaughtException:', err);
});

bootstrap();
