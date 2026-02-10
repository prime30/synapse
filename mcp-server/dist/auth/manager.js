import fs from 'fs';
import path from 'path';
import { getSynapseDir, ensureSynapseDir } from '../config.js';
import { logger } from '../logger.js';
const AUTH_FILE = 'auth.json';
export class AuthManager {
    config;
    token = null;
    expiresAt = null;
    user = null;
    constructor(config) {
        this.config = config;
    }
    /** Load stored token from ~/.synapse/auth.json */
    async loadToken() {
        ensureSynapseDir();
        const authPath = this.getAuthPath();
        if (!fs.existsSync(authPath)) {
            logger.info('No stored auth token found');
            return;
        }
        try {
            const raw = fs.readFileSync(authPath, 'utf-8');
            const stored = JSON.parse(raw);
            if (!stored.token || !stored.expiresAt || !stored.user) {
                logger.warn('Invalid auth file structure');
                return;
            }
            const expiry = new Date(stored.expiresAt);
            if (expiry <= new Date()) {
                logger.info('Stored token expired, attempting refresh');
                if (this.config.autoRefreshToken) {
                    this.token = stored.token;
                    await this.refreshToken();
                }
                return;
            }
            this.token = stored.token;
            this.expiresAt = expiry;
            this.user = stored.user;
            logger.info('Loaded auth token', { email: stored.user.email });
        }
        catch (error) {
            logger.error('Failed to load auth token', error);
        }
    }
    /** Start browser-based OAuth flow */
    async authenticate() {
        const { default: open } = await import('open');
        const http = await import('http');
        const crypto = await import('crypto');
        const state = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                const url = new URL(req.url ?? '', `http://localhost`);
                if (url.pathname === '/auth/callback') {
                    const token = url.searchParams.get('token');
                    const userId = url.searchParams.get('user_id');
                    const email = url.searchParams.get('email');
                    const expiresAt = url.searchParams.get('expires_at');
                    if (token && userId && email) {
                        this.token = token;
                        this.expiresAt = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                        this.user = { id: userId, email };
                        this.persistToken();
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window and return to Cursor.</p></body></html>');
                        server.close();
                        logger.info('OAuth authentication successful', { email });
                        resolve({ success: true, user: this.user });
                    }
                    else {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>Authentication failed</h1><p>Missing required parameters.</p></body></html>');
                        server.close();
                        resolve({ success: false });
                    }
                }
            });
            // Listen on random port
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;
                const authUrl = `${this.config.apiUrl}/auth/mcp?state=${state}&redirect_port=${port}`;
                logger.info('Opening browser for OAuth', { url: authUrl });
                open(authUrl);
            });
            // 5 minute timeout
            setTimeout(() => {
                server.close();
                reject(new Error('OAuth authentication timed out after 5 minutes'));
            }, 5 * 60 * 1000);
        });
    }
    /** Refresh an expired token */
    async refreshToken() {
        if (!this.token)
            return;
        try {
            const response = await fetch(`${this.config.apiUrl}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`,
                },
            });
            if (!response.ok) {
                logger.warn('Token refresh failed, clearing auth');
                this.clearAuth();
                return;
            }
            const data = (await response.json());
            if (data.data?.session?.access_token) {
                this.token = data.data.session.access_token;
                this.expiresAt = data.data.session.expires_at
                    ? new Date(data.data.session.expires_at * 1000)
                    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                this.persistToken();
                logger.info('Token refreshed successfully');
            }
        }
        catch (error) {
            logger.error('Token refresh error', error);
            this.clearAuth();
        }
    }
    /** Get Authorization header value */
    getAuthHeader() {
        if (!this.token)
            return null;
        return `Bearer ${this.token}`;
    }
    /** Check if authenticated */
    isAuthenticated() {
        return this.token !== null && (this.expiresAt === null || this.expiresAt > new Date());
    }
    /** Get current user */
    getUser() {
        return this.user;
    }
    /** Clear stored auth */
    logout() {
        this.clearAuth();
        const authPath = this.getAuthPath();
        if (fs.existsSync(authPath)) {
            fs.unlinkSync(authPath);
        }
        logger.info('Logged out');
    }
    persistToken() {
        ensureSynapseDir();
        const data = {
            token: this.token,
            expiresAt: this.expiresAt?.toISOString() ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            user: this.user,
        };
        fs.writeFileSync(this.getAuthPath(), JSON.stringify(data, null, 2));
    }
    clearAuth() {
        this.token = null;
        this.expiresAt = null;
        this.user = null;
    }
    getAuthPath() {
        return path.join(getSynapseDir(), AUTH_FILE);
    }
}
//# sourceMappingURL=manager.js.map