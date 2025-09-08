// scripts/seedAdmin.mjs
// Seed de admin para Postgres/Supabase, forçando SSL sem verificação (resolve self-signed).

import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER || 'postgres'}:${encodeURIComponent(
    process.env.PGPASSWORD || ''
  )}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${
    process.env.PGDATABASE || 'postgres'
  }${
    // garante sslmode=require no fim se não tiver
    /sslmode=/i.test(process.env.DATABASE_URL || '') ? '' : '?sslmode=require'
  }`;

// ⚠️ Força ssl sem verificação para evitar erro SELF_SIGNED_CERT_IN_CHAIN
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT        NOT NULL,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      role          TEXT        NOT NULL DEFAULT 'admin',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function upsertAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@pequenospassos.com';
  const name  = process.env.ADMIN_NAME  || 'Admin';
  const plain = process.env.ADMIN_PASSWORD || 'Pequenos@123';

  const hash = await bcrypt.hash(plain, 10);

  await pool.query(
    `
    INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'admin', NOW(), NOW())
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role = 'admin',
      updated_at = NOW()
  `,
    [crypto.randomUUID(), name, email, hash]
  );

  return { email, password: plain };
}

(async () => {
  await ensureUsersTable();
  const creds = await upsertAdmin();
  console.log('✅ Admin pronto!');
  console.log('   Email:', creds.email);
  console.log('   Senha:', creds.password);
})().catch((err) => {
  console.error('❌ Seed falhou:', err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
