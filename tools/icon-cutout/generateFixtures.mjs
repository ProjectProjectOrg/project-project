// THROWAWAY — T-136 cutout probe. Regenerate with:
//   node packages/frontend/src/dev/icon-cutout/generateFixtures.mjs
import { deflateSync } from "node:zlib"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SIZE = 512
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(
  here,
  "../../packages/frontend/src/dev/icon-cutout/fixtures"
)

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}
const encodePng = (rgba, width, height) => {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy
      ? rgba.copy(
          raw,
          y * (width * 4 + 1) + 1,
          y * width * 4,
          (y + 1) * width * 4
        )
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(
          raw,
          y * (width * 4 + 1) + 1
        )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ])
}

const canvas = () => {
  const px = Buffer.alloc(SIZE * SIZE * 4, 255)
  return {
    px,
    set(x, y, [r, g, b], alpha = 1) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return
      const i = (y * SIZE + x) * 4
      px[i] = Math.round(px[i] * (1 - alpha) + r * alpha)
      px[i + 1] = Math.round(px[i + 1] * (1 - alpha) + g * alpha)
      px[i + 2] = Math.round(px[i + 2] * (1 - alpha) + b * alpha)
      px[i + 3] = 255
    }
  }
}

const fill = (c, shade) => {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) c.set(x, y, shade(x, y), 1)
}

const insidePolygon = (pts, x, y) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Supersampled coverage so edges are antialiased the way a real export would be.
const coverage = (test, x, y) => {
  let hits = 0
  for (let sy = 0; sy < 3; sy++)
    for (let sx = 0; sx < 3; sx++)
      if (test(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++
  return hits / 9
}

const paint = (c, test, color) => {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const a = coverage(test, x, y)
      if (a > 0)
        c.set(x, y, typeof color === "function" ? color(x, y) : color, a)
    }
}

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const diamond = (cx, cy, r) => (x, y) =>
  Math.abs(x - cx) + Math.abs(y - cy) <= r

const INK = [37, 99, 235]
const ACCENT = [244, 114, 22]

const write = (name, buf) => {
  writeFileSync(join(outDir, name), buf)
  console.log("wrote", name)
}

const mark = (c, color = INK, accent = ACCENT, dx = 0, dy = 0) => {
  paint(c, (x, y) => diamond(256 + dx, 250 + dy, 150)(x, y), color)
  paint(c, (x, y) => circle(320 + dx, 190 + dy, 62)(x, y), accent)
}

mkdirSync(outDir, { recursive: true })

// 1. The real ProjectProject logo, traced from docs/logo-reference.svg.
//    Flat black background, and the right-hand quad's gradient fades to pure
//    black at x=420 — it dissolves into the background it sits on.
{
  const c = canvas()
  const s = SIZE / 500
  fill(c, () => [0, 0, 0])
  const left = [
    [80 * s, 128.571 * s],
    [193.333 * s, 144.762 * s],
    [193.333 * s, 355.238 * s],
    [80 * s, 371.429 * s]
  ]
  const right = [
    [209.524 * s, 144.762 * s],
    [420 * s, 80 * s],
    [420 * s, 420 * s],
    [209.524 * s, 355.238 * s]
  ]
  paint(c, (x, y) => insidePolygon(left, x, y), [255, 255, 255])
  paint(
    c,
    (x, y) => insidePolygon(right, x, y),
    (x) => {
      const t = Math.min(
        1,
        Math.max(0, (x - 209.524 * s) / ((420 - 209.524) * s))
      )
      const v = Math.round(255 * (1 - t))
      return [v, v, v]
    }
  )
  write("projectproject-logo.png", encodePng(c.px, SIZE, SIZE))
}

// 2. Best case: flat pure white.
{
  const c = canvas()
  fill(c, () => [255, 255, 255])
  mark(c)
  write("mark-flat-white.png", encodePng(c.px, SIZE, SIZE))
}

// 3. Off-white with per-pixel noise, as a JPEG export would produce.
{
  const c = canvas()
  let seed = 7
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  fill(c, () => {
    const n = Math.round((rand() - 0.5) * 7)
    return [244 + n, 242 + n, 238 + n]
  })
  mark(c)
  write("mark-offwhite-noise.png", encodePng(c.px, SIZE, SIZE))
}

// 4. Vertical gradient background — corners disagree top-to-bottom.
{
  const c = canvas()
  fill(c, (_x, y) => {
    const t = y / SIZE
    return [255 - Math.round(55 * t), 255 - Math.round(35 * t), 255]
  })
  mark(c)
  write("mark-gradient.png", encodePng(c.px, SIZE, SIZE))
}

// 5. Subject runs off the bottom-right edge, so it touches the border.
{
  const c = canvas()
  fill(c, () => [255, 255, 255])
  mark(c, INK, ACCENT, 120, 130)
  write("mark-touches-border.png", encodePng(c.px, SIZE, SIZE))
}

// 6. Subject barely separable from the background.
{
  const c = canvas()
  fill(c, () => [244, 244, 244])
  mark(c, [237, 237, 237], [231, 231, 231])
  write("mark-color-matched.png", encodePng(c.px, SIZE, SIZE))
}

// 7. Soft drop shadow under the mark — the classic feathering trap.
{
  const c = canvas()
  fill(c, () => [255, 255, 255])
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.abs(x - 276) + Math.abs(y - 276) - 150
      if (d > 0 && d < 46) {
        const a = 0.32 * (1 - d / 46)
        c.set(x, y, [120, 120, 130], a)
      }
    }
  mark(c)
  write("mark-soft-shadow.png", encodePng(c.px, SIZE, SIZE))
}

// 8. Photographic background — should fail the check outright.
{
  const c = canvas()
  let seed = 99
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const blobs = Array.from({ length: 26 }, () => ({
    x: rand() * SIZE,
    y: rand() * SIZE,
    r: 60 + rand() * 150,
    c: [60 + rand() * 180, 70 + rand() * 170, 50 + rand() * 120]
  }))
  fill(c, (x, y) => {
    let r = 90,
      g = 110,
      b = 70
    for (const bl of blobs) {
      const d = Math.hypot(x - bl.x, y - bl.y)
      if (d < bl.r) {
        const w = 1 - d / bl.r
        r = r * (1 - w) + bl.c[0] * w
        g = g * (1 - w) + bl.c[1] * w
        b = b * (1 - w) + bl.c[2] * w
      }
    }
    const n = (rand() - 0.5) * 18
    return [
      Math.max(0, Math.min(255, r + n)),
      Math.max(0, Math.min(255, g + n)),
      Math.max(0, Math.min(255, b + n))
    ].map(Math.round)
  })
  mark(c)
  write("photo-busy.png", encodePng(c.px, SIZE, SIZE))
}
