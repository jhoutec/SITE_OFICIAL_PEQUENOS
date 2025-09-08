// scripts/seedAdmin.js
// Cria/atualiza um usuário admin no banco, usando a conexão exportada em ./db.js
// Compatível com sqlite3, better-sqlite3 ou mysql2 (pool)

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let db;
try {
  db = require('../db'); // <-- usa sua conexão existente
} catch (e) {
  console.error('❌ Não foi possível carregar ./db.js. Confirme o caminho e export.');
  process.exit(1);
}

// Adaptações para diferentes drivers:
const isBetterSqlite = db && typeof db.prepare === 'function';              // better-sqlite3
const isSqlite3      = db && typeof db.run === 'function' && typeof db.get === 'function'; // sqlite3
const isMySQL        = db && typeof db.query === 'function';                // mysql2/promise

async function run(sql, params = []) {
  if (isBetterSqlite) {
    return db.prepare(sql).run(params);
  } else if (isSqlite3) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  } else if (isMySQL) {
    await db.query(sql, params);
    return { changes: 1 };
  }
  throw new Error('Driver de DB não suportado pelo seed.');
}

async function get(sql, params = []) {
  if (isBetterSqlite) {
    return db.prepare(sql).get(params);
  } else if (isSqlite3) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, function (err, row) {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  } else if (isMySQL) {
    const [rows] = await db.query(sql, params);
    return rows && rows[0] ? rows[0] : null;
  }
  throw new Error('Driver de DB não suportado pelo seed.');
}

function nowISO() {
  return new Date().toISOString();
}

async function ensureUsersTable() {
  // SQL genérico (sem DEFAULTs específicos pra cada banco)
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(50) PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role          VARCHAR(50)  NOT NULL,
      created_at    VARCHAR(30)  NOT NULL,
      updated_at    VARCHAR(30)  NOT NULL
    )
  `;
  await run(sql);
}

async function upsertAdmin() {
  const email = 'admin@pequenospassos.com';
  const name  = 'Admin';
  const plain = 'Pequenos@123'; // senha

  const hash = await bcrypt.hash(plain, 10);
  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);

  const ts = nowISO();

  if (existing) {
    await run(
      'UPDATE users SET name = ?, password_hash = ?, role = ?, updated_at = ? WHERE email = ?',
      [name, hash, 'admin', ts, email]
    );
    return { email, password: plain, updated: true };
  } else {
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, name, email, hash, 'admin', ts, ts]
    );
    return { email, password: plain, created: true };
  }
}

(async () => {
  await ensureUsersTable();
  const res = await upsertAdmin();
  console.log('✅ Admin pronto!');
  console.log('   Email:', res.email);
  console.log('   Senha:', res.password);
  console.log(res.created ? '   (criado)' : '   (atualizado)');
  process.exit(0);
})().catch((err) => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
