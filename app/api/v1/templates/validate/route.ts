import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/middleware/auth";
import { successResponse } from "@/lib/api/response";
import { handleAPIError, APIError } from "@/lib/errors/handler";
import { LiquidValidator } from "@/lib/liquid/validator";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { template, project_id } = body as {
      template?: string;
      project_id?: string;
    };

    if (typeof template !== "string" || template.trim().length === 0) {
      throw APIError.badRequest(
        "template is required and must be a non-empty string",
      );
    }

    const validator = new LiquidValidator();
    const result = await validator.validate(template, project_id);

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
