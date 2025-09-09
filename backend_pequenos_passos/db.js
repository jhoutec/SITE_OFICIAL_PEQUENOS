// db.js
import dotenv from 'dotenv';
import dns from 'dns';
import pkg from 'pg';

const { Pool } = pkg;

// Carrega .env local apenas se a variável ainda não estiver presente (Render já injeta via painel)
if (!process.env.DATABASE_URL) {
  dotenv.config();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida. Verifique seu .env ou variáveis de ambiente do Render.');
  process.exit(1);
}

// Força IPv4 (evita ENETUNREACH tentando IPv6)
const ipv4Lookup = (hostname, options, callback) =>
  dns.lookup(hostname, { family: 4, ...options }, callback);

// Configura SSL:
// - Se PGSSLMODE=disable → sem SSL
// - Caso contrário → SSL ativo mas sem rejeitar certificado self-signed (Supabase/Render)
const ssl =
  String(process.env.PGSSLMODE || '').toLowerCase() === 'disable'
    ? false
    : { rejectUnauthorized: false };

export const pool = new Pool({
  connectionString: DATABASE_URL, // ex.: postgresql://user:pass@host:port/db?sslmode=require
  ssl,
  // timeouts conservadores para ambientes serverless/grátis
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  allowExitOnIdle: false,
  // força IPv4
  lookup: ipv4Lookup,
});

export async function migrate() {
  const fs = await import('fs');
  const path = await import('path');

  const filePath = path.resolve('db_migrations/001_init.sql');

  let sql;
  try {
    sql = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('❌ Não consegui ler db_migrations/001_init.sql:', err.message);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migração aplicada com sucesso');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração:', e.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Permite rodar: `node db.js migrate`
if (process.argv[2] === 'migrate') {
  migrate().then(() => process.exit(0));
}
