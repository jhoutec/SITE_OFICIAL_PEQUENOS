// routes/products.js (ESM)
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * GET /products
 * Lista produtos incluindo sizes como array [{size, quantity}]
 */
router.get('/', async (_req, res) => {
  try {
    const sql = `
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
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ message: 'Failed to list products' });
  }
});

/**
 * POST /products
 * Cria produto. Aceita opcionalmente sizes: [{size, quantity}]
 */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
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
      sizes = []
    } = req.body || {};

    await client.query('BEGIN');

    const ins = `
      INSERT INTO public.products
        (name, description, category, emoji, price_cents, image_url, image_public_id, video_url, video_public_id, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`;
    const { rows } = await client.query(ins, [
      name, description || name, category, emoji || '👟',
      price_cents ?? 0,
      image_url || null, image_public_id || null,
      video_url || null, video_public_id || null,
      active
    ]);
    const product = rows[0];

    // upsert sizes
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        if (!s?.size) continue;
        await client.query(
          `INSERT INTO public.product_sizes (product_id, size, quantity)
           VALUES ($1,$2,$3)
           ON CONFLICT (product_id, size)
           DO UPDATE SET quantity = EXCLUDED.quantity`,
          [product.id, String(s.size), Number(s.quantity || 0)]
        );
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

/**
 * PUT /products/:id
 * Atualiza o produto e faz upsert dos sizes enviados.
 * Se não enviar sizes, mantém os existentes.
 */
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
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
      sizes
    } = req.body || {};

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
      RETURNING *`;
    const { rows } = await client.query(upd, [
      id, name, description, category, emoji,
      price_cents, image_url, image_public_id,
      video_url, video_public_id, active
    ]);
    const product = rows[0];
    if (!product) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        if (!s?.size) continue;
        await client.query(
          `INSERT INTO public.product_sizes (product_id, size, quantity)
           VALUES ($1,$2,$3)
           ON CONFLICT (product_id, size)
           DO UPDATE SET quantity = EXCLUDED.quantity`,
          [id, String(s.size), Number(s.quantity || 0)]
        );
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

/**
 * DELETE /products/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM public.products WHERE id=$1', [id]);
    // ON DELETE CASCADE remove os tamanhos vinculados
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

export default router;
