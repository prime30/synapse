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
export declare function validateCallbackParams(params: URLSearchParams): OAuthCallbackParams | null;
//# sourceMappingURL=oauth.d.ts.map