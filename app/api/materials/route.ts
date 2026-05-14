import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-helpers";
import { StoreError, listMaterials } from "@/lib/materials-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const materials = await listMaterials();
    return NextResponse.json(materials);
  } catch (e) {
    if (e instanceof StoreError) {
      return errorResponse(500, e.message || "Failed to load materials");
    }
    const message =
      e instanceof Error ? e.message : "Failed to load materials";
    return errorResponse(500, message);
  }
}
