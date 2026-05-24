import { NextRequest, NextResponse } from "next/server";
import {
  listMaterials,
  getMaterial,
  materialCount,
  consume,
  reserve,
  release,
  restock,
  adjust,
  StoreError,
} from "@/lib/materials-store";

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function storeErr(e: unknown) {
  const kind = e instanceof StoreError ? e.kind : "internal_error";
  const status = e instanceof StoreError && e.kind === "not_found" ? 404 : 409;
  return NextResponse.json({ error: kind }, { status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("invalid JSON body");
  }

  const { capability, ...params } = body;

  // Dispatch on the action suffix (e.g., "materials.list" and "f1_materials.list"
  // both map to "list"). The app stays namespace-agnostic so the controller can
  // register it under any prefix.
  const capStr = typeof capability === "string" ? capability : "";
  const action = capStr.includes(".") ? capStr.split(".").pop() : capStr;

  try {
    switch (action) {
      case "list": {
        const materials = await listMaterials();
        return NextResponse.json(materials);
      }

      case "get": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        const material = await getMaterial(params.id);
        if (!material) return err("Material not found", 404);
        return NextResponse.json(material);
      }

      case "status": {
        const count = await materialCount();
        return NextResponse.json({
            instanceName: process.env.INSTANCE_NAME ?? "unknown",
            type: "raw_materials",
            materialCount: count,
            health: "ok",
            timestamp: new Date().toISOString(),
          });
      }

      case "consume": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        try {
          const material = await consume(params.id, params.quantity as number);
          return NextResponse.json(material);
        } catch (e) {
          return storeErr(e);
        }
      }

      case "reserve": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        try {
          const material = await reserve(params.id, params.quantity as number);
          return NextResponse.json(material);
        } catch (e) {
          return storeErr(e);
        }
      }

      case "release": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        try {
          const material = await release(params.id, params.quantity as number);
          return NextResponse.json(material);
        } catch (e) {
          return storeErr(e);
        }
      }

      case "restock": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        try {
          const material = await restock(params.id, params.quantity as number);
          return NextResponse.json(material);
        } catch (e) {
          return storeErr(e);
        }
      }

      case "adjust": {
        if (!params.id || typeof params.id !== "string")
          return err("id is required");
        try {
          const material = await adjust(params.id, params.quantity as number);
          return NextResponse.json(material);
        } catch (e) {
          return storeErr(e);
        }
      }

      default:
        return err(`unknown capability: ${capStr}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    return err(message, 500);
  }
}
