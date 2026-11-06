import { put, list, del } from '@vercel/blob';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;
const PREFIX = 'rcl-temp/';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sign(value) {
  return createHmac('sha256', requiredEnv('MCP_DOWNLOAD_SECRET')).update(value).digest('base64url');
}

export async function createTemporaryDownload({ buffer, contentType, fileName, format }) {
  const blobToken = requiredEnv('BLOB_READ_WRITE_TOKEN');
  // Opportunistic cleanup also runs whenever a document is generated.
  try {
    const page = await list({ prefix: PREFIX, limit: 1000, token: blobToken });
    const cutoff = Date.now() - TTL_MS;
    const expired = page.blobs.filter((item) => new Date(item.uploadedAt).getTime() <= cutoff);
    if (expired.length) await del(expired.map((item) => item.url), { token: blobToken });
  } catch (error) {
    console.error('RCL Maker opportunistic temporary-file cleanup failed:', error);
  }

  const blobPath = `${PREFIX}${randomUUID()}.${format}`;
  const blob = await put(blobPath, buffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType,
    token: blobToken,
  });

  const payload = Buffer.from(JSON.stringify({
    url: blob.url,
    fileName,
    contentType,
    exp: Date.now() + TTL_MS,
  })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const baseUrl = (process.env.MCP_PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL || ''}`).replace(/\/$/, '');
  if (!baseUrl || baseUrl === 'https://') throw new Error('Set MCP_PUBLIC_BASE_URL to the public RCL Maker website URL.');

  return {
    url: `${baseUrl}/api/download/${token}`,
    expiresInSeconds: TTL_MS / 1000,
  };
}

export function verifyDownloadToken(token) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!value.url || !value.fileName || !value.contentType || !Number.isFinite(value.exp) || Date.now() > value.exp) return null;
    const parsed = new URL(value.url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.public.blob.vercel-storage.com')) return null;
    return value;
  } catch {
    return null;
  }
}

export const TEMP_BLOB_PREFIX = PREFIX;
