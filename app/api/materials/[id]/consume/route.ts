import {
  errorResponse,
  parseQuantity,
  readJsonBody,
  runMutation,
} from "@/lib/api-helpers";
import { consume } from "@/lib/materials-store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = await readJsonBody(request);
  if (body === null) return errorResponse(400, "Invalid JSON body");
  const parsed = parseQuantity(body);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.message);
  return runMutation(() => consume(params.id, parsed.quantity));
}
