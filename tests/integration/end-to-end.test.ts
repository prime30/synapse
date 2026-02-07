import { describe, it, expect } from 'vitest';
import { signUpSchema, loginSchema, createProjectSchema, createFileSchema } from '@/lib/api/validation';
import { getAIProvider } from '@/lib/ai/get-provider';
import { shouldUseStorage } from '@/lib/storage/files';
import { APIError } from '@/lib/errors/handler';
import { successResponse } from '@/lib/api/response';

describe('End-to-End Workflow Validation', () => {
  it('should validate complete user signup flow data', () => {
    const signupData = signUpSchema.parse({
      email: 'newuser@example.com',
      password: 'securepassword123',
      full_name: 'New User',
    });
    expect(signupData.email).toBe('newuser@example.com');
    expect(signupData.full_name).toBe('New User');
  });

  it('should validate complete login flow data', () => {
    const loginData = loginSchema.parse({
      email: 'newuser@example.com',
      password: 'securepassword123',
    });
    expect(loginData.email).toBe('newuser@example.com');
  });

  it('should validate project creation data', () => {
    const projectData = createProjectSchema.parse({
      name: 'My Shopify Store',
      description: 'A custom Shopify theme project',
      organization_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(projectData.name).toBe('My Shopify Store');
  });

  it('should validate file upload data', () => {
    const fileData = createFileSchema.parse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'product.liquid',
      path: 'templates/product.liquid',
      file_type: 'liquid',
      content: '<h1>{{ product.title }}</h1>',
    });
    expect(fileData.file_type).toBe('liquid');
  });

  it('should determine correct storage strategy for uploaded files', () => {
    const smallContent = 'x'.repeat(50 * 1024);  // 50KB
    const largeContent = 'x'.repeat(150 * 1024);  // 150KB

    const smallSize = new TextEncoder().encode(smallContent).length;
    const largeSize = new TextEncoder().encode(largeContent).length;

    expect(shouldUseStorage(smallSize)).toBe(false);
    expect(shouldUseStorage(largeSize)).toBe(true);
  });

  it('should have AI providers available for interaction', () => {
    const openai = getAIProvider('openai');
    const anthropic = getAIProvider('anthropic');

    expect(openai.name).toBe('openai');
    expect(anthropic.name).toBe('anthropic');
    expect(typeof openai.complete).toBe('function');
    expect(typeof openai.stream).toBe('function');
    expect(typeof anthropic.complete).toBe('function');
    expect(typeof anthropic.stream).toBe('function');
  });

  it('should have proper error handling for unauthorized access', () => {
    const error = APIError.unauthorized();
    expect(error.status).toBe(401);
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('should format success responses consistently', async () => {
    const response = successResponse({ id: '123', name: 'Test' });
    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body.data.id).toBe('123');
  });
});
