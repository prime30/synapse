/**
 * NextAuth.js JWT and session callbacks - REQ-8
 */

export interface EnhancedToken {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface EnhancedSession {
  user: {
    id: string;
    name?: string;
    email?: string;
    image?: string;
  };
  expires: string;
}

export function jwtCallback(params: { token: any; account?: any; profile?: any }): any {
  const { token, account, profile } = params;
  if (account) {
    token.accessToken = account.access_token;
    token.refreshToken = account.refresh_token;
  }
  if (profile) {
    token.name = profile.name;
    token.picture = profile.picture ?? profile.image;
  }
  return token;
}

export function sessionCallback(params: { session: any; token: any }): any {
  const { session, token } = params;
  if (session.user) {
    session.user.id = token.sub;
    session.user.name = token.name;
    session.user.image = token.picture;
  }
  return session;
}
