/**
 * Robust QR Code generator in pure TypeScript — zero dependencies.
 *
 * Generates QR Code matrices and renders to SVG string or HTML Canvas.
 * Implements ISO/IEC 18004 for Version 1–40, Byte mode,
 * Error Correction levels L / M / Q / H, with automatic best-mask selection.
 */

// ── Error-correction levels ────────────────────────────────────────────────
export const ECLevel = { L: 1, M: 0, Q: 3, H: 2 } as const;
export type ECLevelType = keyof typeof ECLevel;

// ── Galois Field GF(256) arithmetic ────────────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let v = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = v;
    LOG[v] = i;
    v = (v << 1) ^ (v & 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  const g = new Uint8Array(degree + 1);
  g[0] = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = i + 1; j >= 1; j--) {
      g[j] = g[j] ^ gfMul(g[j - 1], EXP[i]);
    }
  }
  return g;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const out = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const lead = data[i] ^ out[0];
    out.copyWithin(0, 1);
    out[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      out[j] ^= gfMul(gen[ecLen - 1 - j], lead);
    }
  }
  return out;
}

// ── Version / EC capacity tables (ISO 18004 Table 9) ──────────────────────
//
// For each version (1–40) and EC level, store:
//   [totalDataCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataPerBlockGroup1,
//    numBlocksGroup2, dataPerBlockGroup2]
//
// Only EC level M is used by default, but we define all four so the caller
// can pass a level if they need more/less resilience.

interface VersionECInfo {
  totalCodewords: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1DataCW: number;
  g2Blocks: number;
  g2DataCW: number;
}

// prettier-ignore
const VERSION_EC_TABLE: Record<number, Record<number, VersionECInfo>> = {};

// Build the table from the compact spec arrays.
// Format per version: [totalCodewords, [L], [M], [Q], [H]]
// where each level = [ecPerBlock, g1Blocks, g1DataCW, g2Blocks, g2DataCW]
// prettier-ignore
const SPECS: [number, number[],number[],number[],number[]][] = [
  // V1
  [26,  [7,1,19,0,0],  [10,1,16,0,0],  [13,1,13,0,0],  [17,1,9,0,0]],
  // V2
  [44,  [10,1,34,0,0], [16,1,28,0,0],  [22,1,22,0,0],  [28,1,16,0,0]],
  // V3
  [70,  [15,1,55,0,0], [26,1,44,0,0],  [18,2,17,0,0],  [22,2,13,0,0]],
  // V4
  [100, [20,1,80,0,0], [18,2,32,0,0],  [26,2,24,0,0],  [16,4,9,0,0]],
  // V5
  [134, [26,1,108,0,0],[24,2,43,0,0],  [18,2,15,2,16], [22,2,11,2,12]],
  // V6
  [172, [18,2,68,0,0], [16,4,27,0,0],  [24,4,19,0,0],  [28,4,15,0,0]],
  // V7
  [196, [20,2,78,0,0], [18,4,31,0,0],  [18,2,14,4,15], [26,4,13,1,14]],
  // V8
  [242, [24,2,97,0,0], [22,2,38,2,39], [22,4,18,2,19], [26,4,14,2,15]],
  // V9
  [292, [30,2,116,0,0],[22,3,36,2,37], [20,4,16,4,17], [24,4,12,4,13]],
  // V10
  [346, [18,2,68,2,69],[26,4,43,1,44], [24,6,19,2,20], [28,6,15,2,16]],
  // V11
  [404, [20,4,81,0,0], [30,1,50,4,51], [28,4,22,4,23], [24,3,12,8,13]],
  // V12
  [466, [24,2,92,2,93],[22,6,36,2,37], [26,4,20,6,21], [28,7,14,4,15]],
  // V13
  [532, [26,4,107,0,0],[22,8,37,1,38], [24,8,20,4,21], [22,12,11,4,12]],
  // V14
  [581, [30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
  // V15
  [655, [22,5,87,1,88],[24,5,41,5,42], [30,5,24,7,25], [24,11,12,7,13]],
  // V16
  [733, [24,5,98,1,99],[28,7,45,3,46], [24,15,19,2,20],[30,3,15,13,16]],
  // V17
  [815, [28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
  // V18
  [901, [30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
  // V19
  [991, [28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
  // V20
  [1085,[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
  // V21
  [1156,[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]],
  // V22
  [1258,[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]],
  // V23
  [1364,[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
  // V24
  [1474,[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
  // V25
  [1588,[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
  // V26
  [1706,[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
  // V27
  [1828,[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
  // V28
  [1921,[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
  // V29
  [2051,[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
  // V30
  [2185,[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
  // V31
  [2323,[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
  // V32
  [2465,[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
  // V33
  [2611,[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
  // V34
  [2761,[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
  // V35
  [2876,[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
  // V36
  [3034,[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
  // V37
  [3196,[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
  // V38
  [3362,[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
  // V39
  [3532,[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
  // V40
  [3706,[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]],
];

for (let v = 0; v < SPECS.length; v++) {
  const [tc, l, m, q, h] = SPECS[v];
  const ver = v + 1;
  const levels: [number, number[]][] = [
    [1, l], [0, m], [3, q], [2, h],
  ];
  VERSION_EC_TABLE[ver] = {};
  for (const [ecIdx, arr] of levels) {
    VERSION_EC_TABLE[ver][ecIdx] = {
      totalCodewords: tc,
      ecPerBlock: arr[0],
      g1Blocks: arr[1],
      g1DataCW: arr[2],
      g2Blocks: arr[3],
      g2DataCW: arr[4],
    };
  }
}

// ── Alignment pattern center coordinates ───────────────────────────────────
// prettier-ignore
const ALIGN_COORDS: number[][] = [
  [],[], // V0, V1 (no alignment)
  [6,18],[6,22],[6,26],[6,30],[6,34],
  [6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],
  [6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],
  [6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],
  [6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],
  [6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170],
];

// ── Format & version information BCH codes ─────────────────────────────────
// Pre-computed 15-bit format strings for each (EC-level, mask) pair,
// XOR-ed with the mask pattern 0x5412 per ISO 18004.
function calcFormatBits(ecLevel: number, mask: number): number {
  let data = (ecLevel << 3) | mask;
  let bits = data << 10;
  // Generator poly for format info: x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
  const G = 0x537; // 10100110111
  for (let i = 4; i >= 0; i--) {
    if (bits & (1 << (i + 10))) {
      bits ^= G << i;
    }
  }
  return ((data << 10) | bits) ^ 0x5412;
}

function calcVersionBits(version: number): number {
  if (version < 7) return 0;
  // 18-bit = 6-bit version + 12-bit BCH error correction
  // Generator poly: x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + 1 = 0x1F25
  let data = version << 12;
  const G = 0x1f25;
  for (let i = 5; i >= 0; i--) {
    if (data & (1 << (i + 12))) {
      data ^= G << i;
    }
  }
  // data now contains the full 18-bit value (version bits | remainder).
  // Re-OR with the original version bits so the upper 6 are clean.
  return ((version << 12) | (data & 0xfff));
}

// ── Mask functions (ISO 18004 Table 10) ────────────────────────────────────
const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r, _) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// ── QR Code class ──────────────────────────────────────────────────────────
export class QRCode {
  public readonly text: string;
  public readonly version: number;
  public readonly size: number;
  public readonly modules: boolean[][];
  public readonly ecLevel: number;

  private reserved: boolean[][];

  constructor(text: string, ecLevelKey: ECLevelType = 'M') {
    this.text = text;
    this.ecLevel = ECLevel[ecLevelKey];

    const dataBytes = new TextEncoder().encode(text);

    // Pick smallest version that fits
    let ver = 1;
    for (; ver <= 40; ver++) {
      const info = VERSION_EC_TABLE[ver][this.ecLevel];
      const dataCW =
        info.g1Blocks * info.g1DataCW + info.g2Blocks * info.g2DataCW;
      // Header: 4-bit mode + 8 or 16-bit count
      const headerBytes = ver < 10 ? 2 : 3;
      if (dataBytes.length <= dataCW - headerBytes) break;
    }
    if (ver > 40) ver = 40;

    this.version = ver;
    this.size = 17 + 4 * ver;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false)
    );
    this.reserved = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false)
    );

    this.placeFunctionPatterns();
    const codewords = this.encodeData(dataBytes);
    this.placeDataBits(codewords);

    // Evaluate all 8 masks, pick best
    const bestMask = this.selectBestMask();
    this.applyMask(bestMask);
    this.writeFormatInfo(bestMask);
    this.writeVersionInfo();
  }

  // ── Function patterns ──────────────────────────────────────────────────
  private set(r: number, c: number, v: boolean) {
    if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
      this.modules[r][c] = v;
    }
  }

  private reserve(r: number, c: number) {
    if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
      this.reserved[r][c] = true;
    }
  }

  private placeFunctionPatterns() {
    this.placeFinders();
    this.placeTimingPatterns();
    this.placeAlignmentPatterns();
    this.reserveFormatAreas();
    // Dark module
    this.set(this.size - 8, 8, true);
    this.reserve(this.size - 8, 8);
  }

  private placeFinders() {
    const positions = [
      [0, 0],
      [0, this.size - 7],
      [this.size - 7, 0],
    ];
    for (const [baseR, baseC] of positions) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = baseR + r;
          const cc = baseC + c;
          if (rr < 0 || rr >= this.size || cc < 0 || cc >= this.size) continue;
          const inOuter =
            r === 0 || r === 6 || c === 0 || c === 6;
          const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const isSep = r === -1 || r === 7 || c === -1 || c === 7;
          this.set(rr, cc, !isSep && (inOuter || inInner));
          this.reserve(rr, cc);
        }
      }
    }
  }

  private placeTimingPatterns() {
    for (let i = 8; i < this.size - 8; i++) {
      const v = i % 2 === 0;
      if (!this.reserved[6][i]) {
        this.set(6, i, v);
        this.reserve(6, i);
      }
      if (!this.reserved[i][6]) {
        this.set(i, 6, v);
        this.reserve(i, 6);
      }
    }
  }

  private placeAlignmentPatterns() {
    const coords = ALIGN_COORDS[this.version] || [];
    if (coords.length === 0) return;
    for (const cr of coords) {
      for (const cc of coords) {
        // Skip if overlapping finder
        if (cr <= 8 && cc <= 8) continue;
        if (cr <= 8 && cc >= this.size - 8) continue;
        if (cr >= this.size - 8 && cc <= 8) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack =
              Math.abs(dr) === 2 ||
              Math.abs(dc) === 2 ||
              (dr === 0 && dc === 0);
            this.set(cr + dr, cc + dc, isBlack);
            this.reserve(cr + dr, cc + dc);
          }
        }
      }
    }
  }

  private reserveFormatAreas() {
    // Around top-left finder
    for (let i = 0; i <= 8; i++) {
      this.reserve(8, i);
      this.reserve(i, 8);
    }
    // Around top-right finder
    for (let i = 0; i < 8; i++) {
      this.reserve(8, this.size - 1 - i);
    }
    // Around bottom-left finder
    for (let i = 0; i < 8; i++) {
      this.reserve(this.size - 1 - i, 8);
    }

    // Version info areas (V7+)
    if (this.version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          this.reserve(this.size - 11 + j, i);
          this.reserve(i, this.size - 11 + j);
        }
      }
    }
  }

  // ── Data encoding ──────────────────────────────────────────────────────
  private encodeData(bytes: Uint8Array): Uint8Array {
    const info = VERSION_EC_TABLE[this.version][this.ecLevel];
    const totalDataCW =
      info.g1Blocks * info.g1DataCW + info.g2Blocks * info.g2DataCW;

    // Build bit stream: mode indicator (4) + count (8 or 16) + data bytes
    const bits: number[] = [];
    const push = (val: number, len: number) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    push(0b0100, 4); // Byte mode
    push(bytes.length, this.version < 10 ? 8 : 16);
    for (const b of bytes) push(b, 8);

    // Terminator
    const capBits = totalDataCW * 8;
    const termLen = Math.min(4, capBits - bits.length);
    push(0, termLen);

    // Byte-align
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad codewords
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < capBits) {
      push(pads[pi & 1], 8);
      pi++;
    }

    // Convert to bytes
    const dataCW = new Uint8Array(totalDataCW);
    for (let i = 0; i < totalDataCW; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataCW[i] = b;
    }

    // Split into blocks
    const dataBlocks: Uint8Array[] = [];
    const ecBlocks: Uint8Array[] = [];
    let offset = 0;

    for (let g = 0; g < 2; g++) {
      const count = g === 0 ? info.g1Blocks : info.g2Blocks;
      const len = g === 0 ? info.g1DataCW : info.g2DataCW;
      for (let i = 0; i < count; i++) {
        const block = dataCW.slice(offset, offset + len);
        offset += len;
        dataBlocks.push(block);
        ecBlocks.push(rsEncode(block, info.ecPerBlock));
      }
    }

    // Interleave data codewords
    const totalBlocks = info.g1Blocks + info.g2Blocks;
    const maxDataLen = Math.max(info.g1DataCW, info.g2DataCW);
    const result: number[] = [];

    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        if (i < dataBlocks[b].length) result.push(dataBlocks[b][i]);
      }
    }

    // Interleave EC codewords
    for (let i = 0; i < info.ecPerBlock; i++) {
      for (let b = 0; b < totalBlocks; b++) {
        result.push(ecBlocks[b][i]);
      }
    }

    return new Uint8Array(result);
  }

  // ── Data placement ─────────────────────────────────────────────────────
  private placeDataBits(codewords: Uint8Array) {
    const bits: number[] = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    }

    let idx = 0;
    let upward = true;

    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // Skip timing column

      for (let step = 0; step < this.size; step++) {
        const row = upward ? this.size - 1 - step : step;
        for (const col of [right, right - 1]) {
          if (!this.reserved[row][col] && idx < bits.length) {
            this.modules[row][col] = bits[idx] === 1;
            idx++;
          }
        }
      }
      upward = !upward;
    }
  }

  // ── Masking & penalty evaluation ───────────────────────────────────────
  private selectBestMask(): number {
    let bestMask = 0;
    let bestPenalty = Infinity;

    for (let m = 0; m < 8; m++) {
      // Apply mask, compute penalty, undo
      this.applyMask(m);
      this.writeFormatInfo(m);
      const penalty = this.computePenalty();
      // Undo
      this.applyMask(m);

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = m;
      }
    }

    return bestMask;
  }

  private applyMask(maskNum: number) {
    const fn = MASKS[maskNum];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.reserved[r][c] && fn(r, c)) {
          this.modules[r][c] = !this.modules[r][c];
        }
      }
    }
  }

  private computePenalty(): number {
    const n = this.size;
    let penalty = 0;

    // Rule 1: Consecutive same-color modules in row/column (≥5 → 3 + extra)
    for (let r = 0; r < n; r++) {
      let runColor = this.modules[r][0];
      let runLen = 1;
      for (let c = 1; c < n; c++) {
        if (this.modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += runLen - 2;
          runColor = this.modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += runLen - 2;
    }
    for (let c = 0; c < n; c++) {
      let runColor = this.modules[0][c];
      let runLen = 1;
      for (let r = 1; r < n; r++) {
        if (this.modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += runLen - 2;
          runColor = this.modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += runLen - 2;
    }

    // Rule 2: 2×2 same-color blocks → 3 each
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = this.modules[r][c];
        if (
          v === this.modules[r][c + 1] &&
          v === this.modules[r + 1][c] &&
          v === this.modules[r + 1][c + 1]
        ) {
          penalty += 3;
        }
      }
    }

    // Rule 3: Finder-like patterns (1:1:3:1:1 with 4-module light surround)
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n - 11; c++) {
        let match1 = true, match2 = true;
        for (let k = 0; k < 11; k++) {
          if (this.modules[r][c + k] !== pat1[k]) match1 = false;
          if (this.modules[r][c + k] !== pat2[k]) match2 = false;
          if (!match1 && !match2) break;
        }
        if (match1 || match2) penalty += 40;
      }
    }
    for (let c = 0; c < n; c++) {
      for (let r = 0; r <= n - 11; r++) {
        let match1 = true, match2 = true;
        for (let k = 0; k < 11; k++) {
          if (this.modules[r + k][c] !== pat1[k]) match1 = false;
          if (this.modules[r + k][c] !== pat2[k]) match2 = false;
          if (!match1 && !match2) break;
        }
        if (match1 || match2) penalty += 40;
      }
    }

    // Rule 4: Proportion of dark modules
    let dark = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (this.modules[r][c]) dark++;
      }
    }
    const total = n * n;
    const pct = (dark / total) * 100;
    const prev5 = Math.floor(pct / 5) * 5;
    const next5 = prev5 + 5;
    penalty +=
      Math.min(
        Math.abs(prev5 - 50) / 5,
        Math.abs(next5 - 50) / 5
      ) * 10;

    return penalty;
  }

  // ── Format & version info writing ──────────────────────────────────────
  private writeFormatInfo(mask: number) {
    const bits = calcFormatBits(this.ecLevel, mask);

    for (let i = 0; i < 15; i++) {
      const bit = ((bits >> i) & 1) === 1;

      // Top-left: row 8 (horizontal), col 8 (vertical)
      if (i < 6) {
        this.set(8, i, bit);
      } else if (i === 6) {
        this.set(8, 7, bit);
      } else if (i === 7) {
        this.set(8, 8, bit);
      } else if (i === 8) {
        this.set(7, 8, bit);
      } else {
        this.set(14 - i, 8, bit);
      }

      // Bottom-left (vertical) & top-right (horizontal)
      if (i < 8) {
        this.set(this.size - 1 - i, 8, bit);
      } else {
        this.set(8, this.size - 15 + i, bit);
      }
    }
  }

  private writeVersionInfo() {
    if (this.version < 7) return;
    const bits = calcVersionBits(this.version);

    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      // Bottom-left block (rows size-11..size-9, cols 0..5)
      this.set(this.size - 11 + (i % 3), Math.floor(i / 3), bit);
      // Top-right block (rows 0..5, cols size-11..size-9)
      this.set(Math.floor(i / 3), this.size - 11 + (i % 3), bit);
    }
  }

  // ── Renderers ──────────────────────────────────────────────────────────

  /** Render to crisp SVG string. */
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

  /** Render to HTML5 Canvas (for downloading PNG). */
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
