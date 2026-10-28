const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** Ambiguous characters (0/O, 1/I/l) are omitted so printed codes stay easy to read. */
export function generateShortCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function isShortPath(pathname: string): boolean {
  const cleaned = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  return cleaned.startsWith('s/') && cleaned.length > 2;
}

export function parseShortCodeFromPath(pathname: string): string | null {
  const cleaned = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!cleaned.startsWith('s/')) return null;
  const code = cleaned.slice(2).split('/')[0] || '';
  return /^[a-z0-9]{4,12}$/.test(code) ? code : null;
}

export function shortLinkUrl(origin: string, shortCode: string): string {
  return `${origin.replace(/\/+$/, '')}/s/${shortCode}`;
}

export function qrDestinationUrl(origin: string, shortCode?: string | null, slug?: string): string {
  if (shortCode) return shortLinkUrl(origin, shortCode);
  if (slug) return `${origin.replace(/\/+$/, '')}/${slug}`;
  return origin;
}
