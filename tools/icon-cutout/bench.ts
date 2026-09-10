// THROWAWAY — T-136. Where does the cutout time actually go?
//   bun tools/icon-cutout/bench.ts
import { inflateSync } from "node:zlib"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  analyzeCutout,
  featherAlpha,
  type RgbaImage
} from "../../packages/frontend/src/dev/icon-cutout/cutout"

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../packages/frontend/src/dev/icon-cutout/fixtures"
)

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

const time = (label: string, runs: number, fn: () => void) => {
  fn()
  const started = performance.now()
  for (let i = 0; i < runs; i++) fn()
  const ms = (performance.now() - started) / runs
  console.log(`${label.padEnd(38)} ${ms.toFixed(1)} ms`)
  return ms
}

const downscale = (image: RgbaImage, edge: number): RgbaImage => {
  const scale = Math.min(1, edge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.round(x / scale))
      const sy = Math.min(image.height - 1, Math.round(y / scale))
      const from = (sy * image.width + sx) * 4
      const to = (y * width + x) * 4
      for (let c = 0; c < 4; c++) data[to + c] = image.data[from + c]
    }
  return { data, width, height }
}

const image = decodePng(readFileSync(join(fixtures, "photo-busy.png")))
console.log(`source ${image.width}x${image.height}\n`)

const full = time("analyzeCutout @512 (current)", 20, () => {
  analyzeCutout(image, { tolerance: 40, mode: "global" })
})

time("  └ featherAlpha alone", 20, () => {
  featherAlpha(new Uint8ClampedArray(image.width * image.height), image.width, image.height, 1)
})

time("analyzeCutout @512 feather 0", 20, () => {
  analyzeCutout(image, { tolerance: 40, feather: 0, mode: "global" })
})

const at256 = downscale(image, 256)
const small = time("analyzeCutout @256", 20, () => {
  analyzeCutout(at256, { tolerance: 40, mode: "global" })
})

const at192 = downscale(image, 192)
time("analyzeCutout @192", 20, () => {
  analyzeCutout(at192, { tolerance: 40, mode: "global" })
})

console.log(
  `\n@256 is ${(full / small).toFixed(1)}x faster than @512; 60fps budget is 16.7ms`
)
