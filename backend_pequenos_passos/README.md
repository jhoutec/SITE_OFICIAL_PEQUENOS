# Pequenos Passos — Backend v2 (Compatível com seu frontend)

- Tabela `products` usa `sizes JSONB` no formato: `[{"size":"28","quantity":10}, ...]`
- Endpoints já aceitam/criam nesse formato.
- Ao criar pedido, estoque por tamanho é baixado em transação.

## Como rodar
1. Duplique `.env.example` → `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
2. `npm install`
3. `npm run migrate`
4. `npm run dev` → http://localhost:8000/health

## Endpoints
- `POST /auth/login` → retorna `{ token, user }`
- `GET /products` (público)
- `POST /products` (admin+JWT) — payload inclui `sizes: [{size,quantity}]`
- `PUT /products/:id` (admin+JWT)
- `DELETE /products/:id` (admin+JWT)
- `POST /orders` (público) — baixa estoque do tamanho comprado
- `GET /orders` (admin+JWT)
- `PUT /orders/:id/status` (admin+JWT)
