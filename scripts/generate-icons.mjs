// PWA 아이콘 생성 (외부 이미지 도구 없이 PNG 직접 인코딩). 실행: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const NAVY = [30, 58, 95]
const PAPER = [248, 246, 241]
const CUE = [214, 226, 240]
const ACCENT = [194, 105, 45]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** 코넬 노트 레이아웃(키워드 열 · 필기 영역 · 요약 영역)을 단순화한 아이콘. */
function pixel(x, y, size) {
  const u = size / 100
  const inRect = (x0, y0, x1, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u
  if (!inRect(18, 14, 82, 86)) return NAVY
  if (inRect(18, 70, 82, 72)) return NAVY // 요약 구분선
  if (inRect(38, 14, 40, 70)) return NAVY // 키워드 열 구분선
  if (inRect(18, 14, 38, 70)) {
    if (inRect(23, 22, 34, 26) || inRect(23, 34, 32, 38)) return NAVY
    return CUE
  }
  if (inRect(45, 22, 76, 25) || inRect(45, 32, 72, 35) || inRect(45, 42, 76, 45) || inRect(45, 52, 66, 55)) return [120, 135, 155]
  if (inRect(24, 77, 62, 80)) return ACCENT
  return PAPER
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/apple-touch-icon.png', png(180))
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#1e3a5f"/><rect x="18" y="14" width="64" height="72" fill="#f8f6f1"/><rect x="18" y="14" width="20" height="56" fill="#d6e2f0"/><rect x="38" y="14" width="2" height="56" fill="#1e3a5f"/><rect x="18" y="70" width="64" height="2" fill="#1e3a5f"/><rect x="24" y="77" width="38" height="3" fill="#c2692d"/></svg>\n`,
)
console.log('icons written')
