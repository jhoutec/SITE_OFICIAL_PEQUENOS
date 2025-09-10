// routes/orders.js (ESM) — usa sizes JSONB dentro de products
import express from 'express';
import { pool } from '../db.js';
import { z } from 'zod';
import { authRequired, adminOnly } from '../middlewares/auth.js';

const router = express.Router();

const OrderItemSchema = z.object({
  product_id: z.string(),          // UUID (mantido genérico)
  size: z.string().optional(),
  qty: z.number().int().positive(),
  price_cents: z.number().int().nonnegative(),
});

const CreateOrderSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
});

// Criar pedido + baixar estoque por tamanho (JSONB)
router.post('/', async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos' });
  const { customer, items } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total = items.reduce((s, i) => s + (i.price_cents * i.qty), 0);
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (customer_name, customer_phone, customer_address, total_cents)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [customer.name, customer.phone || null, customer.address || null, total]
    );
    const order = orderRows[0];

    const insertItem =
      `INSERT INTO order_items (order_id, product_id, size, qty, price_cents)
       VALUES ($1,$2,$3,$4,$5)`;
    for (const it of items) {
      await client.query(insertItem, [order.id, it.product_id, it.size || null, it.qty, it.price_cents]);

      // baixa estoque por tamanho (lock pessimista no produto)
      const prod = await client.query('SELECT sizes FROM products WHERE id=$1 FOR UPDATE', [it.product_id]);
      if (prod.rows[0]) {
        const sizes = Array.isArray(prod.rows[0].sizes) ? prod.rows[0].sizes : [];
        if (it.size) {
          const idx = sizes.findIndex(s => String(s.size) === String(it.size));
          if (idx >= 0) {
            const current = parseInt(sizes[idx].quantity || 0);
            sizes[idx].quantity = Math.max(0, current - it.qty);
          } else {
            // se não existe o tamanho, cria com quantidade zero (não deixa negativo)
            sizes.push({ size: String(it.size), quantity: 0 });
          }
          await client.query(
            'UPDATE products SET sizes=$1::jsonb, updated_at=now() WHERE id=$2',
            [JSON.stringify(sizes), it.product_id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /orders error:', e?.message || e);
    res.status(500).json({ message: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// Listar pedidos (admin)
router.get('/', authRequired, adminOnly, async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1'), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20'), 1), 100);
  const offset = (page - 1) * limit;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /orders error:', err?.message || err);
    res.status(500).json({ message: 'Erro ao listar pedidos' });
  }
});

// Detalhe do pedido (admin)
router.get('/:id', authRequired, adminOnly, async (req, res) => {
  try {
    const { rows: orders } = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!orders[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    res.json({ ...orders[0], items });
  } catch (err) {
    console.error('GET /orders/:id error:', err?.message || err);
    res.status(500).json({ message: 'Erro ao obter pedido' });
  }
});

// Atualizar status (admin)
router.put('/:id/status', authRequired, adminOnly, async (req, res) => {
  const allowed = ['PENDING', 'APPROVED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED'];
  const { status } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Status inválido' });
  try {
    const { rows } = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /orders/:id/status error:', err?.message || err);
    res.status(500).json({ message: 'Erro ao atualizar status' });
  }
});

export default router;
