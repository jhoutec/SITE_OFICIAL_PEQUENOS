// scripts/patch_schema.js
import 'dotenv/config';
import pkg from 'pg';

pkg.defaults.ssl = { rejectUnauthorized: false };
const { Pool } = pkg;

function normalizeConn(str) {
  if (!str) return '';
  let s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  s = s.replace(/^postgresql:\/\//i, 'postgres://');
  return s.replace(/\bsslmode=require\b/i, 'sslmode=no-verify');
}

const conn = normalizeConn(process.env.DATABASE_URL || '');
const pool = conn
  ? new Pool({ connectionString: conn, ssl: /localhost|127\.0\.0\.1/i.test(conn) ? false : { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: { rejectUnauthorized: false },
    });

async function exec(sql, params = []) {
  try {
    await pool.query(sql, params);
    console.log('ok:', sql.split('\n')[0].slice(0, 80));
  } catch (e) {
    console.log('skip/err:', sql.split('\n')[0].slice(0, 80), '-', e.message);
  }
}

async function run() {
  console.log('🔧 Patching database schema...');

  // Extensão para gen_random_uuid()
  await exec('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  // ---------- PRODUCTS ----------
  // (somente adiciona campos que muitas vezes faltam)
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS sizes         jsonb DEFAULT '[]'::jsonb;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS sizes_json    jsonb DEFAULT '[]'::jsonb;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS images        jsonb DEFAULT '[]'::jsonb;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS image_url     text;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS image_public_id text;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS video_url     text;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS video_public_id text;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS price         numeric;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS price_cents   integer;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS stock         integer DEFAULT 0;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS active        boolean DEFAULT true;`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();`);
  await exec(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();`);

  // ---------- ORDERS ----------
  // cria tabela se não existir
  await exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_name   text,
      customer_phone  text,
      customer_address text,
      payment_method  text,
      notes           text,
      total_cents     int  DEFAULT 0,
      status          text DEFAULT 'PENDING',
      created_at      timestamptz DEFAULT now(),
      updated_at      timestamptz DEFAULT now()
    );
  `);
  // adiciona colunas que possam estar faltando na sua tabela antiga
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name     text;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone    text;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address  text;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method    text;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes             text;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cents       int  DEFAULT 0;`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status            text DEFAULT 'PENDING';`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now();`);
  await exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();`);

  // se sua coluna id já existe mas é UUID sem default, seta default
  await exec(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='orders' AND column_name='id' AND data_type='uuid'
      ) THEN
        EXECUTE 'ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid()';
      END IF;
    END $$;
  `);

  // ---------- ORDER_ITEMS ----------
  await exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id bigserial PRIMARY KEY,
      order_id  uuid REFERENCES orders(id) ON DELETE CASCADE,
      product_id text NOT NULL,
      size      text,
      qty       int  NOT NULL,
      price_cents int NOT NULL
    );
  `);
  await exec(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS order_id    uuid;`);
  await exec(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id  text;`);
  await exec(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size        text;`);
  await exec(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS qty         int;`);
  await exec(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_cents int;`);

  console.log('✅ Patch concluído.');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
