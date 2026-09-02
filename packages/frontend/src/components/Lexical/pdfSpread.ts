import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import {
  PDF_SPREAD_PAGES,
  pdfSpreadScale
} from "@/components/Lexical/pdfSpreadLayout"

export const renderPdfSpread = async (
  url: string
): Promise<ReadonlyArray<string>> => {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ url, withCredentials: true })
  const doc = await task.promise
  try {
    const count = Math.min(doc.numPages, PDF_SPREAD_PAGES)
    const out: Array<string> = []
    for (let number = 1; number <= count; number += 1) {
      const page = await doc.getPage(number)
      const unscaled = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: pdfSpreadScale(unscaled) })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (context === null) return out
      await page.render({ canvas, viewport }).promise
      out.push(canvas.toDataURL("image/png"))
      page.cleanup()
    }
    return out
  } finally {
    await task.destroy()
  }
}
