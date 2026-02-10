import { describe, it, expect } from 'vitest';
import { signUpSchema, loginSchema, forgotPasswordSchema } from '@/lib/api/validation';
import type { AuthUser, SignUpRequest, LoginRequest } from '@/lib/types/auth';

describe('Auth Validation Schemas', () => {
  it('should validate valid signup data', () => {
    const data: SignUpRequest = {
      email: 'user@example.com',
      password: 'securepass123',
      full_name: 'Test User',
    };
    expect(() => signUpSchema.parse(data)).not.toThrow();
  });

  it('should reject invalid email in signup', () => {
    expect(() =>
      signUpSchema.parse({ email: 'invalid', password: 'securepass123' })
    ).toThrow();
  });

  it('should reject short password in signup', () => {
    expect(() =>
      signUpSchema.parse({ email: 'user@test.com', password: '123' })
    ).toThrow();
  });

  it('should validate valid login data', () => {
    const data: LoginRequest = {
      email: 'user@example.com',
      password: 'securepass123',
    };
    expect(() => loginSchema.parse(data)).not.toThrow();
  });

  it('should validate valid forgot password data', () => {
    expect(() =>
      forgotPasswordSchema.parse({ email: 'user@example.com' })
    ).not.toThrow();
  });

  it('should reject invalid forgot password email', () => {
    expect(() => forgotPasswordSchema.parse({ email: 'not-an-email' })).toThrow();
  });
});

describe('Auth Types', () => {
  it('should define AuthUser with profile', () => {
    const user: AuthUser = {
      id: 'test-id',
      email: 'test@example.com',
      profile: {
        id: 'test-id',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    expect(user.profile?.full_name).toBe('Test User');
  });
});
