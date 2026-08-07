#!/usr/bin/env node
// Generate PWA PNG icons with zero dependencies: rasterize a few polygons into an
// RGBA buffer and encode a PNG via Node's built-in zlib. Avoids needing ImageMagick.
// Output: ../icons/icon-192.png, icon-512.png
//
// Run: node scripts/generate_icons.js

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Icon design defined on a 512 grid; scaled to the requested size.
const BG = hex("#6b4f34");
const POLYS = [
  { pts: [[256, 110], [190, 190], [190, 420], [256, 440]], c: hex("#c3b3ec") }, // left facet
  { pts: [[256, 110], [322, 190], [322, 420], [256, 440]], c: hex("#9a83d2") }, // right facet
  { pts: [[256, 110], [190, 190], [256, 190]], c: hex("#ddd2f6") },             // pyramid left
  { pts: [[256, 110], [322, 190], [256, 190]], c: hex("#b0a0e0") },             // pyramid right
];

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const s = size / 512;
  const px = new Uint8Array(size * size * 4);
  const scaled = POLYS.map(p => ({ c: p.c, pts: p.pts.map(([x, y]) => [x * s, y * s]) }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG;
      // sample at pixel center; later polygons paint over earlier ones
      for (const poly of scaled) if (inPoly(x + 0.5, y + 0.5, poly.pts)) [r, g, b] = poly.c;
      const o = (y * size + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  return px;
}

// --- minimal PNG encoder (8-bit RGBA) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, RGBA
  // filter byte 0 per scanline
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => { raw[y * (size * 4 + 1) + 1 + i] = v; });
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, "..", "icons");
for (const size of [192, 512]) {
  const png = encodePNG(render(size), size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}

// --- self-check: re-read a PNG, verify signature + IHDR dimensions ---
const p = fs.readFileSync(path.join(outDir, "icon-512.png"));
console.assert(p.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "bad PNG signature");
console.assert(p.readUInt32BE(16) === 512 && p.readUInt32BE(20) === 512, "bad IHDR size");
console.log("selfcheck OK: valid PNG signature + 512x512 IHDR");
