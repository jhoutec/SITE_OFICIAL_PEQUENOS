// backend/server.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Database = require('better-sqlite3');

// ---- Config/env
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'pequenospassos123';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---- Static (uploads)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const IMAGES_DIR  = path.join(UPLOADS_DIR, 'images');
const VIDEOS_DIR  = path.join(UPLOADS_DIR, 'videos');
for (const d of [UPLOADS_DIR, IMAGES_DIR, VIDEOS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// ---- Multer storages
const imageStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, IMAGES_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/\s+/g,'_').toLowerCase();
    cb(null, Date.now() + '_' + safe);
  }
});
const videoStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, VIDEOS_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/\s+/g,'_').toLowerCase();
    cb(null, Date.now() + '_' + safe);
  }
});
const uploadImage = multer({ storage: imageStorage });
const uploadVideo = multer({ storage: videoStorage });

// ---- DB (SQLite)
const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  category TEXT,
  emoji TEXT,
  image_url TEXT,
  image_public_id TEXT,
  video_url TEXT,
  video_public_id TEXT,
  sizes_json TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  status TEXT DEFAULT 'PENDING',
  total_cents INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  size TEXT,
  qty INTEGER,
  price_cents INTEGER,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

// ---- Auth helpers
function auth(req, res, next){
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- Endpoints: Auth
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if ((email || '').trim() === ADMIN_EMAIL && (password || '') === ADMIN_PASS) {
    const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { email, role: 'admin' }});
  }
  // também aceita usuário "admin" sem arroba (compatível com o front)
  if ((email || '').trim() === 'admin' && (password || '') === ADMIN_PASS) {
    const token = jwt.sign({ email: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { email: 'admin', role: 'admin' }});
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/auth/me', auth, (req, res) => {
  res.json({ user: { email: req.user.email, role: req.user.role || 'admin' } });
});

// ---- Endpoints: Uploads
app.post('/upload/image', uploadImage.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const publicPath = `/uploads/images/${req.file.filename}`;
  return res.json({ url: publicPath, public_id: `images/${req.file.filename}` });
});

app.post('/upload/video', uploadVideo.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video' });
  const publicPath = `/uploads/videos/${req.file.filename}`;
  return res.json({ url: publicPath, public_id: `videos/${req.file.filename}` });
});

// ---- Helpers Products <-> DB
function rowToProduct(r){
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    category: r.category || 'Geral',
    emoji: r.emoji || '👟',
    price: Number(r.price || 0),
    sizes: JSON.parse(r.sizes_json || '[]'),
    images: r.image_url ? [r.image_url] : [],
    image_public_id: r.image_public_id || null,
    video: r.video_url || null,
    video_public_id: r.video_public_id || null,
    video_playback_url: r.video_url || null
  };
}

// ---- Endpoints: Products (CRUD)
app.get('/products', (req, res) => {
  const rows = db.prepare(`SELECT * FROM products ORDER BY id DESC`).all();
  res.json(rows.map(rowToProduct));
});

app.post('/products', auth, (req, res) => {
  const p = req.body || {};
  const sizesJson = JSON.stringify(p.sizes || []);
  const stmt = db.prepare(`
    INSERT INTO products (name, description, price, category, emoji, image_url, image_public_id, video_url, video_public_id, sizes_json)
    VALUES (@name, @description, @price, @category, @emoji, @image_url, @image_public_id, @video_url, @video_public_id, @sizes_json)
  `);
  const info = stmt.run({
    name: p.name,
    description: p.description || p.name,
    price: Number(p.price || 0),
    category: p.category || 'Geral',
    emoji: p.emoji || '👟',
    image_url: p.image_url || null,
    image_public_id: p.image_public_id || null,
    video_url: p.video_url || null,
    video_public_id: p.video_public_id || null,
    sizes_json: sizesJson
  });
  const row = db.prepare(`SELECT * FROM products WHERE id=?`).get(info.lastInsertRowid);
  res.json(rowToProduct(row));
});

app.patch('/products/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare(`SELECT COUNT(*) c FROM products WHERE id=?`).get(id).c;
  if(!exists) return res.status(404).json({ error: 'Not found' });

  const p = req.body || {};
  const sizesJson = JSON.stringify(p.sizes || []);
  db.prepare(`
    UPDATE products SET
      name=@name, description=@description, price=@price, category=@category, emoji=@emoji,
      image_url=@image_url, image_public_id=@image_public_id,
      video_url=@video_url, video_public_id=@video_public_id,
      sizes_json=@sizes_json
    WHERE id=@id
  `).run({
    id,
    name: p.name,
    description: p.description || p.name,
    price: Number(p.price || 0),
    category: p.category || 'Geral',
    emoji: p.emoji || '👟',
    image_url: p.image_url || null,
    image_public_id: p.image_public_id || null,
    video_url: p.video_url || null,
    video_public_id: p.video_public_id || null,
    sizes_json: sizesJson
  });
  const row = db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
  res.json(rowToProduct(row));
});

app.delete('/products/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM products WHERE id=?`).run(id);
  res.json({ ok: true });
});

// ---- Endpoints: Orders
app.get('/orders', auth, (req, res) => {
  // suporta ?limit=&page= (sem rigor)
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const offset = Math.max(0, (Number(req.query.page || 1) - 1) * limit);
  const rows = db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json(rows);
});

app.get('/orders/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const ord = db.prepare(`SELECT * FROM orders WHERE id=?`).get(id);
  if(!ord) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(id);
  res.json({ ...ord, items });
});

app.post('/orders', (req, res) => {
  const body = req.body || {};
  const cust = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];

  const totalCents = items.reduce((s, it) => s + Number(it.price_cents||0) * Number(it.qty||0), 0);

  const info = db.prepare(`
    INSERT INTO orders (customer_name, customer_phone, customer_address, status, total_cents)
    VALUES (@name, @phone, @address, 'PENDING', @total)
  `).run({
    name: cust.name || 'Cliente',
    phone: cust.phone || '',
    address: cust.address || '',
    total: totalCents
  });

  const orderId = info.lastInsertRowid;
  const stmtItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, size, qty, price_cents)
    VALUES (@order_id, @product_id, @size, @qty, @price_cents)
  `);
  const tx = db.transaction((arr) => {
    arr.forEach(it => stmtItem.run({
      order_id: orderId,
      product_id: it.product_id || null,
      size: it.size || null,
      qty: Number(it.qty||0),
      price_cents: Number(it.price_cents||0)
    }));
  });
  tx(items);

  const ord = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId);
  const det = db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(orderId);
  res.json({ ...ord, items: det });
});

// ---- Start
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
