// routes/products.js (ESM)
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/* Utilidades simples */
const asInt = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/* ===========================
 * GET /products
 * - Traz produtos e (se existir) os tamanhos em product_sizes
 * - Se a tabela product_sizes ainda não existir, faz fallback sem sizes
 * =========================== */
router.get('/', async (_req, res) => {
  const withSizesSQL = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.category,
      p.emoji,
      p.price_cents,
      p.image_url,
      p.image_public_id,
      p.video_url,
      p.video_public_id,
      p.active,
      p.created_at,
      p.updated_at,
      COALESCE(
        json_agg(
          json_build_object('size', ps.size, 'quantity', ps.quantity)
          ORDER BY ps.size
        ) FILTER (WHERE ps.size IS NOT NULL),
        '[]'::json
      ) AS sizes
    FROM public.products p
    LEFT JOIN public.product_sizes ps ON ps.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const noSizesSQL = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.category,
      p.emoji,
      p.price_cents,
      p.image_url,
      p.image_public_id,
      p.video_url,
      p.video_public_id,
      p.active,
      p.created_at,
      p.updated_at,
      '[]'::json AS sizes
    FROM public.products p
    ORDER BY p.created_at DESC
  `;

  try {
    const { rows } = await pool.query(withSizesSQL);
    res.json(rows);
  } catch (err) {
    // 42P01 = undefined_table (product_sizes ainda não criada)
    if (err?.code === '42P01') {
      try {
        const { rows } = await pool.query(noSizesSQL);
        return res.json(rows);
      } catch (e2) {
        console.error('GET /products fallback error:', e2);
        return res.status(500).json({ message: 'Failed to list products' });
      }
    }
    console.error('GET /products error:', err);
    res.status(500).json({ message: 'Failed to list products' });
  }
});

/* ===========================
 * POST /products
 * - Cria produto
 * - Aceita sizes: [{ size, quantity }]
 * =========================== */
router.post('/', async (req, res) => {
  const {
    name,
    description,
    category,
    emoji,
    price_cents,
    image_url,
    image_public_id,
    video_url,
    video_public_id,
    active = true,
    sizes = [],
  } = req.body || {};

  if (!isNonEmpty(name)) {
    return res.status(400).json({ message: 'name is required' });
  }

  const price = asInt(price_cents, 0);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ins = `
      INSERT INTO public.products
        (name, description, category, emoji, price_cents, image_url, image_public_id, video_url, video_public_id, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `;
    const { rows } = await client.query(ins, [
      name.trim(),
      description ?? name.trim(),
      category ?? null,
      emoji ?? '👟',
      price,
      image_url ?? null,
      image_public_id ?? null,
      video_url ?? null,
      video_public_id ?? null,
      Boolean(active),
    ]);
    const product = rows[0];

    // Upsert dos tamanhos (se a tabela existir)
    if (Array.isArray(sizes) && sizes.length > 0) {
      try {
        for (const s of sizes) {
          if (!s || !isNonEmpty(String(s.size))) continue;
          await client.query(
            `INSERT INTO public.product_sizes (product_id, size, quantity)
             VALUES ($1,$2,$3)
             ON CONFLICT (product_id, size)
             DO UPDATE SET quantity = EXCLUDED.quantity`,
            [product.id, String(s.size), asInt(s.quantity, 0)]
          );
        }
      } catch (eSizes) {
        // Se a tabela não existir, apenas seguimos sem sizes
        if (eSizes?.code !== '42P01') throw eSizes;
      }
    }

    await client.query('COMMIT');
    res.status(201).json(product);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /products error:', err);
    res.status(500).json({ message: 'Failed to create product' });
  } finally {
    client.release();
  }
});

/* ===========================
 * PUT /products/:id
 * - Atualiza campos do produto (parciais)
 * - Se enviar sizes, faz upsert
 * =========================== */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category,
    emoji,
    price_cents,
    image_url,
    image_public_id,
    video_url,
    video_public_id,
    active,
    sizes,
  } = req.body || {};

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const upd = `
      UPDATE public.products SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        category = COALESCE($4, category),
        emoji = COALESCE($5, emoji),
        price_cents = COALESCE($6, price_cents),
        image_url = COALESCE($7, image_url),
        image_public_id = COALESCE($8, image_public_id),
        video_url = COALESCE($9, video_url),
        video_public_id = COALESCE($10, video_public_id),
        active = COALESCE($11, active),
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await client.query(upd, [
      id,
      isNonEmpty(name) ? name.trim() : null,
      description ?? null,
      category ?? null,
      emoji ?? null,
      Number.isFinite(+price_cents) ? asInt(price_cents, 0) : null,
      image_url ?? null,
      image_public_id ?? null,
      video_url ?? null,
      video_public_id ?? null,
      typeof active === 'boolean' ? active : null,
    ]);

    const product = rows[0];
    if (!product) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    // Se veio "sizes", fazemos upsert
    if (Array.isArray(sizes)) {
      try {
        for (const s of sizes) {
          if (!s || !isNonEmpty(String(s.size))) continue;
          await client.query(
            `INSERT INTO public.product_sizes (product_id, size, quantity)
             VALUES ($1,$2,$3)
             ON CONFLICT (product_id, size)
             DO UPDATE SET quantity = EXCLUDED.quantity`,
            [id, String(s.size), asInt(s.quantity, 0)]
          );
        }
      } catch (eSizes) {
        if (eSizes?.code !== '42P01') throw eSizes;
      }
    }

    await client.query('COMMIT');
    res.json(product);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /products/:id error:', err);
    res.status(500).json({ message: 'Failed to update product' });
  } finally {
    client.release();
  }
});

/* ===========================
 * DELETE /products/:id
 * - Remove o produto (e os tamanhos via FK ON DELETE CASCADE)
 * =========================== */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM public.products WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

export default router;
