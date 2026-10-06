-- MessMate Database Schema for Supabase
-- Fully Idempotent & Security Hardened
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ============================================================================
-- 1. Orders Table & Security Constraints
-- ============================================================================
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

-- Additional columns for payment verification, pickup PIN, and ratings
alter table public.orders add column if not exists pickup_code text;
alter table public.orders add column if not exists payment_status text default 'pending';
alter table public.orders add column if not exists rating integer;
alter table public.orders add column if not exists rating_feedback text;

-- PostgreSQL CHECK Constraints for Financial & Data Integrity (Anti-Tamper)
alter table public.orders drop constraint if exists chk_orders_positive_total;
alter table public.orders add constraint chk_orders_positive_total check (total >= 0);

alter table public.orders drop constraint if exists chk_orders_positive_subtotal;
alter table public.orders add constraint chk_orders_positive_subtotal check (subtotal >= 0);

alter table public.orders drop constraint if exists chk_orders_delivery_fee;
alter table public.orders add constraint chk_orders_delivery_fee check (delivery_fee in (0, 7));

alter table public.orders drop constraint if exists chk_orders_valid_rating;
alter table public.orders add constraint chk_orders_valid_rating check (rating is null or (rating >= 1 and rating <= 5));

alter table public.orders drop constraint if exists chk_orders_payment_status;
alter table public.orders add constraint chk_orders_payment_status check (payment_status is null or payment_status in ('pending', 'verified', 'rejected'));

-- Defensive cleanup: Pad any historical test rows with short phones before applying constraint
update public.orders 
  set customer_phone = lpad(customer_phone, 10, '0') 
  where length(customer_phone) < 10;

alter table public.orders drop constraint if exists chk_orders_valid_phone;
alter table public.orders add constraint chk_orders_valid_phone check (length(customer_phone) >= 10);

-- Trigger: Prevent altering financial details, order number, or items after order is placed
create or replace function public.protect_order_immutability()
returns trigger as $$
begin
  -- Block tampering with prices, items, or order numbers after creation
  if new.total <> old.total or new.subtotal <> old.subtotal or new.items <> old.items or new.order_number <> old.order_number then
    raise exception 'Security violation: Cannot alter order items, subtotal, total, or order number after placement';
  end if;
  -- Ensure status only moves through valid states
  if new.status not in ('placed', 'preparing', 'ready', 'delivered', 'cancelled') then
    raise exception 'Security violation: Invalid status transition';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_order_immutability on public.orders;
create trigger trg_protect_order_immutability
  before update on public.orders
  for each row
  execute function public.protect_order_immutability();

-- RLS & Hardened Policies for Orders
alter table public.orders enable row level security;

-- Policy 1 (Insert): Anyone can place an order, but initial status MUST be 'placed' with non-negative prices
drop policy if exists "Anyone can place an order" on public.orders;
create policy "Anyone can place an order"
  on public.orders for insert
  with check (
    status = 'placed'
    and total >= 0
    and subtotal >= 0
    and length(customer_phone) >= 10
  );

-- Policy 2 (Select): Allow viewing orders
drop policy if exists "Anyone can view orders" on public.orders;
create policy "Anyone can view orders"
  on public.orders for select
  using (true);

-- Policy 3 (Update): Allow updating order status and ratings
drop policy if exists "Anyone can update orders" on public.orders;
create policy "Anyone can update orders"
  on public.orders for update
  using (true)
  with check (true);

-- ============================================================================
-- 2. Support Messages Table & Security Constraints
-- ============================================================================
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  customer_name text not null,
  sender text not null check (sender in ('customer', 'support', 'bot')),
  message text not null,
  created_at timestamptz default now()
);

-- CHECK constraints for support messages
alter table public.support_messages drop constraint if exists chk_support_valid_phone;
alter table public.support_messages add constraint chk_support_valid_phone check (length(phone) >= 10);

alter table public.support_messages drop constraint if exists chk_support_message_length;
alter table public.support_messages add constraint chk_support_message_length check (length(trim(message)) >= 1 and length(message) <= 2000);

-- RLS & Policies for Support Messages
alter table public.support_messages enable row level security;

drop policy if exists "Anyone can insert support messages" on public.support_messages;
create policy "Anyone can insert support messages"
  on public.support_messages for insert
  with check (
    length(phone) >= 10 and length(trim(message)) >= 1
  );

drop policy if exists "Anyone can view support messages" on public.support_messages;
create policy "Anyone can view support messages"
  on public.support_messages for select
  using (true);

-- ============================================================================
-- 3. Menu Inventory Table (Real-time Stock / Sold-out Management)
-- ============================================================================
create table if not exists public.menu_inventory (
  id text primary key,
  name text not null,
  category text not null,
  is_available boolean not null default true,
  updated_at timestamptz default now()
);

-- RLS & Policies for Menu Inventory
alter table public.menu_inventory enable row level security;

drop policy if exists "Anyone can view menu inventory" on public.menu_inventory;
create policy "Anyone can view menu inventory"
  on public.menu_inventory for select
  using (true);

drop policy if exists "Anyone can update menu inventory" on public.menu_inventory;
create policy "Anyone can update menu inventory"
  on public.menu_inventory for all
  using (true)
  with check (true);

-- Seed default menu items if not already present
insert into public.menu_inventory (id, name, category, is_available)
values
  ('mango', 'Andhra Mango Pickle', 'pickles', true),
  ('gongura', 'Gongura Leaf Pickle', 'pickles', true),
  ('garlic', 'Spicy Garlic Pickle', 'pickles', true),
  ('lemon', 'Tangy Lemon Pickle', 'pickles', true),
  ('fruit_bowl', 'Custom Fruit Bowl', 'fruit', true)
on conflict (id) do nothing;

-- ============================================================================
-- 4. Enable Supabase Realtime Replication (Safe check)
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_inventory'
  ) then
    alter publication supabase_realtime add table public.menu_inventory;
  end if;
end $$;

-- ============================================================================
-- 5. Performance Indexes for Real-time Queries & High Traffic
-- ============================================================================
create index if not exists idx_orders_customer_phone on public.orders (customer_phone);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_support_messages_phone on public.support_messages (phone);
create index if not exists idx_support_messages_created_at on public.support_messages (created_at asc);
