-- MessMate Database Schema for Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 1. Create the orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number serial,
  customer_name text not null,
  customer_phone text not null,
  hostel text not null,
  room text not null,
  fulfilment text not null check (fulfilment in ('pickup', 'delivery')),
  slot text not null,
  items jsonb not null,
  subtotal numeric not null,
  delivery_fee numeric not null default 0,
  total numeric not null,
  payment_method text not null,
  status text not null default 'placed' check (status in ('placed', 'preparing', 'ready', 'delivered', 'cancelled')),
  created_at timestamptz default now()
);

-- 2. Enable Row Level Security (RLS)
alter table public.orders enable row level security;

-- 3. Policy: Allow anyone to place an order (no login required)
create policy "Anyone can place an order"
  on public.orders for insert
  with check (true);

-- 4. Policy: Allow anyone to read orders (to track their orders)
create policy "Anyone can view orders"
  on public.orders for select
  using (true);

-- 5. Policy: Allow updating order status (for kitchen/delivery updates)
create policy "Anyone can update orders"
  on public.orders for update
  using (true)
  with check (true);

-- 6. Enable Realtime on the orders table
alter publication supabase_realtime add table public.orders;
