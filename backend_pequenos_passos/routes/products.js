import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const asInt = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// GET /api/products
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, description, category, emoji,
             price_cents, image_url, image_public_id,
             active, created_at, updated_at, sizes
      FROM products
      WHERE active = TRUE
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ message: 'Failed to list products' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, category, emoji,
              price_cents, image_url, image_public_id,
              active, created_at, updated_at, sizes
       FROM products WHERE id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /products/:id error:', err);
    res.status(500).json({ message: 'Failed to get product' });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  const {
    name, description, category, emoji,
    price_cents, image_url, image_public_id,
    active = true, sizes = []
  } = req.body || {};

  if (!isNonEmpty(name)) return res.status(400).json({ message: 'name is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO products
        (name, description, category, emoji, price_cents,
         image_url, image_public_id, active, sizes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        name.trim(),
        description ?? null,
        category ?? null,
        emoji ?? '👟',
        asInt(price_cents, 0),
        image_url ?? null,
        image_public_id ?? null,
        Boolean(active),
        JSON.stringify(Array.isArray(sizes) ? sizes : [])
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name, description, category, emoji,
    price_cents, image_url, image_public_id,
    active, sizes
  } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         category = COALESCE($4, category),
         emoji = COALESCE($5, emoji),
         price_cents = COALESCE($6, price_cents),
         image_url = COALESCE($7, image_url),
         image_public_id = COALESCE($8, image_public_id),
         active = COALESCE($9, active),
         sizes = COALESCE($10, sizes),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        isNonEmpty(name) ? name.trim() : null,
        description ?? null,
        category ?? null,
        emoji ?? null,
        Number.isFinite(+price_cents) ? asInt(price_cents, 0) : null,
        image_url ?? null,
        image_public_id ?? null,
        typeof active === 'boolean' ? active : null,
        Array.isArray(sizes) ? JSON.stringify(sizes) : null
      ]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', async (req, res) => {
  const { id } = req.params;
  const { size, deltaQty = 0 } = req.body || {};
  if (!isNonEmpty(String(size))) return res.status(400).json({ message: 'size is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT sizes FROM products WHERE id=$1 FOR UPDATE', [id]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }
    const sizes = Array.isArray(rows[0].sizes) ? rows[0].sizes : [];
    const idx = sizes.findIndex(s => String(s.size) === String(size));
    if (idx >= 0) {
      const current = parseInt(sizes[idx].quantity || 0);
      sizes[idx].quantity = Math.max(0, current + parseInt(deltaQty));
    } else {
      sizes.push({ size: String(size), quantity: Math.max(0, parseInt(deltaQty)) });
    }
    await client.query('UPDATE products SET sizes=$1::jsonb, updated_at=now() WHERE id=$2', [JSON.stringify(sizes), id]);
    await client.query('COMMIT');
    res.json({ ok: true, sizes });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /products/:id/stock error:', err);
    res.status(500).json({ message: 'Failed to update stock' });
  } finally {
    client.release();
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

export default router;
