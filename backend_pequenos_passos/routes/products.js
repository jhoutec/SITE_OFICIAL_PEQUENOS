// routes/products.js
import express from 'express';
import { pool } from '../db.js';
import { z } from 'zod';
import { authRequired, adminOnly } from '../middlewares/auth.js';
import { destroyImage } from '../services/cloudinary.js';

const router = express.Router();

const SizeSchema = z.object({
  size: z.union([z.string(), z.number()]).transform(v => String(v)),
  quantity: z.number().int().nonnegative(),
});

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.string().min(1),
  emoji: z.string().optional().default('👟'),
  price_cents: z.number().int().nonnegative(),
  sizes: z.array(SizeSchema).default([]),
  active: z.boolean().default(true),
  image_url: z.string().url().nullable().optional(),
  image_public_id: z.string().nullable().optional(),
});

// LISTAR
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('select * from products order by created_at desc');
    const mapped = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      category: r.category,
      emoji: r.emoji || '👟',
      price_cents: r.price_cents,
      sizes: Array.isArray(r.sizes) ? r.sizes : [],
      active: r.active,
      image_url: r.image_url,
      image_public_id: r.image_public_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json(mapped);
  } catch {
    res.status(500).json({ message: 'Erro ao listar produtos' });
  }
});

// CRIAR (admin)
router.post('/', authRequired, adminOnly, async (req, res) => {
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos' });

  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `insert into products
       (name, description, category, emoji, price_cents, sizes, active, image_url, image_public_id)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
       returning *`,
      [
        p.name,
        p.description || p.name,
        p.category,
        p.emoji || '👟',
        p.price_cents,
        JSON.stringify(p.sizes || []),
        p.active ?? true,
        p.image_url || null,
        p.image_public_id || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ message: 'Erro ao criar produto' });
  }
});

// ATUALIZAR (admin)
router.put('/:id', authRequired, adminOnly, async (req, res) => {
  const parsed = ProductSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos' });

  try {
    const { rows: oldRows } = await pool.query('select * from products where id=$1', [req.params.id]);
    const old = oldRows[0];
    if (!old) return res.status(404).json({ message: 'Produto não encontrado' });

    const p = parsed.data;
    const newImagePublicId = p.image_public_id ?? old.image_public_id;

    // se trocar de imagem, remove a antiga no Cloudinary
    if (old.image_public_id && p.image_public_id && p.image_public_id !== old.image_public_id) {
      destroyImage(old.image_public_id).catch(() => {});
    }

    const { rows } = await pool.query(
      `update products set
         name=coalesce($1,name),
         description=coalesce($2,description),
         category=coalesce($3,category),
         emoji=coalesce($4,emoji),
         price_cents=coalesce($5,price_cents),
         sizes=coalesce($6::jsonb,sizes),
         active=coalesce($7,active),
         image_url=coalesce($8,image_url),
         image_public_id=$9,
         updated_at=now()
       where id=$10
       returning *`,
      [
        p.name ?? null,
        p.description ?? null,
        p.category ?? null,
        p.emoji ?? null,
        p.price_cents ?? null,
        p.sizes ? JSON.stringify(p.sizes) : null,
        p.active ?? null,
        p.image_url ?? null,
        newImagePublicId,
        req.params.id,
      ]
    );

    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: 'Erro ao atualizar produto' });
  }
});

// EXCLUIR (admin)
router.delete('/:id', authRequired, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('select image_public_id from products where id=$1', [req.params.id]);
    const img = rows[0]?.image_public_id || null;

    await pool.query('delete from products where id=$1', [req.params.id]);

    if (img) destroyImage(img).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Erro ao excluir produto' });
  }
});

export default router;
