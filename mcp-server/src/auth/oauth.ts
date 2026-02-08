/**
 * OAuth utilities for the MCP authentication flow.
 * The main OAuth logic lives in AuthManager.authenticate().
 * This module provides helper types and validation.
 */

export interface OAuthCallbackParams {
  token: string;
  user_id: string;
  email: string;
  expires_at?: string;
  state?: string;
}

export function validateCallbackParams(
  params: URLSearchParams
): OAuthCallbackParams | null {
  const token = params.get('token');
  const userId = params.get('user_id');
  const email = params.get('email');

  if (!token || !userId || !email) {
    return null;
  }

  return {
    token,
    user_id: userId,
    email,
    expires_at: params.get('expires_at') ?? undefined,
    state: params.get('state') ?? undefined,
  };
}
