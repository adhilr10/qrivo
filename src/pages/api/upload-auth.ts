import type { APIRoute } from 'astro';
import { env as workerEnv } from 'cloudflare:workers';
import { createClient } from '@supabase/supabase-js';
import { getUploadAuthParams } from '@imagekit/astro/server';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Read a secret from the Cloudflare binding (Astro v6+ removed
 * `Astro.locals.runtime.env`), then fall back to the local process/build env so
 * the same route works under `astro dev` and Node tooling.
 */
function readEnv(key: 'IMAGEKIT_PRIVATE_KEY' | 'IMAGEKIT_PUBLIC_KEY'): string {
  const fromWorker = (workerEnv as unknown as Record<string, unknown>)[key];
  if (typeof fromWorker === 'string' && fromWorker.trim()) return fromWorker.trim();
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim();
  const fromBuild = (import.meta.env as Record<string, unknown>)[key];
  return typeof fromBuild === 'string' ? fromBuild.trim() : '';
}

/**
 * Issues short-lived ImageKit upload credentials for a signed-in admin.
 *
 * The private key never leaves the server: the browser receives only the
 * signature, token, expiry, and public key needed for a direct upload.
 */
export const GET: APIRoute = async ({ request }) => {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ error: { code: 'unauthorized', message: 'Sign in before uploading a logo.' } }, 401);
  }

  const supabaseUrl = (workerEnv.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (workerEnv.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: { code: 'supabase_unavailable', message: 'Supabase is not configured.' } }, 503);
  }

  const verifier = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await verifier.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: { code: 'unauthorized', message: 'Your session expired. Sign in again.' } }, 401);
  }

  const privateKey = readEnv('IMAGEKIT_PRIVATE_KEY');
  const publicKey = readEnv('IMAGEKIT_PUBLIC_KEY');
  if (!privateKey || !publicKey) {
    return json(
      {
        error: {
          code: 'imagekit_unavailable',
          message:
            'ImageKit is not configured. Add IMAGEKIT_PUBLIC_KEY and IMAGEKIT_PRIVATE_KEY to the server environment.',
        },
      },
      503,
    );
  }

  try {
    const authParams = getUploadAuthParams({ privateKey, publicKey });
    return json(authParams);
  } catch (error) {
    console.error('ImageKit upload auth failed:', error);
    return json({ error: { code: 'imagekit_failed', message: 'Could not create upload credentials.' } }, 500);
  }
};
