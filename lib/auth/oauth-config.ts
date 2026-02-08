/**
 * Google OAuth configuration for NextAuth.js - REQ-8
 * Complements existing Supabase Auth with Google sign-in.
 */

export interface OAuthConfig {
  google: {
    clientId: string;
    clientSecret: string;
  };
  session: {
    maxAge: number; // 30 days in seconds
    strategy: 'jwt';
  };
  pages: {
    signIn: string;
    error: string;
  };
}

export function getOAuthConfig(): OAuthConfig {
  return {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    session: {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      strategy: 'jwt',
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
  };
}
