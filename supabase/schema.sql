-- APP 2 — Raw Materials Inventory: schema
-- Paste into the Supabase SQL editor and run once per project.
-- Idempotent: `if not exists` / `or replace` everywhere.

create extension if not exists "pgcrypto";

create table if not exists public.raw_materials (
  id                uuid          primary key default gen_random_uuid(),
  instance_name     text          not null,
  sku               text          not null,
  name              text          not null,
  category          text          not null,
  unit              text          not null,
  on_hand           numeric(12,2) not null default 0,
  reserved          numeric(12,2) not null default 0,
  reorder_threshold numeric(12,2) not null default 0,
  supplier          text          not null,
  lead_time_days    int           not null default 7,
  daily_consumption numeric(12,2) not null default 0,
  status            text          not null default 'OK',
  updated_at        timestamptz   not null default now(),
  unique (instance_name, sku)
);

create index if not exists raw_materials_instance_idx
  on public.raw_materials (instance_name);

create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.raw_materials;
create trigger set_updated_at
  before update on public.raw_materials
  for each row execute function update_updated_at_column();

-- Demo: disable RLS so the anon key path also works. The app code prefers
-- SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS regardless of this setting).
alter table public.raw_materials disable row level security;
