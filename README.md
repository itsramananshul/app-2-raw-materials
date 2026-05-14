# APP 2 — Raw Materials Inventory

Standalone Next.js 14 + TypeScript app for tracking raw-material inputs at a
factory, backed by Supabase Postgres. Same codebase runs as Factory 1–4 with
per-instance isolation via an `instance_name` column.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- `@supabase/supabase-js` (server-side queries from API routes)
- Vercel-ready (no custom port handling)

## Supabase setup

1. Paste `supabase/schema.sql` into the Supabase SQL editor and run (once).
2. Paste `supabase/seed.sql` and run. It upserts 40 rows — 10 materials across
   Factory 1–4 with deliberately different on-hand / reserved /
   daily-consumption profiles so each factory has its own operational picture.
   Re-running it acts as a demo reset.

## Environment

`.env.local` (copied from app-1, same Supabase project):

```env
INSTANCE_NAME=Factory 1
NEXT_PUBLIC_INSTANCE_NAME=Factory 1

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # preferred (bypasses RLS)
SUPABASE_ANON_KEY=...           # fallback
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

To switch instances locally, change `INSTANCE_NAME` and
`NEXT_PUBLIC_INSTANCE_NAME` (e.g. `Factory 2`) and restart `npm run dev`.

## Local dev

```bash
npm install
npm run dev          # http://localhost:3000
```

## API

| Method | Path                                  | Notes                                      |
| ------ | ------------------------------------- | ------------------------------------------ |
| GET    | `/api/materials`                      | List, filtered by INSTANCE_NAME            |
| GET    | `/api/materials/[id]`                 | Single material                            |
| POST   | `/api/materials/[id]/consume`         | `{ "quantity": number }`                   |
| POST   | `/api/materials/[id]/reserve`         | `{ "quantity": number }`                   |
| POST   | `/api/materials/[id]/release`         | `{ "quantity": number }` (floor at 0)      |
| POST   | `/api/materials/[id]/restock`         | `{ "quantity": number }`                   |
| GET    | `/api/status`                         | health + count for this instance           |

All errors → `{ "success": false, "error": "..." }`.
All mutation successes → `{ "success": true, "material": { ... } }`.

After every mutation the server recomputes `status` based on
`(on_hand - reserved)` vs `reorder_threshold` and writes it back to the row.

## UI

- Header with instance chip + Live / Reconnecting / Stale connection status.
- Stat cards: Total SKUs, Total On Hand, Critical Materials (OUT_OF_STOCK),
  Low Stock Alerts (LOW_STOCK).
- Wide table: SKU, Name, Category, Unit, On Hand, Reserved, Available,
  Days Until Stockout, Reorder Threshold, Supplier, Lead Time, Status, Actions.
- **Days Until Stockout** colours: red if less than the row's `lead_time_days`,
  amber if less than `lead_time_days × 2`, default otherwise. `∞` when
  `daily_consumption` is zero.
- Four actions per row: Consume / Reserve / Release / Restock — each opens
  the QuantityModal and supports decimal quantities.
- Toast on every mutation; bottom **Recent Activity** panel logs the last
  50 attempts client-side.

## Deploy to Vercel

One Vercel project per factory instance, all pointing at the same git repo
with **Root Directory** = `app-2-raw-materials`. In each project's Environment
Variables, set the values above; only `INSTANCE_NAME` and
`NEXT_PUBLIC_INSTANCE_NAME` differ between projects.

## curl smoke test

```bash
BASE=http://localhost:3000

curl $BASE/api/materials
curl $BASE/api/status

# Use a real uuid from the list above.
curl -X POST $BASE/api/materials/<uuid>/consume \
  -H "Content-Type: application/json" -d '{"quantity":5}'
curl -X POST $BASE/api/materials/<uuid>/reserve \
  -H "Content-Type: application/json" -d '{"quantity":10}'
curl -X POST $BASE/api/materials/<uuid>/release \
  -H "Content-Type: application/json" -d '{"quantity":3}'
curl -X POST $BASE/api/materials/<uuid>/restock \
  -H "Content-Type: application/json" -d '{"quantity":100}'

# Failure paths
curl -X POST $BASE/api/materials/<uuid>/consume \
  -H "Content-Type: application/json" -d '{"quantity":0}'         # 400
curl -X POST $BASE/api/materials/<uuid>/consume \
  -H "Content-Type: application/json" -d '{"quantity":999999}'    # 409
curl $BASE/api/materials/00000000-0000-0000-0000-000000000000     # 404
```
