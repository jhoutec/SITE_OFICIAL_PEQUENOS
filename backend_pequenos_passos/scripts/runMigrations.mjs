// scripts/runMigrations.mjs (ESM)
// Executa TODOS os arquivos .sql em backend_pequenos_passos/db_migrations na ordem alfabética.

import { pool } from '../db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../db_migrations');

export async function runMigrations() {
  try {
    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.sql'))
      .map(e => e.name)
      .sort(); // 001_..., 002_..., etc.

    if (files.length === 0) {
      console.log('ℹ️  Nenhum arquivo .sql em db_migrations — nada para migrar.');
      return;
    }

    for (const fname of files) {
      const full = path.join(migrationsDir, fname);
      const sql = await fs.readFile(full, 'utf8');
      console.log(`▶️  Rodando migração: ${fname}`);
      await pool.query(sql); // Postgres aceita múltiplos comandos no mesmo query
      console.log(`✅ Migração OK: ${fname}`);
    }
  } catch (err) {
    console.error('❌ Erro nas migrações:', err?.message || err);
    throw err; // deixa o server.js decidir se continua mesmo com erro
  }
}
