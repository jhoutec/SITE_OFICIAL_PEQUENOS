// server.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { pool, migrate } from './db.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import uploadsRoutes from './routes/uploads.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = acessível na LAN; use 127.0.0.1 se quiser só local

// Middlewares
app.use(helmet());
app.use(express.json({ limit: '2mb' }));

// CORS (origens via .env, separadas por vírgula)
const allowed = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/postman
      if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS bloqueado'));
    },
    credentials: true,
  })
);

app.use(morgan('tiny'));

// Healthchecks
app.get('/api/health', (req, res) =>
  res.json({ ok: true, uptime: process.uptime() })
);

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() })); // alias p/ front

// Rotas (originais)
app.use('/uploads', uploadsRoutes);
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

// Rotas com prefixo /api (compatibilidade com o front)
app.use('/api/uploads', uploadsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Bootstrap DB e admin
async function bootstrap() {
  await migrate();

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
  app.listen(PORT, HOST, () => {
    console.log(`API rodando em http://${HOST === '0.0.0.0' ? (process.env.PUBLIC_IP || '192.168.0.6') : HOST}:${PORT}`);
  });
});
