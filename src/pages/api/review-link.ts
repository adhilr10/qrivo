import type { APIRoute } from 'astro';

export const prerender = false;

const UPSTREAM = 'https://productmate.com/api/v1/google-review-link';
const TIMEOUT_MS = 12000;

// Only Google Maps hosts are forwarded, so this proxy cannot be pointed at
// arbitrary origins.
const ALLOWED_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page)$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let mapsUrl = '';

  try {
    const body = (await request.json()) as { maps_url?: unknown };
    mapsUrl = typeof body?.maps_url === 'string' ? body.maps_url.trim() : '';
  } catch {
    return json(
      { error: { code: 'invalid_request', message: 'Send JSON with a maps_url string.' } },
      400,
    );
  }

  if (!mapsUrl) {
    return json(
      { error: { code: 'invalid_request', message: 'Paste a Google Maps link or Place ID.' } },
      400,
    );
  }

  let host = '';
  try {
    host = new URL(mapsUrl).hostname;
  } catch {
    return json(
      { error: { code: 'unsupported_url', message: 'That does not look like a link.' } },
      422,
    );
  }

  if (!ALLOWED_HOST.test(host)) {
    return json(
      {
        error: {
          code: 'unsupported_url',
          message: 'Use a Google Maps link — open the business, tap Share, then copy that link.',
        },
      },
      422,
    );
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'ReviewHub/1.0 (+admin review-link lookup)',
      },
      body: JSON.stringify({ maps_url: mapsUrl }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = (await upstream.json().catch(() => null)) as
      | { place_id?: string; review_url?: string; error?: { message?: string } }
      | null;

    if (!upstream.ok || !data?.review_url) {
      const message =
        data?.error?.message ||
        (upstream.status === 429
          ? 'Too many lookups right now. Wait a minute and try again.'
          : 'Could not read that Google Maps link. Try the Share link for the exact business.');
      return json({ error: { code: 'upstream_error', message } }, upstream.status === 429 ? 429 : 422);
    }

    return json({
      place_id: data.place_id || '',
      review_url: data.review_url,
      verification: 'not_verified',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return json(
      {
        error: {
          code: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
          message: timedOut
            ? 'The lookup timed out. Try again or use the generator below.'
            : 'Could not reach the lookup service. Use the generator below instead.',
        },
      },
      504,
    );
  }
};
