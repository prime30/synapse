import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOAuthConfig } from '../oauth-config';
import { jwtCallback, sessionCallback } from '../oauth-callbacks';
import type { OAuthUser } from '@/lib/types/oauth';

describe('OAuth Configuration - REQ-8', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getOAuthConfig', () => {
    it('should return correct structure', () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

      const config = getOAuthConfig();

      expect(config).toHaveProperty('google');
      expect(config).toHaveProperty('session');
      expect(config).toHaveProperty('pages');
      expect(config.google).toHaveProperty('clientId');
      expect(config.google).toHaveProperty('clientSecret');
      expect(config.session).toHaveProperty('maxAge');
      expect(config.session).toHaveProperty('strategy');
      expect(config.pages).toHaveProperty('signIn');
      expect(config.pages).toHaveProperty('error');
    });

    it('should have session maxAge of 30 days in seconds', () => {
      const config = getOAuthConfig();
      const expectedMaxAge = 30 * 24 * 60 * 60; // 30 days in seconds
      expect(config.session.maxAge).toBe(expectedMaxAge);
    });

    it('should have session strategy as jwt', () => {
      const config = getOAuthConfig();
      expect(config.session.strategy).toBe('jwt');
    });

    it('should use environment variables for Google credentials', () => {
      process.env.GOOGLE_CLIENT_ID = 'env-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'env-client-secret';

      const config = getOAuthConfig();
      expect(config.google.clientId).toBe('env-client-id');
      expect(config.google.clientSecret).toBe('env-client-secret');
    });

    it('should return empty strings when environment variables are not set', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = getOAuthConfig();
      expect(config.google.clientId).toBe('');
      expect(config.google.clientSecret).toBe('');
    });
  });

  describe('jwtCallback', () => {
    it('should enhance token with account data', () => {
      const token = { sub: 'user-123' };
      const account = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
      };
      const profile = {
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      };

      const result = jwtCallback({ token, account, profile });

      expect(result.accessToken).toBe('access-token-123');
      expect(result.refreshToken).toBe('refresh-token-456');
      expect(result.name).toBe('Test User');
      expect(result.picture).toBe('https://example.com/avatar.jpg');
    });

    it('should use profile.image as fallback for picture', () => {
      const token = { sub: 'user-123' };
      const profile = {
        name: 'Test User',
        image: 'https://example.com/image.jpg',
      };

      const result = jwtCallback({ token, profile });

      expect(result.picture).toBe('https://example.com/image.jpg');
    });

    it('should handle missing account and profile', () => {
      const token = { sub: 'user-123' };

      const result = jwtCallback({ token });

      expect(result).toEqual({ sub: 'user-123' });
    });
  });

  describe('sessionCallback', () => {
    it('should add user.id from token.sub', () => {
      const session = {
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        expires: '2024-12-31',
      };
      const token = {
        sub: 'user-123',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      };

      const result = sessionCallback({ session, token });

      expect(result.user.id).toBe('user-123');
      expect(result.user.name).toBe('Test User');
      expect(result.user.image).toBe('https://example.com/avatar.jpg');
    });

    it('should handle missing user in session', () => {
      const session = {
        expires: '2024-12-31',
      };
      const token = {
        sub: 'user-123',
      };

      const result = sessionCallback({ session, token });

      expect(result).toEqual({
        expires: '2024-12-31',
      });
    });
  });

  describe('OAuthUser type structure', () => {
    it('should match expected OAuthUser interface', () => {
      const oauthUser: OAuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        provider: 'google',
      };

      expect(oauthUser.id).toBe('user-123');
      expect(oauthUser.email).toBe('test@example.com');
      expect(oauthUser.name).toBe('Test User');
      expect(oauthUser.image).toBe('https://example.com/avatar.jpg');
      expect(oauthUser.provider).toBe('google');
    });

    it('should allow null for name and image', () => {
      const oauthUser: OAuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        image: null,
        provider: 'google',
      };

      expect(oauthUser.name).toBeNull();
      expect(oauthUser.image).toBeNull();
    });
  });
});
