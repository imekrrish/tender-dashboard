import { gunzipSync } from 'node:zlib';
import { inspectBundle, applyBundle } from '../imports/import-service.js';

export function decodeSeed(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('TENDER_SEED_BASE64 is empty');
  const encoded = value.trim();
  if (encoded.length > 2 * 1024 * 1024 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('TENDER_SEED_BASE64 must contain gzip data encoded as base64');
  }
  let bundle;
  try {
    bundle = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 10 * 1024 * 1024 }).toString('utf8'));
  } catch {
    throw new Error('TENDER_SEED_BASE64 is invalid or exceeds the size limit');
  }
  inspectBundle(bundle);
  return bundle;
}

export async function seedDatabase(client, value) {
  return applyBundle(client, decodeSeed(value));
}
