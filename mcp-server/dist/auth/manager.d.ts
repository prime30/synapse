import { type SynapseConfig } from '../config.js';
export declare class AuthManager {
    private config;
    private token;
    private expiresAt;
    private user;
    constructor(config: SynapseConfig);
    /** Load stored token from ~/.synapse/auth.json */
    loadToken(): Promise<void>;
    /** Start browser-based OAuth flow */
    authenticate(): Promise<{
        success: boolean;
        user?: {
            id: string;
            email: string;
        };
    }>;
    /** Refresh an expired token */
    refreshToken(): Promise<void>;
    /** Get Authorization header value */
    getAuthHeader(): string | null;
    /** Check if authenticated */
    isAuthenticated(): boolean;
    /** Get current user */
    getUser(): {
        id: string;
        email: string;
    } | null;
    /** Clear stored auth */
    logout(): void;
    private persistToken;
    private clearAuth;
    private getAuthPath;
}
//# sourceMappingURL=manager.d.ts.map