// THROWAWAY — T-136 cutout probe. Composites each fixture's cutout onto a
// checker so eaten edges and halos are visible. Run with:
//   bun packages/frontend/src/dev/icon-cutout/render.ts <mode> <tolerance>
import { deflateSync, inflateSync } from "node:zlib"
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  analyzeCutout,
  type MatchMode,
  type RgbaImage
} from "../../packages/frontend/src/dev/icon-cutout/cutout"

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(
  here,
  "../../packages/frontend/src/dev/icon-cutout/fixtures"
)
const outDir = join(here, "out")

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}
const encodePng = (rgba: Uint8ClampedArray, width: number, height: number) => {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++)
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
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
const decodePng = (buffer: Buffer): RgbaImage => {
  let offset = 8
  let width = 0
  let height = 0
  const idat: Array<Buffer> = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
    }
    if (type === "IDAT") idat.push(body)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    raw.copy(
      data as unknown as Uint8Array,
      y * stride,
      y * (stride + 1) + 1,
      y * (stride + 1) + 1 + stride
    )
  return { data, width, height }
}

const mode = (process.argv[2] ?? "global") as MatchMode
const tolerance = Number(process.argv[3] ?? 24)

mkdirSync(outDir, { recursive: true })

for (const name of readdirSync(fixturesDir).filter((f) => f.endsWith(".png"))) {
  const image = decodePng(readFileSync(join(fixturesDir, name)))
  const { alpha, clean } = analyzeCutout(image, { tolerance, feather: 1, mode })
  const { width, height, data } = image
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const i = p * 4
      const a = alpha[p] / 255
      const checker = ((x >> 5) + (y >> 5)) % 2 === 0 ? 220 : 150
      const tint = [checker, checker * 0.45, checker]
      for (let c = 0; c < 3; c++)
        out[i + c] = Math.round(data[i + c] * a + tint[c] * (1 - a))
      out[i + 3] = 255
    }
  const label = `${name.replace(/\.png$/, "")}--${mode}-${tolerance}-${clean ? "clean" : "reject"}.png`
  writeFileSync(join(outDir, label), encodePng(out, width, height))
  console.log(label)
}
