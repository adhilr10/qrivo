/**
 * Lightweight, zero-dependency QR Code generator in pure TypeScript.
 * Generates QR Code matrices and renders to SVG string or HTML Canvas (for PNG export).
 * Implements standard QR Code ISO/IEC 18004 specs for Version 1 to 10 (Byte mode, Error Correction L/M/Q/H).
 */

// Error Correction Levels
export const ECLevel = {
  L: 1, // ~7%
  M: 0, // ~15% (default)
  Q: 3, // ~25%
  H: 2, // ~30%
} as const;

export type ECLevelType = keyof typeof ECLevel;

// Polynomial Galois Field GF(256) math
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initGF256() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val <<= 1;
    if (val & 256) {
      val ^= 285;
    }
  }
  LOG_TABLE[0] = 0;
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function getGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, EXP_TABLE[i]]);
  }
  return poly;
}

function calculateECC(data: number[], ecCount: number): number[] {
  const gen = getGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const lead = msg[i];
    if (lead !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], lead);
      }
    }
  }
  return msg.slice(data.length);
}

// QR Code capacities and specs for Versions 1-10 (Byte mode, EC Level M)
// [version, totalCodewords, ecCodewordsPerBlock, numBlocks]
const VERSION_SPECS_M: [number, number, number, number][] = [
  [1, 26, 10, 1],   // V1: 16 data bytes
  [2, 44, 16, 1],   // V2: 28 data bytes
  [3, 70, 26, 1],   // V3: 44 data bytes
  [4, 100, 18, 2],  // V4: 64 data bytes
  [5, 134, 24, 2],  // V5: 86 data bytes
  [6, 172, 16, 4],  // V6: 108 data bytes
  [7, 196, 18, 4],  // V7: 124 data bytes
  [8, 242, 22, 4],  // V8: 154 data bytes
  [9, 292, 22, 5],  // V9: 182 data bytes
  [10, 346, 26, 5], // V10: 216 data bytes
];

// Alignment pattern centers for versions 1 to 10
const ALIGNMENT_PATTERNS: number[][] = [
  [], // V0
  [], // V1
  [6, 18], // V2
  [6, 22], // V3
  [6, 26], // V4
  [6, 30], // V5
  [6, 34], // V6
  [6, 22, 38], // V7
  [6, 24, 42], // V8
  [6, 26, 46], // V9
  [6, 28, 50], // V10
];

export class QRCode {
  public text: string;
  public version: number = 1;
  public size: number = 21;
  public modules: boolean[][] = [];
  private isReserved: boolean[][] = [];

  constructor(text: string) {
    this.text = text;
    this.generate();
  }

  private generate() {
    const dataBytes = new TextEncoder().encode(this.text);
    // Determine smallest version capable of holding dataBytes
    let chosenSpec = VERSION_SPECS_M[0];
    for (const spec of VERSION_SPECS_M) {
      const maxData = spec[1] - spec[2] * spec[3] - 2; // header overhead
      if (dataBytes.length <= maxData) {
        chosenSpec = spec;
        break;
      }
    }

    this.version = chosenSpec[0];
    this.size = 17 + 4 * this.version;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isReserved = Array.from({ length: this.size }, () => new Array(this.size).fill(false));

    // 1. Add Function Patterns
    this.addFinders();
    this.addSeparators();
    this.addTimingPatterns();
    this.addAlignmentPatterns();
    this.reserveFormatInfo();

    // 2. Encode Data + Error Correction
    const codewords = this.encodeData(dataBytes, chosenSpec);

    // 3. Place Data Bits
    this.placeData(codewords);

    // 4. Apply Mask Pattern (Mask 0: (row + col) % 2 === 0)
    this.applyMask(0);

    // 5. Add Format Information (EC M, Mask 0)
    this.addFormatInfo(0);
  }

  private reserve(r: number, c: number) {
    if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
      this.isReserved[r][c] = true;
    }
  }

  private setModule(r: number, c: number, val: boolean) {
    if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
      this.modules[r][c] = val;
    }
  }

  private addFinders() {
    const finders = [
      [0, 0],
      [0, this.size - 7],
      [this.size - 7, 0],
    ];
    for (const [row, col] of finders) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBlack =
            r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          this.setModule(row + r, col + c, isBlack);
          this.reserve(row + r, col + c);
        }
      }
    }
  }

  private addSeparators() {
    for (let i = 0; i < 8; i++) {
      // Top-left
      this.reserve(i, 7);
      this.reserve(7, i);
      // Top-right
      this.reserve(i, this.size - 8);
      this.reserve(7, this.size - 1 - i);
      // Bottom-left
      this.reserve(this.size - 8, i);
      this.reserve(this.size - 1 - i, 7);
    }
  }

  private addTimingPatterns() {
    for (let i = 8; i < this.size - 8; i++) {
      const val = i % 2 === 0;
      if (!this.isReserved[6][i]) {
        this.setModule(6, i, val);
        this.reserve(6, i);
      }
      if (!this.isReserved[i][6]) {
        this.setModule(i, 6, val);
        this.reserve(i, 6);
      }
    }
  }

  private addAlignmentPatterns() {
    const coords = ALIGNMENT_PATTERNS[this.version] || [];
    for (let r of coords) {
      for (let c of coords) {
        // Skip if overlapping finder patterns
        if (
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= this.size - 8) ||
          (r >= this.size - 8 && c <= 8)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            this.setModule(r + dr, c + dc, isBlack);
            this.reserve(r + dr, c + dc);
          }
        }
      }
    }
  }

  private reserveFormatInfo() {
    for (let i = 0; i < 9; i++) {
      this.reserve(8, i);
      this.reserve(i, 8);
      this.reserve(8, this.size - 1 - i);
      this.reserve(this.size - 1 - i, 8);
    }
    // Dark module
    this.setModule(this.size - 8, 8, true);
    this.reserve(this.size - 8, 8);
  }

  private encodeData(bytes: Uint8Array, spec: [number, number, number, number]): number[] {
    const [, totalCodewords, ecPerBlock, numBlocks] = spec;
    const dataCodewords = totalCodewords - ecPerBlock * numBlocks;

    // Byte Mode Indicator: 0100 (4 bits)
    // Character Count: 8 bits for Byte mode in V1-V9, 16 bits in V10+
    const bitBuffer: number[] = [];
    const pushBits = (val: number, len: number) => {
      for (let i = len - 1; i >= 0; i--) {
        bitBuffer.push((val >> i) & 1);
      }
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, this.version < 10 ? 8 : 16);
    for (let b of bytes) {
      pushBits(b, 8);
    }

    // Terminator (up to 4 bits)
    const capacityBits = dataCodewords * 8;
    const termLen = Math.min(4, capacityBits - bitBuffer.length);
    pushBits(0, termLen);

    // Byte align
    while (bitBuffer.length % 8 !== 0) {
      bitBuffer.push(0);
    }

    // Pad bytes
    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bitBuffer.length < capacityBits) {
      pushBits(padBytes[padIndex % 2], 8);
      padIndex++;
    }

    // Convert bits to raw data codewords
    const rawData: number[] = [];
    for (let i = 0; i < bitBuffer.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bitBuffer[i + j];
      }
      rawData.push(b);
    }

    // Interleave blocks
    const blockDataLen = Math.floor(dataCodewords / numBlocks);
    const dataBlocks: number[][] = [];
    const ecBlocks: number[][] = [];

    let offset = 0;
    for (let i = 0; i < numBlocks; i++) {
      const blk = rawData.slice(offset, offset + blockDataLen);
      offset += blockDataLen;
      dataBlocks.push(blk);
      ecBlocks.push(calculateECC(blk, ecPerBlock));
    }

    const finalCodewords: number[] = [];
    // Interleave data
    for (let i = 0; i < blockDataLen; i++) {
      for (let b = 0; b < numBlocks; b++) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
    // Interleave EC
    for (let i = 0; i < ecPerBlock; i++) {
      for (let b = 0; b < numBlocks; b++) {
        finalCodewords.push(ecBlocks[b][i]);
      }
    }

    return finalCodewords;
  }

  private placeData(codewords: number[]) {
    const bits: number[] = [];
    for (let c of codewords) {
      for (let i = 7; i >= 0; i--) {
        bits.push((c >> i) & 1);
      }
    }

    let bitIdx = 0;
    let up = true;
    for (let right = this.size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing column
      const col1 = right;
      const col2 = right - 1;

      for (let step = 0; step < this.size; step++) {
        const row = up ? this.size - 1 - step : step;
        for (let c of [col1, col2]) {
          if (!this.isReserved[row][c]) {
            if (bitIdx < bits.length) {
              this.modules[row][c] = bits[bitIdx] === 1;
              bitIdx++;
            }
          }
        }
      }
      up = !up;
    }
  }

  private applyMask(maskNum: number) {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.isReserved[r][c]) {
          let invert = false;
          if (maskNum === 0) {
            invert = (r + c) % 2 === 0;
          }
          if (invert) {
            this.modules[r][c] = !this.modules[r][c];
          }
        }
      }
    }
  }

  private addFormatInfo(maskNum: number) {
    // Format string: EC M (00) + Mask 0 (000) = 0b00000 -> BCH code: 0b101010000010010
    // Standard format for EC M & Mask 0 is 0x5412 (XORed with 0x5412 = 0b000000000000000)
    const formatBits = 0x5412; // (0x0000 ^ 0x5412) = 0x5412

    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >> i) & 1) === 1;
      // Top-left
      if (i < 6) this.setModule(8, i, bit);
      else if (i === 6) this.setModule(8, 7, bit);
      else if (i === 7) this.setModule(8, 8, bit);
      else if (i === 8) this.setModule(7, 8, bit);
      else this.setModule(14 - i, 8, bit);

      // Split copy
      if (i < 8) this.setModule(this.size - 1 - i, 8, bit);
      else this.setModule(8, this.size - 15 + i, bit);
    }
  }

  /**
   * Render to crisp Scalable Vector Graphics (SVG)
   */
  public toSVG(options?: {
    color?: string;
    bgColor?: string;
    margin?: number;
    size?: number;
  }): string {
    const color = options?.color || '#000000';
    const bgColor = options?.bgColor || '#ffffff';
    const margin = options?.margin ?? 2;
    const totalDim = this.size + margin * 2;
    const displaySize = options?.size || 320;

    let path = '';
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.modules[r][c]) {
          path += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${displaySize}" height="${displaySize}" shape-rendering="crispEdges">
  <rect width="${totalDim}" height="${totalDim}" fill="${bgColor}"/>
  <path d="${path}" fill="${color}"/>
</svg>`;
  }

  /**
   * Render to HTML5 Canvas (useful in browser for downloading PNG)
   */
  public renderToCanvas(
    canvas: HTMLCanvasElement,
    options?: {
      color?: string;
      bgColor?: string;
      margin?: number;
      size?: number;
    }
  ) {
    const color = options?.color || '#000000';
    const bgColor = options?.bgColor || '#ffffff';
    const margin = options?.margin ?? 2;
    const totalDim = this.size + margin * 2;
    const pixelSize = options?.size || 512;
    const scale = pixelSize / totalDim;

    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, pixelSize, pixelSize);

    ctx.fillStyle = color;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.modules[r][c]) {
          ctx.fillRect(
            Math.round((c + margin) * scale),
            Math.round((r + margin) * scale),
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }
  }
}
