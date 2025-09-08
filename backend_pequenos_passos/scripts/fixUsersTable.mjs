// scripts/fixUsersTable.mjs
// Ajusta a tabela users para ter as colunas esperadas pelo seed.
// Força SSL "no-verify" para ambientes como Supabase que usam cert intermediário.

import 'dotenv/config';
import { Pool } from 'pg';

// garante que este processo não barre o cert self-signed
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false, require: true },
});

async function main() {
  // cria se não existir (estrutura completa)
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

  // garante as colunas/constraints mesmo se a tabela já existia com outro schema
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email)`);

  console.log('✅ Tabela users ajustada.');
}

main()
  .catch((err) => {
    console.error('❌ Fix falhou:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
