import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ink = [7, 8, 11, 255];
const lime = [214, 255, 74, 255];

function paint(x, y, size) {
  const nx = (x + 0.5) / size - 0.5;
  const ny = (y + 0.5) / size - 0.5;
  const dist = Math.hypot(nx, ny);
  if (dist > 0.4) return ink;
  const left = Math.hypot(nx + 0.13, ny);
  const right = Math.hypot(nx - 0.13, ny);
  const bar = Math.abs(ny) < 0.028 && Math.abs(nx) < 0.14;
  if (left < 0.075 || right < 0.075 || bar) return ink;
  return lime;
}

for (const [name, size] of [
  ["public/pwa-192x192.png", 192],
  ["public/pwa-512x512.png", 512],
  ["public/apple-touch-icon.png", 180],
]) {
  writeFileSync(name, png(size, paint));
}
