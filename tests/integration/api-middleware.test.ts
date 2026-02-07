import { describe, it, expect } from 'vitest';
import { APIError, handleAPIError } from '@/lib/errors/handler';
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api/response';
import { shouldUseStorage } from '@/lib/storage/files';

describe('API Error Handling', () => {
  it('should create proper error types', () => {
    const badReq = APIError.badRequest('Invalid input');
    expect(badReq.status).toBe(400);
    expect(badReq.code).toBe('BAD_REQUEST');

    const unauth = APIError.unauthorized();
    expect(unauth.status).toBe(401);
    expect(unauth.code).toBe('AUTH_REQUIRED');

    const forbidden = APIError.forbidden();
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe('FORBIDDEN');

    const notFound = APIError.notFound();
    expect(notFound.status).toBe(404);
    expect(notFound.code).toBe('NOT_FOUND');

    const rateLimited = APIError.tooManyRequests();
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.code).toBe('RATE_LIMITED');
  });

  it('should handle APIError in handler', async () => {
    const response = handleAPIError(APIError.badRequest('Test error'));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('Test error');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('should handle unknown errors gracefully', async () => {
    const response = handleAPIError(new Error('Unexpected'));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('API Response Formatting', () => {
  it('should format success responses', async () => {
    const response = successResponse({ id: '123' });
    const body = await response.json();
    expect(body.data).toEqual({ id: '123' });
  });

  it('should format error responses', async () => {
    const response = errorResponse('Not found', 'NOT_FOUND', 404);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe('Not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should format validation error responses', async () => {
    const response = validationErrorResponse({ email: ['Invalid email'] });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.email).toContain('Invalid email');
  });
});

describe('File Storage Strategy', () => {
  it('should use database for files under 100KB', () => {
    expect(shouldUseStorage(50 * 1024)).toBe(false);
    expect(shouldUseStorage(99 * 1024)).toBe(false);
  });

  it('should use storage for files at or above 100KB', () => {
    expect(shouldUseStorage(100 * 1024)).toBe(true);
    expect(shouldUseStorage(200 * 1024)).toBe(true);
  });

  it('should handle boundary correctly at exactly 100KB', () => {
    expect(shouldUseStorage(100 * 1024 - 1)).toBe(false);
    expect(shouldUseStorage(100 * 1024)).toBe(true);
  });
});
