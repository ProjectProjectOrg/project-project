export type RgbaImage = {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export const CUTOUT_FEATHER = 1
export const CUTOUT_DEFAULT_TOLERANCE = 24
export const CUTOUT_MAX_TOLERANCE = 160
export const CUTOUT_PREVIEW_EDGE = 256

export type CutoutParams = {
  readonly tolerance: number
  readonly feather?: number
}

export type CutoutCheck = {
  readonly id: string
  readonly passed: boolean
}

export type CutoutResult = {
  readonly alpha: Uint8ClampedArray
  readonly checks: ReadonlyArray<CutoutCheck>
  readonly clean: boolean
}

const CORNER_PATCH = 16
const CORNER_AGREEMENT = 24
const CORNER_CONSENSUS = 3
const EDGE_CONTRAST_RATIO = 1.5

const distance = (
  data: Uint8ClampedArray,
  i: number,
  r: number,
  g: number,
  b: number
) => Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b)

const meanDistance = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const median = (values: ReadonlyArray<number>) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const cornerPatches = (image: RgbaImage) => {
  const { data, width, height } = image
  const origins = [
    [0, 0],
    [Math.max(0, width - CORNER_PATCH), 0],
    [0, Math.max(0, height - CORNER_PATCH)],
    [Math.max(0, width - CORNER_PATCH), Math.max(0, height - CORNER_PATCH)]
  ]
  return origins.map(([ox, oy]) => {
    const sums = [0, 0, 0]
    const squares = [0, 0, 0]
    let n = 0
    for (let y = oy; y < Math.min(height, oy + CORNER_PATCH); y++)
      for (let x = ox; x < Math.min(width, ox + CORNER_PATCH); x++) {
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

export const CUTOUT_MIN_EDGE = CORNER_PATCH * 2

export const analyzeCutout = (
  image: RgbaImage,
  params: CutoutParams
): CutoutResult => {
  const { data, width, height } = image

  if (width < CUTOUT_MIN_EDGE || height < CUTOUT_MIN_EDGE) {
    return {
      alpha: new Uint8ClampedArray(width * height).fill(255),
      checks: [{ id: "minSize", passed: false }],
      clean: false
    }
  }

  const patches = cornerPatches(image)

  const seed = [0, 1, 2].map((c) =>
    median(patches.map((p) => p.mean[c]))
  ) as unknown as readonly [number, number, number]
  const agreeing = patches.filter(
    (p) => meanDistance(p.mean, seed) <= CORNER_AGREEMENT
  )
  const consensus = agreeing.length > 0 ? agreeing : patches

  let cornerSpread = 0
  for (let a = 0; a < consensus.length; a++)
    for (let b = a + 1; b < consensus.length; b++)
      cornerSpread = Math.max(
        cornerSpread,
        meanDistance(consensus[a].mean, consensus[b].mean)
      )
  const cornerNoise = Math.max(...consensus.map((p) => p.noise))
  const background = [0, 1, 2].map(
    (c) => consensus.reduce((sum, p) => sum + p.mean[c], 0) / consensus.length
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
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1
    ]
    for (const n of neighbours) {
      if (n < 0 || removed[n]) continue
      if (distance(data, n * 4, bgR, bgG, bgB) <= params.tolerance) push(n)
    }
  }

  let removedCount = 0
  for (let i = 0; i < pixels; i++) removedCount += removed[i]

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

  const checks: ReadonlyArray<CutoutCheck> = [
    {
      id: "cornerSpread",
      passed: consensus.length >= CORNER_CONSENSUS && cornerSpread <= 24
    },
    {
      id: "cornerNoise",
      passed: cornerNoise <= 14
    },
    {
      id: "minCoverage",
      passed: removedCount / pixels >= 0.08
    },
    {
      id: "maxCoverage",
      passed: removedCount / pixels <= 0.94
    },
    {
      id: "edgeContrast",
      passed: edgeContrast >= params.tolerance * EDGE_CONTRAST_RATIO
    }
  ]

  return {
    alpha: feathered,
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

export const hasAlpha = (image: RgbaImage): boolean => {
  const { data } = image
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}
