import { NextResponse } from 'next/server';
import { validationErrorResponse } from '@/lib/api/response';

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

  static conflict(message = 'Resource conflict', code = 'CONFLICT'): APIError {
    return new APIError(message, code, 409);
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED'): APIError {
    return new APIError(message, code, 429);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR'): APIError {
    return new APIError(message, code, 500);
  }

  static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE'): APIError {
    return new APIError(message, code, 503);
  }
}

/**
 * Friendly error messages for common Supabase Auth error codes.
 * These are returned in the API JSON response so the UI can display them directly.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Email not confirmed. Check your inbox for a confirmation link.',
  user_already_exists: 'An account with this email already exists.',
  over_email_send_rate_limit: 'Too many requests. Please wait a minute and try again.',
  user_not_found: 'No account found with this email.',
  weak_password: 'Password is too weak. Use at least 8 characters.',
  same_password: 'New password must be different from the old password.',
  signup_disabled: 'Signups are currently disabled.',
};

export function handleAPIError(error: unknown): NextResponse {
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  // Map Supabase/Postgres unique violation to 409 Conflict
  const err = error as { code?: string; message?: string };
  if (err?.code === '23505') {
    return NextResponse.json(
      { error: err.message ?? 'Resource already exists', code: 'CONFLICT' },
      { status: 409 }
    );
  }

  // Map Supabase Auth errors to actionable responses
  const authErr = error as {
    __isAuthError?: boolean;
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  if (
    (authErr?.__isAuthError || authErr?.name?.includes('AuthApiError')) &&
    typeof authErr?.status === 'number'
  ) {
    const code = authErr.code ?? 'auth_error';
    const friendlyMessage =
      AUTH_ERROR_MESSAGES[code] ?? authErr.message ?? 'Authentication error';

    return NextResponse.json(
      { error: friendlyMessage, code: code.toUpperCase() },
      { status: authErr.status }
    );
  }

  // Handle validation errors thrown by validateBody (Record<string, string[]>)
  if (
    typeof error === 'object' &&
    error !== null &&
    !(error instanceof Error) &&
    !('__isAuthError' in error) &&
    Object.keys(error as Record<string, unknown>).length > 0 &&
    Object.values(error as Record<string, unknown>).every(Array.isArray)
  ) {
    return validationErrorResponse(error as Record<string, string[]>);
  }

  console.error('Unhandled error:', error);
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
