/**
 * Geometry for the Qrivo counter-card template (public/qrivo-template.png).
 *
 * The 1050 x 1500 artwork has a blank white board in the lower half. These
 * numbers were measured from the artwork, so both the server renderer (sharp)
 * and the browser fallback (Canvas) draw the QR in exactly the same place.
 */
export const QR_CARD = {
  width: 1050,
  height: 1500,
  /** Centre of the white board. */
  centerX: 543,
  centerY: 952,
  /** Largest QR square, including its quiet zone, that fits the board. */
  qrSide: 592,
  /** Quiet zone in modules (spec minimum is 4). */
  quietZone: 4,
  /** The board is drawn at a slight angle; match it so the QR sits flat. */
  angle: -3.4,
  /** Served from `public/` so the browser can load it for the Canvas fallback. */
  templateUrl: '/qrivo-template.png',
} as const;

export interface QrCardPlan {
  /** Pixels per QR module (integer so module edges stay crisp). */
  scale: number;
  /** Rendered QR side in pixels, quiet zone included. */
  size: number;
  /** Top-left corner that centres the QR on the board. */
  left: number;
  top: number;
}

/**
 * Pick the largest integer module scale that keeps the QR inside the board.
 * Module count grows with the encoded URL, so a longer link simply renders
 * with fewer pixels per module.
 */
export function planQrCard(moduleCount: number): QrCardPlan {
  const totalModules = moduleCount + QR_CARD.quietZone * 2;
  const scale = Math.max(1, Math.floor(QR_CARD.qrSide / totalModules));
  const size = totalModules * scale;
  return {
    scale,
    size,
    left: Math.round(QR_CARD.centerX - size / 2),
    top: Math.round(QR_CARD.centerY - size / 2),
  };
}
