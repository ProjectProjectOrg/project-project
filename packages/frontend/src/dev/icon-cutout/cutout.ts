export interface RgbaImage {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export type MatchMode = "global" | "grow"

export const CUTOUT_FEATHER = 1

export interface CutoutParams {
  readonly tolerance: number
  readonly feather?: number
  readonly mode: MatchMode
}

export interface CutoutMetrics {
  readonly cornerSpread: number
  readonly cornerNoise: number
  readonly coverage: number
  readonly borderRetained: number
  readonly edgeContrast: number
}

export interface CutoutCheck {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly limit: number
  readonly passed: boolean
}

export interface CutoutResult {
  readonly alpha: Uint8ClampedArray
  readonly background: readonly [number, number, number]
  readonly metrics: CutoutMetrics
  readonly checks: ReadonlyArray<CutoutCheck>
  readonly clean: boolean
}

export const CUTOUT_LIMITS = {
  cornerSpread: 24,
  cornerNoise: 14,
  minCoverage: 0.08,
  maxCoverage: 0.94,
  borderRetained: 0.06,
  edgeContrast: 26
}

const CORNER_PATCH = 16

const distance = (
  data: Uint8ClampedArray,
  i: number,
  r: number,
  g: number,
  b: number
) => Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b)

const cornerPatches = (image: RgbaImage) => {
  const { data, width, height } = image
  const origins = [
    [0, 0],
    [width - CORNER_PATCH, 0],
    [0, height - CORNER_PATCH],
    [width - CORNER_PATCH, height - CORNER_PATCH]
  ]
  return origins.map(([ox, oy]) => {
    const sums = [0, 0, 0]
    const squares = [0, 0, 0]
    let n = 0
    for (let y = oy; y < oy + CORNER_PATCH; y++)
      for (let x = ox; x < ox + CORNER_PATCH; x++) {
        const i = (y * width + x) * 4
        for (let c = 0; c < 3; c++) {
          sums[c] += data[i + c]
          squares[c] += data[i + c] ** 2
        }
        n++
      }
    const mean = sums.map((s) => s / n) as [number, number, number]
    const noise = Math.max(
      ...squares.map((sq, c) => Math.sqrt(Math.max(0, sq / n - mean[c] ** 2)))
    )
    return { mean, noise }
  })
}

export const analyzeCutout = (
  image: RgbaImage,
  params: CutoutParams
): CutoutResult => {
  const { data, width, height } = image
  const patches = cornerPatches(image)

  let cornerSpread = 0
  for (let a = 0; a < patches.length; a++)
    for (let b = a + 1; b < patches.length; b++)
      cornerSpread = Math.max(
        cornerSpread,
        Math.hypot(
          patches[a].mean[0] - patches[b].mean[0],
          patches[a].mean[1] - patches[b].mean[1],
          patches[a].mean[2] - patches[b].mean[2]
        )
      )
  const cornerNoise = Math.max(...patches.map((p) => p.noise))
  const background = [0, 1, 2].map(
    (c) => patches.reduce((sum, p) => sum + p.mean[c], 0) / patches.length
  ) as unknown as readonly [number, number, number]

  const pixels = width * height
  const removed = new Uint8Array(pixels)
  const queue = new Int32Array(pixels)
  let head = 0
  let tail = 0

  const push = (index: number) => {
    if (removed[index]) return
    removed[index] = 1
    queue[tail++] = index
  }

  const [bgR, bgG, bgB] = background
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const index = y * width + x
      if (distance(data, index * 4, bgR, bgG, bgB) <= params.tolerance)
        push(index)
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const index = y * width + x
      if (distance(data, index * 4, bgR, bgG, bgB) <= params.tolerance)
        push(index)
    }
  }

  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = (index / width) | 0
    const i = index * 4
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1
    ]
    for (const n of neighbours) {
      if (n < 0 || removed[n]) continue
      const ok =
        params.mode === "grow"
          ? distance(data, n * 4, data[i], data[i + 1], data[i + 2]) <=
            params.tolerance
          : distance(data, n * 4, bgR, bgG, bgB) <= params.tolerance
      if (ok) push(n)
    }
  }

  let removedCount = 0
  for (let i = 0; i < pixels; i++) removedCount += removed[i]

  let borderTotal = 0
  let borderKept = 0
  for (let x = 0; x < width; x++)
    for (const y of [0, height - 1]) {
      borderTotal++
      if (!removed[y * width + x]) borderKept++
    }
  for (let y = 1; y < height - 1; y++)
    for (const x of [0, width - 1]) {
      borderTotal++
      if (!removed[y * width + x]) borderKept++
    }

  let edgeSum = 0
  let edgeCount = 0
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      if (removed[index]) continue
      const touchesRemoved =
        removed[index - 1] ||
        removed[index + 1] ||
        removed[index - width] ||
        removed[index + width]
      if (!touchesRemoved) continue
      edgeSum += distance(data, index * 4, bgR, bgG, bgB)
      edgeCount++
    }
  const edgeContrast = edgeCount === 0 ? 0 : edgeSum / edgeCount

  const alpha = new Uint8ClampedArray(pixels)
  for (let i = 0; i < pixels; i++) alpha[i] = removed[i] ? 0 : 255
  const feathered = featherAlpha(
    alpha,
    width,
    height,
    params.feather ?? CUTOUT_FEATHER
  )

  const metrics: CutoutMetrics = {
    cornerSpread,
    cornerNoise,
    coverage: removedCount / pixels,
    borderRetained: borderKept / borderTotal,
    edgeContrast
  }

  const checks: ReadonlyArray<CutoutCheck> = [
    {
      id: "cornerSpread",
      label: "Corners agree",
      value: metrics.cornerSpread,
      limit: CUTOUT_LIMITS.cornerSpread,
      passed: metrics.cornerSpread <= CUTOUT_LIMITS.cornerSpread
    },
    {
      id: "cornerNoise",
      label: "Background is flat",
      value: metrics.cornerNoise,
      limit: CUTOUT_LIMITS.cornerNoise,
      passed: metrics.cornerNoise <= CUTOUT_LIMITS.cornerNoise
    },
    {
      id: "minCoverage",
      label: "Removed enough",
      value: metrics.coverage,
      limit: CUTOUT_LIMITS.minCoverage,
      passed: metrics.coverage >= CUTOUT_LIMITS.minCoverage
    },
    {
      id: "maxCoverage",
      label: "Kept a subject",
      value: metrics.coverage,
      limit: CUTOUT_LIMITS.maxCoverage,
      passed: metrics.coverage <= CUTOUT_LIMITS.maxCoverage
    },
    {
      id: "borderRetained",
      label: "Subject clears the edge",
      value: metrics.borderRetained,
      limit: CUTOUT_LIMITS.borderRetained,
      passed: metrics.borderRetained <= CUTOUT_LIMITS.borderRetained
    },
    {
      id: "edgeContrast",
      label: "Edge is decisive",
      value: metrics.edgeContrast,
      limit: CUTOUT_LIMITS.edgeContrast,
      passed: metrics.edgeContrast >= CUTOUT_LIMITS.edgeContrast
    }
  ]

  return {
    alpha: feathered,
    background,
    metrics,
    checks,
    clean: checks.every((check) => check.passed)
  }
}

export const featherAlpha = (
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray => {
  if (radius <= 0) return alpha
  const span = Math.round(radius)
  const horizontal = new Float32Array(alpha.length)
  const output = new Uint8ClampedArray(alpha.length)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let d = -span; d <= span; d++) {
        const sx = x + d
        if (sx < 0 || sx >= width) continue
        sum += alpha[y * width + sx]
        n++
      }
      horizontal[y * width + x] = sum / n
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let d = -span; d <= span; d++) {
        const sy = y + d
        if (sy < 0 || sy >= height) continue
        sum += horizontal[sy * width + x]
        n++
      }
      output[y * width + x] = sum / n
    }
  return output
}
