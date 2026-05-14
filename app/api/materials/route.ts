import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { CORS_HEADERS, errorResponse, optionsResponse } from "@/lib/api-helpers";
import { StoreError, listMaterials } from "@/lib/materials-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await authenticate(request);
  if (authError) return authError;
  try {
    const materials = await listMaterials();
    return NextResponse.json(materials, { headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof StoreError) {
      return errorResponse(500, e.message || "Failed to load materials");
    }
    const message =
      e instanceof Error ? e.message : "Failed to load materials";
    return errorResponse(500, message);
  }
}

export const OPTIONS = optionsResponse;
