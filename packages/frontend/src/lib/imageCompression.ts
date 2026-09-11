import {
  BANNER_PLACEHOLDER_BUDGET,
  BANNER_PLACEHOLDER_MAX_LENGTH
} from "@projectproject/shared"

export interface CompressImageOptions {
  readonly maxEdge: number
  readonly hasAlpha: boolean
  readonly quality?: number
}

export interface CompressedBanner {
  readonly file: File
  readonly placeholder: string | null
}

export const BANNER_PLACEHOLDER_EDGE = 24

export const BANNER_PLACEHOLDER_QUALITY_LADDER = [0.5, 0.35, 0.2, 0.1]

const scaledSize = (
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } => {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

const encodeCanvas = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality))

const fileNameFor = (original: string, type: string): string => {
  const base = original.replace(/\.[^./\\]+$/, "")
  const ext =
    type === "image/webp" ? "webp" : type === "image/png" ? "png" : "bin"
  return `${base || "image"}.${ext}`
}

const drawScaled = (
  bitmap: ImageBitmap,
  maxEdge: number
): HTMLCanvasElement | null => {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

const encodeSmaller = async (
  canvas: HTMLCanvasElement,
  file: File,
  options: CompressImageOptions
): Promise<File> => {
  const type = options.hasAlpha ? "image/png" : "image/webp"
  const quality = options.hasAlpha ? undefined : (options.quality ?? 0.82)
  const blob = await encodeCanvas(canvas, type, quality)
  if (!blob) return file
  if (blob.size >= file.size) return file
  return new File([blob], fileNameFor(file.name, type), { type })
}

const readDataUrl = (blob: Blob): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })

const encodePlaceholder = async (
  bitmap: ImageBitmap
): Promise<string | null> => {
  const canvas = drawScaled(bitmap, BANNER_PLACEHOLDER_EDGE)
  if (!canvas) return null
  let smallest: string | null = null
  for (const quality of BANNER_PLACEHOLDER_QUALITY_LADDER) {
    const blob = await encodeCanvas(canvas, "image/webp", quality)
    if (!blob) return null
    const url = await readDataUrl(blob)
    if (url === null || !url.startsWith("data:image/webp;base64,")) return null
    smallest = url
    if (url.length <= BANNER_PLACEHOLDER_BUDGET) return url
  }
  return smallest !== null && smallest.length <= BANNER_PLACEHOLDER_MAX_LENGTH
    ? smallest
    : null
}

export const compressImage = async (
  file: File,
  options: CompressImageOptions
): Promise<File> => {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = drawScaled(bitmap, options.maxEdge)
    if (!canvas) return file
    return await encodeSmaller(canvas, file, options)
  } finally {
    bitmap.close()
  }
}

export const compressBanner = async (
  file: File,
  options: CompressImageOptions
): Promise<CompressedBanner> => {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = drawScaled(bitmap, options.maxEdge)
    if (!canvas) return { file, placeholder: null }
    const compressed = await encodeSmaller(canvas, file, options)
    const placeholder = await encodePlaceholder(bitmap).catch(() => null)
    return { file: compressed, placeholder }
  } finally {
    bitmap.close()
  }
}
