// THROWAWAY — T-136 cutout probe. Run with:
//   bun packages/frontend/src/dev/icon-cutout/probe.ts
import { inflateSync } from "node:zlib"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  analyzeCutout,
  type MatchMode,
  type RgbaImage
} from "../../packages/frontend/src/dev/icon-cutout/cutout"

const fixturesDir = join(
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
      if (body[8] !== 8 || body[9] !== 6)
        throw new Error("probe only decodes 8-bit RGBA")
    }
    if (type === "IDAT") idat.push(body)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    if (filter !== 0) throw new Error(`unexpected PNG filter ${filter}`)
    raw.copy(
      data as unknown as Uint8Array,
      y * stride,
      y * (stride + 1) + 1,
      y * (stride + 1) + 1 + stride
    )
  }
  return { data, width, height }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const num = (n: number) => n.toFixed(1)

const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".png"))
  .sort()

// null = no single correct verdict; the right answer depends on tolerance and
// on what the user wants kept. Excluded from scoring.
const EXPECTED: Record<string, boolean | null> = {
  "mark-flat-white.png": true,
  "mark-offwhite-noise.png": true,
  "mark-soft-shadow.png": true,
  "projectproject-logo.png": true,
  "mark-gradient.png": false,
  // Transparent corners. Below ~90 the fill cannot cross into the squircle and
  // rejects; above it the squircle goes too and the glyph survives as a
  // sticker. Both are legitimate — which one is wanted is the user's call.
  "projectproject-app-icon.png": null,
  // Clipped by the image edge, but the cutout itself is correct — that is a
  // cropping problem, not a cutout one.
  "mark-touches-border.png": true,
  "mark-color-matched.png": false,
  "photo-busy.png": false
}

for (const mode of ["global"] as Array<MatchMode>) {
  for (const tolerance of [12, 24, 40, 60, 90, 120]) {
    console.log(`\n=== mode=${mode} tolerance=${tolerance} ===`)
    console.log(
      [
        "fixture".padEnd(28),
        "spread".padStart(7),
        "noise".padStart(6),
        "cover".padStart(7),
        "border".padStart(7),
        "edge".padStart(6),
        "verdict".padStart(9),
        "want".padStart(6)
      ].join(" ")
    )
    let agree = 0
    let scored = 0
    for (const name of fixtures) {
      const image = decodePng(readFileSync(join(fixturesDir, name)))
      const result = analyzeCutout(image, { tolerance, feather: 1, mode })
      const want = EXPECTED[name] ?? null
      const match = want === null ? null : result.clean === want
      if (match !== null) {
        scored++
        if (match) agree++
      }
      const failed = result.checks
        .filter((c) => !c.passed)
        .map((c) => c.id)
        .join(",")
      console.log(
        [
          name.padEnd(28),
          num(result.metrics.cornerSpread).padStart(7),
          num(result.metrics.cornerNoise).padStart(6),
          pct(result.metrics.coverage).padStart(7),
          pct(result.metrics.borderRetained).padStart(7),
          num(result.metrics.edgeContrast).padStart(6),
          (result.clean ? "clean" : "reject").padStart(9),
          (want === null ? "either" : want ? "clean" : "reject").padStart(6),
          match === false ? `  MISMATCH (${failed || "all passed"})` : ""
        ].join(" ")
      )
    }
    console.log(`agreement: ${agree}/${scored}`)
  }
}
