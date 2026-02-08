/** OAuth provider types for NextAuth integration - REQ-8 */

export type OAuthProvider = 'google';

export interface OAuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: OAuthProvider;
}

export interface OAuthSession {
  user: OAuthUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
