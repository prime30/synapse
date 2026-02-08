import { describe, it, expect } from 'vitest';
import {
  isPublicPath,
  getRedirectUrl,
  DEFAULT_ROUTE_CONFIG,
  type ProtectedRouteConfig,
} from '../route-guard';

describe('Route Guard - REQ-8 TASK-3', () => {
  describe('DEFAULT_ROUTE_CONFIG', () => {
    it('should include expected public paths', () => {
      expect(DEFAULT_ROUTE_CONFIG.publicPaths).toContain('/');
      expect(DEFAULT_ROUTE_CONFIG.publicPaths).toContain('/auth/signin');
      expect(DEFAULT_ROUTE_CONFIG.publicPaths).toContain('/auth/error');
    });

    it('should include expected API public paths', () => {
      expect(DEFAULT_ROUTE_CONFIG.apiPublicPaths).toContain('/api/auth/');
      expect(DEFAULT_ROUTE_CONFIG.apiPublicPaths).toContain('/api/health');
    });
  });

  describe('isPublicPath', () => {
    it('should return true for exact public paths', () => {
      expect(isPublicPath('/')).toBe(true);
      expect(isPublicPath('/auth/signin')).toBe(true);
      expect(isPublicPath('/auth/error')).toBe(true);
    });

    it('should return true for API auth sub-routes (prefix match)', () => {
      expect(isPublicPath('/api/auth/login')).toBe(true);
      expect(isPublicPath('/api/auth/callback')).toBe(true);
      expect(isPublicPath('/api/auth/logout')).toBe(true);
    });

    it('should return true for /api/health', () => {
      expect(isPublicPath('/api/health')).toBe(true);
    });

    it('should return false for protected paths', () => {
      expect(isPublicPath('/dashboard')).toBe(false);
      expect(isPublicPath('/projects')).toBe(false);
      expect(isPublicPath('/projects/123/files')).toBe(false);
      expect(isPublicPath('/settings')).toBe(false);
    });

    it('should return false for protected API paths', () => {
      expect(isPublicPath('/api/projects')).toBe(false);
      expect(isPublicPath('/api/files/123')).toBe(false);
      expect(isPublicPath('/api/v1/themes')).toBe(false);
    });

    it('should not match partial public path strings', () => {
      // '/auth/signin-extra' should NOT match the exact '/auth/signin'
      expect(isPublicPath('/auth/signin-extra')).toBe(false);
      expect(isPublicPath('/auth/error/details')).toBe(false);
    });

    it('should accept a custom config', () => {
      const customConfig: ProtectedRouteConfig = {
        publicPaths: ['/custom-public'],
        apiPublicPaths: ['/api/custom/'],
      };

      expect(isPublicPath('/custom-public', customConfig)).toBe(true);
      expect(isPublicPath('/api/custom/endpoint', customConfig)).toBe(true);
      expect(isPublicPath('/', customConfig)).toBe(false);
      expect(isPublicPath('/auth/signin', customConfig)).toBe(false);
    });

    it('should handle empty config', () => {
      const emptyConfig: ProtectedRouteConfig = {
        publicPaths: [],
        apiPublicPaths: [],
      };

      expect(isPublicPath('/', emptyConfig)).toBe(false);
      expect(isPublicPath('/api/auth/login', emptyConfig)).toBe(false);
    });
  });

  describe('getRedirectUrl', () => {
    it('should return signin URL with encoded callbackUrl', () => {
      expect(getRedirectUrl('/dashboard')).toBe(
        '/auth/signin?callbackUrl=%2Fdashboard',
      );
    });

    it('should encode complex paths', () => {
      expect(getRedirectUrl('/projects/123/files')).toBe(
        '/auth/signin?callbackUrl=%2Fprojects%2F123%2Ffiles',
      );
    });

    it('should encode paths with query parameters', () => {
      expect(getRedirectUrl('/search?q=hello&page=2')).toBe(
        '/auth/signin?callbackUrl=%2Fsearch%3Fq%3Dhello%26page%3D2',
      );
    });

    it('should handle root path', () => {
      expect(getRedirectUrl('/')).toBe('/auth/signin?callbackUrl=%2F');
    });

    it('should encode special characters', () => {
      const result = getRedirectUrl('/path with spaces');
      expect(result).toBe(
        '/auth/signin?callbackUrl=%2Fpath%20with%20spaces',
      );
    });
  });
});
