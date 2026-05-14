import {
  RAW_MATERIALS_TABLE,
  getInstanceName,
  getSupabase,
} from "./supabase";
import type { MaterialStatus, RawMaterial, RawMaterialView } from "./types";

export type StoreErrorKind =
  | "not_found"
  | "insufficient_stock"
  | "adjust_below_reserved"
  | "db_error";

export class StoreError extends Error {
  readonly kind: StoreErrorKind;
  constructor(kind: StoreErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = "StoreError";
  }
}

interface DbRow {
  id: string;
  instance_name: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  on_hand: number | string;
  reserved: number | string;
  reorder_threshold: number | string;
  supplier: string;
  lead_time_days: number;
  daily_consumption: number | string;
  status: string;
  updated_at: string;
}

function n(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function computeStatus(
  available: number,
  reorderThreshold: number,
): MaterialStatus {
  if (available <= 0) return "OUT_OF_STOCK";
  if (available <= reorderThreshold) return "LOW_STOCK";
  return "OK";
}

function toMaterial(row: DbRow): RawMaterial {
  const status = (row.status as MaterialStatus) ?? "OK";
  return {
    id: row.id,
    instance_name: row.instance_name,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    on_hand: n(row.on_hand),
    reserved: n(row.reserved),
    reorder_threshold: n(row.reorder_threshold),
    supplier: row.supplier,
    lead_time_days: row.lead_time_days,
    daily_consumption: n(row.daily_consumption),
    status,
    updated_at: row.updated_at,
  };
}

function toView(row: DbRow): RawMaterialView {
  const material = toMaterial(row);
  const available = material.on_hand - material.reserved;
  const daysUntilStockout =
    material.daily_consumption > 0
      ? Math.floor(Math.max(0, available) / material.daily_consumption)
      : null;
  return {
    ...material,
    available,
    days_until_stockout: daysUntilStockout,
  };
}

export async function listMaterials(): Promise<RawMaterialView[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(RAW_MATERIALS_TABLE)
    .select("*")
    .eq("instance_name", getInstanceName())
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new StoreError("db_error", error.message);
  return ((data as DbRow[] | null) ?? []).map(toView);
}

export async function getMaterial(id: string): Promise<RawMaterialView | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(RAW_MATERIALS_TABLE)
    .select("*")
    .eq("instance_name", getInstanceName())
    .eq("id", id)
    .maybeSingle();

  if (error) throw new StoreError("db_error", error.message);
  return data ? toView(data as DbRow) : null;
}

export async function materialCount(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from(RAW_MATERIALS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("instance_name", getInstanceName());

  if (error) throw new StoreError("db_error", error.message);
  return count ?? 0;
}

async function readRow(id: string): Promise<DbRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(RAW_MATERIALS_TABLE)
    .select("*")
    .eq("instance_name", getInstanceName())
    .eq("id", id)
    .maybeSingle();
  if (error) throw new StoreError("db_error", error.message);
  if (!data) throw new StoreError("not_found", "Material not found");
  return data as DbRow;
}

async function writeRow(
  id: string,
  patch: { on_hand?: number; reserved?: number; status: MaterialStatus },
): Promise<DbRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(RAW_MATERIALS_TABLE)
    .update(patch)
    .eq("instance_name", getInstanceName())
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new StoreError("db_error", error.message);
  if (!data) throw new StoreError("not_found", "Material not found after update");
  return data as DbRow;
}

function statusFor(onHand: number, reserved: number, threshold: number) {
  return computeStatus(onHand - reserved, threshold);
}

export async function consume(
  id: string,
  quantity: number,
): Promise<RawMaterialView> {
  const row = await readRow(id);
  const current = toMaterial(row);
  const newOnHand = current.on_hand - quantity;
  if (newOnHand < 0) {
    throw new StoreError(
      "insufficient_stock",
      "Cannot consume more than on-hand quantity.",
    );
  }
  const status = statusFor(newOnHand, current.reserved, current.reorder_threshold);
  const updated = await writeRow(id, { on_hand: newOnHand, status });
  return toView(updated);
}

export async function reserve(
  id: string,
  quantity: number,
): Promise<RawMaterialView> {
  const row = await readRow(id);
  const current = toMaterial(row);
  const newReserved = current.reserved + quantity;
  if (newReserved > current.on_hand) {
    throw new StoreError(
      "insufficient_stock",
      "Cannot reserve more than on-hand quantity.",
    );
  }
  const status = statusFor(current.on_hand, newReserved, current.reorder_threshold);
  const updated = await writeRow(id, { reserved: newReserved, status });
  return toView(updated);
}

export async function release(
  id: string,
  quantity: number,
): Promise<RawMaterialView> {
  const row = await readRow(id);
  const current = toMaterial(row);
  const newReserved = Math.max(0, current.reserved - quantity);
  const status = statusFor(current.on_hand, newReserved, current.reorder_threshold);
  const updated = await writeRow(id, { reserved: newReserved, status });
  return toView(updated);
}

export async function restock(
  id: string,
  quantity: number,
): Promise<RawMaterialView> {
  const row = await readRow(id);
  const current = toMaterial(row);
  const newOnHand = current.on_hand + quantity;
  const status = statusFor(newOnHand, current.reserved, current.reorder_threshold);
  const updated = await writeRow(id, { on_hand: newOnHand, status });
  return toView(updated);
}

export async function adjust(
  id: string,
  quantity: number,
): Promise<RawMaterialView> {
  const row = await readRow(id);
  const current = toMaterial(row);
  if (quantity < current.reserved) {
    throw new StoreError(
      "adjust_below_reserved",
      "Cannot adjust on-hand below currently reserved units.",
    );
  }
  const status = statusFor(quantity, current.reserved, current.reorder_threshold);
  const updated = await writeRow(id, { on_hand: quantity, status });
  return toView(updated);
}
