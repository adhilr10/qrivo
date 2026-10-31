import {
  upload,
  ImageKitAbortError,
  ImageKitInvalidRequestError,
  ImageKitServerError,
  ImageKitUploadNetworkError,
} from '@imagekit/javascript';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export interface UploadedLogo {
  url: string;
  fileId: string;
  name: string;
}

interface UploadAuthParams {
  signature: string;
  expire: number;
  token: string;
  publicKey: string;
}

/** Turn an ImageKit/SDK failure into a message the admin can act on. */
function uploadErrorMessage(error: unknown): string {
  if (error instanceof ImageKitAbortError) return 'The upload was cancelled.';
  if (error instanceof ImageKitInvalidRequestError) return `ImageKit rejected the image: ${error.message}`;
  if (error instanceof ImageKitUploadNetworkError) return 'Network error — check your connection and try again.';
  if (error instanceof ImageKitServerError) return `ImageKit is unavailable right now: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Ask the server for short-lived ImageKit credentials tied to this admin session. */
async function getUploadAuth(accessToken: string): Promise<UploadAuthParams> {
  const response = await fetch('/api/upload-auth', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  let body: Partial<UploadAuthParams> & { error?: { message?: string } } = {};
  try {
    body = await response.json();
  } catch {
    // Keep the status-based message below.
  }

  if (!response.ok) {
    throw new Error(body?.error?.message || `Upload authentication failed (HTTP ${response.status}).`);
  }
  if (!body.signature || !body.token || !body.expire || !body.publicKey) {
    throw new Error('The upload server returned incomplete ImageKit credentials.');
  }

  return {
    signature: body.signature,
    token: body.token,
    expire: body.expire,
    publicKey: body.publicKey,
  };
}

/**
 * Ask ImageKit's CDN for automatic format negotiation: WebP to browsers that
 * accept it, AVIF where supported, and the original format everywhere else.
 * The Media Library keeps the uploaded original untouched.
 */
export function withAutoFormat(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('tr')) parsed.searchParams.set('tr', 'f-auto');
    return parsed.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}tr=f-auto`;
  }
}

function safeFileName(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() || '' : '';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'logo';
  const suffix = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  return `${base}-${Date.now()}.${suffix}`;
}

/**
 * Upload a business logo straight from the browser to ImageKit and return the
 * public CDN URL that is stored in `businesses.logo_url`.
 */
export async function uploadLogo(
  file: File,
  accessToken: string,
  onProgress?: (percent: number) => void,
): Promise<UploadedLogo> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Choose a PNG, JPG, WebP, GIF, or SVG image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('Logo images must be 5 MB or smaller.');
  }

  const auth = await getUploadAuth(accessToken);

  try {
    const result = await upload({
      ...auth,
      file,
      fileName: safeFileName(file),
      folder: '/qrivo/logos',
      useUniqueFileName: true,
      tags: ['qrivo', 'business-logo'],
      onProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });

    if (!result.url) throw new Error('ImageKit did not return a public URL for this image.');
    return { url: withAutoFormat(result.url), fileId: result.fileId || '', name: result.name || '' };
  } catch (error) {
    throw new Error(uploadErrorMessage(error));
  }
}
