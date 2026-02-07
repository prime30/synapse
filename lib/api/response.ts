import { NextResponse } from 'next/server';

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(
  error: string,
  code: string,
  status = 500
): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export function validationErrorResponse(
  errors: Record<string, string[]>
): NextResponse {
  return NextResponse.json(
    { error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors },
    { status: 400 }
  );
}
