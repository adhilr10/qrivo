import * as QRCode from 'qrcode';
import { QR_CARD, planQrCard } from './qr-card';

/**
 * Browser renderer for the branded counter card.
 *
 * Cloudflare Workers cannot load native modules like `sharp`, so this module
 * replays the server geometry on a Canvas. It is also the fallback when the
 * `/api/qr-card` route is missing (static hosts, offline, older deployments).
 */

let templatePromise: Promise<HTMLImageElement> | null = null;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function loadCardTemplate(): Promise<HTMLImageElement> {
  if (!templatePromise) {
    templatePromise = loadImageElement(QR_CARD.templateUrl).catch((error) => {
      templatePromise = null;
      throw error;
    });
  }
  return templatePromise;
}

export async function renderQrCardOnCanvas(
  url: string,
  format: 'png' | 'jpeg' = 'png',
): Promise<Blob> {
  const template = await loadCardTemplate();
  const canvas = document.createElement('canvas');
  canvas.width = QR_CARD.width;
  canvas.height = QR_CARD.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(template, 0, 0, QR_CARD.width, QR_CARD.height);

  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const plan = planQrCard(qr.modules.size);

  // The QR is generated as a PNG data URL first so `drawImage` receives a
  // ready image; drawing a canvas directly can capture an unfinished render.
  const dataUrl = await QRCode.toDataURL(url, {
    type: 'image/png',
    margin: QR_CARD.quietZone,
    scale: plan.scale,
    // Transparent light modules so the board's white becomes the quiet zone.
    color: { dark: '#0a0a0a', light: '#00000000' },
    errorCorrectionLevel: 'M',
  });
  const qrImage = await loadImageElement(String(dataUrl));

  ctx.save();
  ctx.translate(QR_CARD.centerX, QR_CARD.centerY);
  ctx.rotate((QR_CARD.angle * Math.PI) / 180);
  ctx.drawImage(qrImage, -plan.size / 2, -plan.size / 2, plan.size, plan.size);
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export the card canvas.'))),
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      0.92,
    );
  });
}
