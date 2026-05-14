import { authenticate } from "@/lib/authenticate";
import {
  errorResponse,
  optionsResponse,
  parseNonNegativeQuantity,
  readJsonBody,
  runMutation,
} from "@/lib/api-helpers";
import { adjust } from "@/lib/materials-store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authError = await authenticate(request);
  if (authError) return authError;
  const body = await readJsonBody(request);
  if (body === null) return errorResponse(400, "Invalid JSON body");
  const parsed = parseNonNegativeQuantity(body);
  if (!parsed.ok) return errorResponse(parsed.status, parsed.message);
  return runMutation(() => adjust(params.id, parsed.quantity));
}

export const OPTIONS = optionsResponse;
