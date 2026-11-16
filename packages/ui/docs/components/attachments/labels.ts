import type { AttachmentTileLabels } from "@pp/ui/attachment-tile"
import type { AttachmentVideoLabels } from "@pp/ui/attachment-video"

// The app's copy, for the demos.
export const tileLabels: AttachmentTileLabels = {
  download: "Download",
  formats: {
    pdf: "PDF",
    generic: "File",
    zip: "Zip",
    tar: "Tar",
    video: "Video",
    gzip: "Gzip"
  }
}

export const videoLabels: AttachmentVideoLabels = {
  play: "Play",
  pause: "Pause",
  seek: "Seek",
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  download: "Download",
  speed: (rate) => `Playback speed: ${rate}×`
}

export const failedLabels = {
  failed: "Upload failed",
  retry: "Retry",
  remove: "Remove"
}

// Stand-in pages for the PDF spread: what the app's pdf.js renderer
// returns (page images), drawn here as simple documents.
const page = (title: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297"><rect width="210" height="297" fill="#fff"/><rect x="20" y="24" width="${90 + title * 10}" height="10" rx="2" fill="#1f1f1f"/>${Array.from({ length: 14 }, (_, line) => `<rect x="20" y="${52 + line * 14}" width="${line % 4 === 3 ? 110 : 170}" height="5" rx="2" fill="#c9c9c9"/>`).join("")}<rect x="20" y="258" width="80" height="18" rx="3" fill="#e7e7e7"/></svg>`
  )}`

export const renderDemoPdf = (_url: string) =>
  Promise.resolve([page(3), page(2), page(1)])
