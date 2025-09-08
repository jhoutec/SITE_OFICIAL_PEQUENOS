create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin','staff','customer')),
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  sizes jsonb not null default '[]'::jsonb, -- [{ "size": "28", "quantity": 10 }, ...]
  image_url text,
  image_public_id text,
  category text,
  emoji text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_active on products(active);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  customer_address text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELED')),
  total_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  size text,
  qty integer not null check (qty > 0),
  price_cents integer not null check (price_cents >= 0)
);
