// routes/products.js (ESM)
import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

/**
 * GET /products
 * Lista produtos incluindo campos de vídeo
 */
router.get('/', async (_req, res) => {
  try {
    const sql = `
      SELECT
        id,
        name,
        description,
        category,
        emoji,
        price_cents,
        image_url,
        image_public_id,
        -- 👇 novos
        video_url,
        video_public_id,
        active,
        created_at,
        updated_at
      FROM public.products
      ORDER BY created_at DESC
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
 * Cria produto aceitando video_url / video_public_id
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      emoji,
      price_cents,
      image_url,
      image_public_id,
      // 👇 novos
      video_url,
      video_public_id,
      active = true,
      // sizes // se você persiste tamanhos em outra tabela, trate depois
    } = req.body || {};

    if (!name || price_cents == null) {
      return res.status(400).json({ message: 'name e price_cents são obrigatórios' });
    }

    const sql = `
      INSERT INTO public.products (
        name, description, category, emoji, price_cents,
        image_url, image_public_id,
        video_url, video_public_id,
        active, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9,
        $10, NOW(), NOW()
      )
      RETURNING
        id, name, description, category, emoji, price_cents,
        image_url, image_public_id,
        video_url, video_public_id,
        active, created_at, updated_at
    `;

    const params = [
      name,
      description || name,
      category || null,
      emoji || null,
      Number(price_cents),
      image_url || null,
      image_public_id || null,
      video_url || null,
      video_public_id || null,
      !!active,
    ];

    const { rows } = await pool.query(sql, params);
    const product = rows[0];

    // TODO: se você usa tabela separada p/ tamanhos (products_sizes), insira aqui.

    res.json(product);
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

/**
 * PUT /products/:id
 * Atualiza produto; preserva campos se vierem undefined
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // busca atual p/ preservar valores quando não enviados
    const prevQ = await pool.query('SELECT * FROM public.products WHERE id = $1', [id]);
    if (!prevQ.rows.length) return res.status(404).json({ message: 'Product not found' });
    const prev = prevQ.rows[0];

    const {
      name,
      description,
      category,
      emoji,
      price_cents,
      image_url,
      image_public_id,
      // 👇 novos (podem vir undefined)
      video_url,
      video_public_id,
      active,
    } = req.body || {};

    const sql = `
      UPDATE public.products
      SET
        name             = COALESCE($1, name),
        description      = COALESCE($2, description),
        category         = COALESCE($3, category),
        emoji            = COALESCE($4, emoji),
        price_cents      = COALESCE($5, price_cents),
        image_url        = $6,
        image_public_id  = $7,
        video_url        = $8,
        video_public_id  = $9,
        active           = COALESCE($10, active),
        updated_at       = NOW()
      WHERE id = $11
      RETURNING
        id, name, description, category, emoji, price_cents,
        image_url, image_public_id,
        video_url, video_public_id,
        active, created_at, updated_at
    `;

    const params = [
      name ?? null,
      (description ?? null),
      category ?? null,
      emoji ?? null,
      (price_cents != null ? Number(price_cents) : null),
      (image_url === undefined ? prev.image_url : image_url),
      (image_public_id === undefined ? prev.image_public_id : image_public_id),
      (video_url === undefined ? prev.video_url : video_url),                   // 👈 preserva
      (video_public_id === undefined ? prev.video_public_id : video_public_id), // 👈 preserva
      (active === undefined ? null : !!active),
      id,
    ];

    const { rows } = await pool.query(sql, params);
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

export default router;
