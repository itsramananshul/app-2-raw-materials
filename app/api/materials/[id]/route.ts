import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { errorResponse } from "@/lib/api-helpers";
import { StoreError, getMaterial } from "@/lib/materials-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authError = await authenticate(request);
  if (authError) return authError;
  try {
    const material = await getMaterial(params.id);
    if (!material) return errorResponse(404, "Material not found");
    return NextResponse.json(material);
  } catch (e) {
    if (e instanceof StoreError) {
      return errorResponse(500, e.message || "Failed to load material");
    }
    const message =
      e instanceof Error ? e.message : "Failed to load material";
    return errorResponse(500, message);
  }
}
