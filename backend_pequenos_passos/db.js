// db.js (ESM)
// Requisitos:
//  - package.json com: { "type": "module" }
//  - dependência: "pg" ^8
//
// Variáveis de ambiente esperadas no Render/local:
//  - DATABASE_URL  (obrigatória em produção)
//  - NODE_ENV      (opcional; default: development)
//  - PG_MAX        (opcional; ex: 5)
//  - PG_IDLE       (opcional; ms, ex: 30000)
//  - PG_CONNECT_TIMEOUT (opcional; ms, ex: 10000)
//
// Exemplos de DATABASE_URL:
//  - Direta (porta 5432):
//    postgresql://USER:PASS@HOST:5432/DB?sslmode=require
//  - Pooled/PgBouncer (porta 6543 — só se o provedor oferecer pool):
//    postgresql://USER:PASS@HOST:6543/DB?sslmode=require&pgbouncer=true

import pkg from 'pg';
const { Pool } = pkg;

// ===== Env =====
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!DATABASE_URL && NODE_ENV === 'production') {
  console.error('❌ DATABASE_URL não definida. Configure nas Environment Variables do Render.');
}

// ===== SSL =====
// Em produção e/ou quando a URL não é localhost, força SSL.
const useSSL = (() => {
  if (NODE_ENV === 'production') return true;
  if (DATABASE_URL && !/localhost|127\.0\.0\.1/i.test(DATABASE_URL)) return true;
  return false;
})();

const ssl = useSSL ? { rejectUnauthorized: false } : undefined;

// ===== Pool =====
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl,
  max: Number(process.env.PG_MAX || 5),
  idleTimeoutMillis: Number(process.env.PG_IDLE || 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT || 10_000),
  allowExitOnIdle: false,
});

// Helper opcional para consultas
export async function query(text, params) {
  // if (NODE_ENV !== 'production') console.log('SQL:', text, params ?? []);
  return pool.query(text, params);
}

// ===== Teste inicial (não derruba o processo) =====
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conectado ao Postgres (pool ativo)');
  } catch (err) {
    console.error('❌ Erro ao conectar no Postgres:', err?.message || err);
    console.error('   - Verifique DATABASE_URL, porta (5432 vs 6543) e sslmode=require na URL.');
    console.error('   - Em pooled (6543), considere adicionar "&pgbouncer=true".');
  }
})();

// ===== Encerramento gracioso =====
async function shutdown(signal) {
  try {
    console.log(`\n⏹  Recebido ${signal}. Encerrando pool Postgres...`);
    await pool.end();
    console.log('✅ Pool Postgres encerrado.');
    process.exit(0);
  } catch (e) {
    console.error('⚠️  Erro ao encerrar pool:', e?.message || e);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
