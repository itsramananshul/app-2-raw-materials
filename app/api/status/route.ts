import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { StoreError, materialCount } from "@/lib/materials-store";
import type { StatusResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const count = await materialCount();
    const payload: StatusResponse = {
      instanceName: process.env.INSTANCE_NAME?.trim() ?? "Unknown Instance",
      type: "raw_materials",
      materialCount: count,
      health: "ok",
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof StoreError) {
      return errorResponse(500, e.message || "Status check failed");
    }
    const message = e instanceof Error ? e.message : "Status check failed";
    return errorResponse(500, message);
  }
}
