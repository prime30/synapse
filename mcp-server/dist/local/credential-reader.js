import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const CREDENTIALS_DIR = '.synapse-theme';
function deriveKey() {
    const seed = `${os.hostname()}${os.userInfo().username}`;
    return crypto.createHash('sha256').update(seed).digest();
}
function credentialsPath() {
    const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || os.homedir();
    return path.join(home, CREDENTIALS_DIR, 'credentials.json');
}
function readCredentials() {
    try {
        const raw = fs.readFileSync(credentialsPath(), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function loadCredentials(store) {
    const creds = readCredentials();
    const entry = creds[store];
    if (!entry)
        return null;
    try {
        const key = deriveKey();
        const iv = Buffer.from(entry.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(entry.encrypted, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');
        return { accessToken: decrypted };
    }
    catch {
        return null;
    }
}
export function listStoredStores() {
    const creds = readCredentials();
    return Object.keys(creds);
}
//# sourceMappingURL=credential-reader.js.map