// Compact, URL-safe encoding for invitation links and client return codes.
// Uses the browser-native CompressionStream (deflate-raw), so no library and no server.
//
// Invitation links put the payload in the URL hash (#/quote/<token>?d=...).
// Everything after "#" stays in the browser and is never sent to any web server.

const RETURN_PREFIX = 'SB1.';

function toBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeObject(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

export async function decodeObject(text) {
  const bytes = fromBase64Url(text.trim());
  const raw = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(raw));
}

/** Client → designer: everything the client entered, packed into one string. */
export async function encodeReturnCode(session) {
  return RETURN_PREFIX + (await encodeObject(session));
}

/**
 * Accepts a return code, a downloaded response file (which contains the code),
 * or raw JSON. Returns the session object or throws.
 */
export async function decodeReturnCode(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('empty');
  if (text.startsWith('{')) return JSON.parse(text);
  const match = text.match(/SB1\.[A-Za-z0-9_-]+/);
  if (!match) throw new Error('format');
  return decodeObject(match[0].slice(RETURN_PREFIX.length));
}
