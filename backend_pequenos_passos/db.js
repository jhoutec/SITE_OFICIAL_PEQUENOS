import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }
});

export async function migrate() {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.resolve('db_migrations/001_init.sql');
  const sql = fs.readFileSync(filePath, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('✅ Migração aplicada');
  } catch (e) {
    await client.query('rollback');
    console.error('❌ Erro na migração:', e.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (process.argv[2] === 'migrate') {
  migrate().then(() => process.exit(0));
}
