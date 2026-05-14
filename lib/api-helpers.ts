import { NextResponse } from "next/server";
import { StoreError } from "./materials-store";
import type {
  ApiErrorBody,
  MutationSuccessBody,
  RawMaterialView,
} from "./types";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
} as const;

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "x-api-key, content-type",
    },
  });
}

export function errorResponse(status: number, message: string) {
  return NextResponse.json<ApiErrorBody>(
    { success: false, error: message },
    { status, headers: CORS_HEADERS },
  );
}

export function mutationSuccessResponse(material: RawMaterialView) {
  return NextResponse.json<MutationSuccessBody>(
    {
      success: true,
      material,
    },
    { headers: CORS_HEADERS },
  );
}

export function mapStoreError(e: StoreError) {
  switch (e.kind) {
    case "not_found":
      return errorResponse(404, e.message || "Material not found");
    case "insufficient_stock":
      return errorResponse(409, e.message || "Insufficient stock");
    case "adjust_below_reserved":
      return errorResponse(
        409,
        e.message || "Cannot adjust on-hand below currently reserved units.",
      );
    case "db_error":
      return errorResponse(500, e.message || "Database error");
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export type QuantityParse =
  | { ok: true; quantity: number }
  | { ok: false; status: number; message: string };

export function parseQuantity(body: unknown): QuantityParse {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, message: "Invalid JSON body" };
  }
  const q = (body as { quantity?: unknown }).quantity;
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0) {
    return {
      ok: false,
      status: 400,
      message: "Invalid quantity. Must be a positive number.",
    };
  }
  return { ok: true, quantity: q };
}

export function parseNonNegativeQuantity(body: unknown): QuantityParse {
  if (typeof body !== "object" || body === null) {
    return { ok: false, status: 400, message: "Invalid JSON body" };
  }
  const q = (body as { quantity?: unknown }).quantity;
  if (typeof q !== "number" || !Number.isFinite(q) || q < 0) {
    return {
      ok: false,
      status: 400,
      message: "Invalid quantity. Must be a non-negative number.",
    };
  }
  return { ok: true, quantity: q };
}

export async function runMutation(
  fn: () => Promise<RawMaterialView>,
): Promise<Response> {
  try {
    const result = await fn();
    return mutationSuccessResponse(result);
  } catch (e) {
    if (e instanceof StoreError) return mapStoreError(e);
    const message = e instanceof Error ? e.message : "Server error";
    return errorResponse(500, message);
  }
}
