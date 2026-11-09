#!/usr/bin/env node
/**
 * Zerei.app — PWA PNG icon generator (no external dependency).
 *
 * Draws the artwork into an RGBA buffer and encodes the PNG by hand (Node's zlib),
 * so `npm install` doesn't need canvas/sharp for the app to be installable.
 *
 *   node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/* ----------------------------- PNG encoder ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA (Uint8ClampedArray, size*size*4) -> Buffer PNG. */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10..12 = compression/filter/interlace = 0

  // scanlines with filter 0 (None)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const off = y * (size * 4 + 1);
    raw[off] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, off + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- drawing --------------------------------- */

const NEON = [0x39, 0xff, 0x9e];
const CYAN = [0x22, 0xd3, 0xee];
const BG = [0x09, 0x09, 0x0b];
const PANEL = [0x14, 0x14, 0x1b];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function createCanvas(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4) };
}

function blend(canvas, x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const d = canvas.data;
  const a = clamp01(alpha);
  d[i] = lerp(d[i], r, a);
  d[i + 1] = lerp(d[i + 1], g, a);
  d[i + 2] = lerp(d[i + 2], b, a);
  d[i + 3] = Math.max(d[i + 3], a * 255);
}

function fillAll(canvas, color) {
  for (let y = 0; y < canvas.size; y += 1)
    for (let x = 0; x < canvas.size; x += 1) blend(canvas, x, y, color, 1);
}

/** Soft radial glow (quadratic falloff). */
function radialGlow(canvas, cx, cy, radius, color, intensity) {
  const r2 = radius * radius;
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const t = 1 - Math.sqrt(d2) / radius;
      blend(canvas, x, y, color, t * t * intensity);
    }
  }
}

/** Rounded rectangle with an anti-aliased edge. */
function roundRect(canvas, x0, y0, w, h, radius, fill, stroke, strokeWidth) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.floor(y0) - 2; y < Math.ceil(y1) + 2; y += 1) {
    for (let x = Math.floor(x0) - 2; x < Math.ceil(x1) + 2; x += 1) {
      // signed distance to the rounded rectangle edge
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      const dist = Math.hypot(dx, dy) - radius;
      if (fill && dist < 0) blend(canvas, x, y, fill, clamp01(-dist));
      if (stroke && Math.abs(dist + strokeWidth / 2) < strokeWidth / 2 + 0.5) {
        blend(canvas, x, y, stroke, clamp01(strokeWidth / 2 + 0.5 - Math.abs(dist + strokeWidth / 2)));
      }
    }
  }
}

/**
 * 0..1 mask of the pixel art "check".
 * Draws the two check segments on a square grid: each cell lights up when its
 * center is less than `halfWidth` from one of the segments. That gives the pixel
 * art staircase a predictable thickness (direct stamping gets too thick on the
 * diagonals).
 */
function checkMask(size, art) {
  const GRID = 30;
  const cell = art / GRID;
  const offset = (size - art) / 2;
  const mask = new Float32Array(size * size);

  // vertices in normalized artwork coordinates
  const pts = [
    [0.08, 0.50],
    [0.38, 0.80],
    [0.92, 0.16],
  ];
  const halfWidth = 0.065;

  const distToSegment = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const cx = (gx + 0.5) / GRID;
      const cy = (gy + 0.5) / GRID;
      const d = Math.min(
        distToSegment(cx, cy, pts[0], pts[1]),
        distToSegment(cx, cy, pts[1], pts[2]),
      );
      if (d > halfWidth) continue;

      const px0 = Math.round(offset + gx * cell);
      const py0 = Math.round(offset + gy * cell);
      const px1 = Math.round(offset + (gx + 1) * cell);
      const py1 = Math.round(offset + (gy + 1) * cell);
      for (let y = py0; y < py1; y += 1)
        for (let x = px0; x < px1; x += 1)
          if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1;
    }
  }
  return mask;
}

/** Separable box blur, used for the neon halo. */
function blur(mask, size, radius, passes = 3) {
  let src = mask;
  let dst = new Float32Array(size * size);
  for (let p = 0; p < passes; p += 1) {
    // horizontal
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const xx = x + k;
          if (xx < 0 || xx >= size) continue;
          sum += src[y * size + xx];
          count += 1;
        }
        dst[y * size + x] = sum / count;
      }
    }
    [src, dst] = [dst, src];
    // vertical
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const yy = y + k;
          if (yy < 0 || yy >= size) continue;
          sum += src[yy * size + x];
          count += 1;
        }
        dst[y * size + x] = sum / count;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

/**
 * @param {number} size  PNG side length
 * @param {boolean} maskable  true = artwork shrunk into the safe zone, bleeding background
 */
function drawIcon(size, maskable) {
  const canvas = createCanvas(size);
  fillAll(canvas, BG);
  radialGlow(canvas, size * 0.5, size * 0.12, size * 0.85, NEON, 0.22);
  radialGlow(canvas, size * 0.95, size * 0.95, size * 0.7, CYAN, 0.14);

  const safe = maskable ? 0.62 : 0.84; // share of the artwork inside the icon
  const plate = size * safe;
  const px = (size - plate) / 2;
  roundRect(canvas, px, px, plate, plate, plate * 0.22, PANEL, NEON, Math.max(2, size * 0.012));

  const art = plate * 0.74;
  const mask = checkMask(size, art);
  const halo = blur(mask, size, Math.max(1, Math.round(size * 0.008)));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      // the halo is just glow: an exponent > 1 keeps it from thickening the stroke
      if (halo[i] > 0.01) blend(canvas, x, y, NEON, Math.pow(halo[i], 2) * 0.45);
      if (mask[i] > 0) blend(canvas, x, y, [0xd6, 0xff, 0xe9], 1);
    }
  }
  return encodePng(canvas.data, size);
}

/* --------------------------------- output -------------------------------- */

const outDir = path.join(ROOT, 'public/icons');
await mkdir(outDir, { recursive: true });

const targets = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/maskable-512.png', 512, true],
  ['public/icons/apple-touch-icon.png', 180, false],
];

for (const [rel, size, maskable] of targets) {
  const buf = drawIcon(size, maskable);
  const dest = path.join(ROOT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`${rel.padEnd(34)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
console.log('\nIcons generated.');
