// Gera os PNG do manifest a partir das mesmas formas do icon.svg.
// O Chrome no Android exige um icone de 192px ou mais para oferecer a
// instalacao, e nao aceita SVG de forma confiavel para isso.
//
//   node tools/gen-icons.mjs
//
// Sem dependencias: rasteriza por supersampling e escreve o PNG na mao
// (zlib e nativo do Node).

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BG = [0x0f, 0x6e, 0x56];
const BAR_LIGHT = [0xe1, 0xf5, 0xee];
const BAR_MID = [0x9f, 0xe1, 0xcb];

// ---------- formas, no sistema de 192 unidades do SVG

const insideRoundedRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const insideCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Cada camada devolve a cor no ponto, ou null se o ponto esta fora dela.
const LAYERS = {
  any: [
    (x, y) => (insideRoundedRect(x, y, 0, 0, 192, 192, 42) ? BG : null),
    (x, y) => (insideRoundedRect(x, y, 38, 52, 116, 34, 10) ? BAR_LIGHT : null),
    (x, y) => (insideRoundedRect(x, y, 38, 106, 116, 34, 10) ? BAR_MID : null),
    (x, y) => (insideCircle(x, y, 128, 69, 9) ? BG : null),
    (x, y) => (insideCircle(x, y, 128, 123, 9) ? BG : null),
  ],
  // Maskable: fundo sangrando ate a borda e conteudo dentro da zona segura,
  // porque o Android recorta o icone em circulo, squircle ou gota.
  maskable: [
    (x, y) => BG,
    (x, y) => (insideRoundedRect(x, y, 52, 62, 88, 28, 9) ? BAR_LIGHT : null),
    (x, y) => (insideRoundedRect(x, y, 52, 104, 88, 28, 9) ? BAR_MID : null),
  ],
};

// ---------- rasterizacao

const SAMPLES = 3;

function raster(size, layers) {
  const scale = 192 / size;
  const px = Buffer.alloc(size * size * 4);
  const step = 1 / SAMPLES;

  for (let py = 0; py < size; py += 1) {
    for (let pxi = 0; pxi < size; pxi += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const ux = (pxi + (sx + 0.5) * step) * scale;
          const uy = (py + (sy + 0.5) * step) * scale;
          let color = null;
          for (const layer of layers) {
            const hit = layer(ux, uy);
            if (hit) color = hit;
          }
          if (color) { r += color[0]; g += color[1]; b += color[2]; a += 255; }
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (py * size + pxi) * 4;
      // Cor media apenas entre as amostras cobertas, para a borda nao escurecer.
      const covered = a / 255;
      px[i] = covered ? Math.round(r / covered) : 0;
      px[i + 1] = covered ? Math.round(g / covered) : 0;
      px[i + 2] = covered ? Math.round(b / covered) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

// ---------- PNG

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
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // 8 bits por canal
  ihdr[9] = 6;   // RGBA
  const stride = size * 4;
  const rawLines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rawLines[y * (stride + 1)] = 0; // filtro "none"
    pixels.copy(rawLines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawLines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- saida

for (const [name, size, variant] of [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['icon-maskable-512.png', 512, 'maskable'],
]) {
  const png = encodePng(size, raster(size, LAYERS[variant]));
  writeFileSync(join(ROOT, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
