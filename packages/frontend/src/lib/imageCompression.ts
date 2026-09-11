export interface CompressImageOptions {
  readonly maxEdge: number
  readonly hasAlpha: boolean
  readonly quality?: number
}

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

export const compressImage = async (
  file: File,
  options: CompressImageOptions
): Promise<File> => {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = scaledSize(
      bitmap.width,
      bitmap.height,
      options.maxEdge
    )
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const type = options.hasAlpha ? "image/png" : "image/webp"
    const quality = options.hasAlpha ? undefined : (options.quality ?? 0.82)
    const blob = await encodeCanvas(canvas, type, quality)
    if (!blob) return file
    if (blob.size >= file.size) return file

    return new File([blob], fileNameFor(file.name, type), { type })
  } finally {
    bitmap.close()
  }
}
