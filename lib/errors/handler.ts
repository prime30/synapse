import { NextResponse } from 'next/server';

export class APIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = 'APIError';
  }

  static badRequest(message: string, code = 'BAD_REQUEST'): APIError {
    return new APIError(message, code, 400);
  }

  static unauthorized(message = 'Unauthorized', code = 'AUTH_REQUIRED'): APIError {
    return new APIError(message, code, 401);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): APIError {
    return new APIError(message, code, 403);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND'): APIError {
    return new APIError(message, code, 404);
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED'): APIError {
    return new APIError(message, code, 429);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR'): APIError {
    return new APIError(message, code, 500);
  }
}

export function handleAPIError(error: unknown): NextResponse {
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  console.error('Unhandled error:', error);
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
