import { gzipSync, gunzipSync } from 'zlib';

export function compressContent(content: string): string {
  const buffer = gzipSync(Buffer.from(content, 'utf-8'));
  return buffer.toString('base64');
}

export function decompressContent(encoded: string): string {
  const buffer = Buffer.from(encoded, 'base64');
  return gunzipSync(buffer).toString('utf-8');
}
