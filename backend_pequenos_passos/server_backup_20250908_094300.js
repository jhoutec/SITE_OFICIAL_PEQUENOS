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

// Middlewares
app.use(helmet());
app.use(express.json({ limit: '2mb' }));

// CORS (origens permitidas via .env: CORS_ORIGINS="http://localhost:3000,https://seusite.com")
const allowed = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS bloqueado'));
    },
    credentials: true,
  })
);

app.use(morgan('tiny'));

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Rotas
app.use('/uploads', uploadsRoutes);
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

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
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
});
