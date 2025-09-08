// routes/orders.js
import express from 'express';
import { pool } from '../db.js';
import { z } from 'zod';
import { authRequired, adminOnly } from '../middlewares/auth.js';

const router = express.Router();

const OrderItemSchema = z.object({
  product_id: z.string(), // pode ser UUID (não forço .uuid() pra compatibilidade)
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

// Criar pedido
router.post('/', async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos' });
  const { customer, items } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('begin');

    const total = items.reduce((s, i) => s + i.price_cents * i.qty, 0);
    const { rows: orderRows } = await client.query(
      `insert into orders (customer_name, customer_phone, customer_address, total_cents)
       values ($1,$2,$3,$4) returning *`,
      [customer.name, customer.phone || null, customer.address || null, total]
    );
    const order = orderRows[0];

    const insertItem =
      'insert into order_items (order_id, product_id, size, qty, price_cents) values ($1,$2,$3,$4,$5)';
    for (const it of items) {
      await client.query(insertItem, [order.id, it.product_id, it.size || null, it.qty, it.price_cents]);

      // baixa estoque por tamanho (lock pessimista)
      const prod = await client.query('select sizes from products where id=$1 for update', [it.product_id]);
      if (prod.rows[0]) {
        const sizes = Array.isArray(prod.rows[0].sizes) ? prod.rows[0].sizes : [];
        const idx = sizes.findIndex(s => String(s.size) === String(it.size));
        if (idx >= 0) {
          sizes[idx].quantity = Math.max(0, (parseInt(sizes[idx].quantity || 0) - it.qty));
          await client.query(
            'update products set sizes=$1::jsonb, updated_at=now() where id=$2',
            [JSON.stringify(sizes), it.product_id]
          );
        }
      }
    }

    await client.query('commit');
    res.status(201).json(order);
  } catch (e) {
    await client.query('rollback');
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
      'select * from orders order by created_at desc limit $1 offset $2',
      [limit, offset]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Erro ao listar pedidos' });
  }
});

// Obter um pedido (admin)
router.get('/:id', authRequired, adminOnly, async (req, res) => {
  try {
    const { rows: orders } = await pool.query('select * from orders where id=$1', [req.params.id]);
    if (!orders[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    const { rows: items } = await pool.query('select * from order_items where order_id=$1', [req.params.id]);
    res.json({ ...orders[0], items });
  } catch {
    res.status(500).json({ message: 'Erro ao obter pedido' });
  }
});

// Atualizar status (admin)
router.put('/:id/status', authRequired, adminOnly, async (req, res) => {
  const allowed = ['PENDING', 'APPROVED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED'];
  const { status } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Status inválido' });
  try {
    const { rows } = await pool.query('update orders set status=$1 where id=$2 returning *', [
      status,
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: 'Erro ao atualizar status' });
  }
});

export default router;
