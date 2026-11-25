import {
  PDF_SPREAD_PAGES,
  pdfSpreadScale
} from "@pp/ui/editor/attachments/pdf-spread-layout"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

export const renderPdfSpread = async (url: string) => {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ url, withCredentials: true })
  const doc = await task.promise
  try {
    const count = Math.min(doc.numPages, PDF_SPREAD_PAGES)
    const pages = await Promise.allSettled(
      Array.from({ length: count }, async (_, index) => {
        const page = await doc.getPage(index + 1)
        try {
          const unscaled = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: pdfSpreadScale(unscaled) })
          const canvas = document.createElement("canvas")
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          if (canvas.getContext("2d") === null) return null
          await page.render({ canvas, viewport }).promise
          return canvas.toDataURL("image/png")
        } finally {
          page.cleanup()
        }
      })
    )
    const out: Array<string> = []
    for (const page of pages) {
      if (page.status === "rejected") throw page.reason
      if (page.value === null) break
      out.push(page.value)
    }
    return out
  } finally {
    await task.destroy()
  }
}
