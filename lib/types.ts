export type MaterialStatus = "OK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface RawMaterial {
  id: string;
  instance_name: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  on_hand: number;
  reserved: number;
  reorder_threshold: number;
  supplier: string;
  lead_time_days: number;
  daily_consumption: number;
  status: MaterialStatus;
  updated_at: string;
}

export interface RawMaterialView extends RawMaterial {
  available: number;
  days_until_stockout: number | null;
}

export interface StatusResponse {
  instanceName: string;
  type: "raw_materials";
  materialCount: number;
  health: "ok" | "degraded";
  timestamp: string;
}

export interface ApiErrorBody {
  success: false;
  error: string;
}

export interface MutationSuccessBody {
  success: true;
  material: RawMaterialView;
}
