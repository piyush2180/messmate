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

-- 7. Create the support_messages table for student support chat
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  customer_name text not null,
  sender text not null check (sender in ('customer', 'support', 'bot')),
  message text not null,
  created_at timestamptz default now()
);

-- 8. Enable Row Level Security (RLS) on support_messages
alter table public.support_messages enable row level security;

-- 9. Policy: Allow anyone to insert support messages
create policy "Anyone can insert support messages"
  on public.support_messages for insert
  with check (true);

-- 10. Policy: Allow anyone to view support messages
create policy "Anyone can view support messages"
  on public.support_messages for select
  using (true);

-- 11. Enable Realtime on the support_messages table
alter publication supabase_realtime add table public.support_messages;

-- 12. Add columns for Payment Verification, Pickup PIN, and Order Ratings
alter table public.orders add column if not exists pickup_code text;
alter table public.orders add column if not exists payment_status text default 'pending';
alter table public.orders add column if not exists rating integer;
alter table public.orders add column if not exists rating_feedback text;

-- 13. Create menu_inventory table for real-time item stock management
create table if not exists public.menu_inventory (
  id text primary key,
  name text not null,
  category text not null,
  is_available boolean not null default true,
  updated_at timestamptz default now()
);

-- 14. Enable RLS and policies for menu_inventory
alter table public.menu_inventory enable row level security;

create policy "Anyone can view menu inventory"
  on public.menu_inventory for select
  using (true);

create policy "Anyone can update menu inventory"
  on public.menu_inventory for all
  using (true)
  with check (true);

alter publication supabase_realtime add table public.menu_inventory;

-- 15. Performance Indexes for Real-time Queries & High Traffic
create index if not exists idx_orders_customer_phone on public.orders (customer_phone);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_support_messages_phone on public.support_messages (phone);
create index if not exists idx_support_messages_created_at on public.support_messages (created_at asc);

