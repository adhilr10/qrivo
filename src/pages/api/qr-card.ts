import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { QR_CARD, planQrCard } from '../../lib/qr-card';

export const prerender = false;

const MAX_URL_LENGTH = 512;
const TEMPLATE_FILE = path.join(process.cwd(), 'public', 'qrivo-template.png');

type CardFormat = 'png' | 'jpeg';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function readFormat(value: unknown): CardFormat {
  return value === 'jpeg' || value === 'jpg' ? 'jpeg' : 'png';
}

/**
 * Render a branded counter card: the QR code composited onto the white board
 * of the Qrivo template.
 *
 * `sharp` is a native module, so this route only works on Node runtimes. On
 * Cloudflare Workers the dynamic import throws and the client falls back to a
 * Canvas renderer that uses the same geometry.
 */
export const POST: APIRoute = async ({ request }) => {
  let url = '';
  let format: CardFormat = 'png';

  try {
    const body = (await request.json()) as { url?: unknown; format?: unknown };
    url = typeof body?.url === 'string' ? body.url.trim() : '';
    format = readFormat(body?.format);
  } catch {
    return json({ error: { code: 'invalid_request', message: 'Send JSON with a url string.' } }, 400);
  }

  if (!url || url.length > MAX_URL_LENGTH) {
    return json({ error: { code: 'invalid_request', message: 'A url between 1 and 512 characters is required.' } }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return json({ error: { code: 'invalid_request', message: 'That is not a valid URL.' } }, 422);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return json({ error: { code: 'invalid_request', message: 'Only http(s) links can be encoded.' } }, 422);
  }

  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return json(
      {
        error: {
          code: 'sharp_unavailable',
          message: 'Card rendering is unavailable on this runtime. The browser fallback should be used.',
        },
      },
      501,
    );
  }

  try {
    const template = await readFile(TEMPLATE_FILE);

    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const plan = planQrCard(qr.modules.size);

    const qrPng = await QRCode.toBuffer(url, {
      type: 'png',
      margin: QR_CARD.quietZone,
      scale: plan.scale,
      // Transparent background: the board's own white supplies the quiet
      // zone, so the code can be larger without white squares covering the
      // board frame when the layer is rotated.
      color: { dark: '#0a0a0a', light: '#00000000' },
      errorCorrectionLevel: 'M',
    });

    const rotated = await sharp(qrPng)
      .rotate(QR_CARD.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    const left = Math.round(QR_CARD.centerX - rotated.info.width / 2);
    const top = Math.round(QR_CARD.centerY - rotated.info.height / 2);

    const image = sharp(template).composite([{ input: rotated.data, left, top }]);
    const output =
      format === 'jpeg'
        ? await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
        : await image.png({ compressionLevel: 9 }).toBuffer();

    return new Response(new Uint8Array(output), {
      status: 200,
      headers: {
        'Content-Type': format === 'jpeg' ? 'image/jpeg' : 'image/png',
        'Content-Length': String(output.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('QR card render failed:', error);
    return json({ error: { code: 'render_failed', message: 'Could not render the card.' } }, 500);
  }
};
