import type { AttachmentTileLabels } from "@pp/ui/attachment-tile"
import type { AttachmentVideoLabels } from "@pp/ui/attachment-video"

import { m } from "@/paraglide/messages"

// The app's strings for @pp/ui's attachment parts.

export const attachmentTileLabels = (): AttachmentTileLabels => ({
  download: m.editor_attachment_download(),
  formats: {
    pdf: m.editor_attachment_format_pdf(),
    generic: m.editor_attachment_format_generic(),
    zip: m.editor_attachment_format_zip(),
    tar: m.editor_attachment_format_tar(),
    video: m.editor_attachment_format_video(),
    gzip: m.editor_attachment_format_gzip()
  }
})

export const attachmentVideoLabels = (): AttachmentVideoLabels => ({
  play: m.editor_video_play(),
  pause: m.editor_video_pause(),
  seek: m.editor_video_seek(),
  mute: m.editor_video_mute(),
  unmute: m.editor_video_unmute(),
  volume: m.editor_video_volume(),
  fullscreen: m.editor_video_fullscreen(),
  exitFullscreen: m.editor_video_exit_fullscreen(),
  download: m.editor_attachment_download(),
  speed: (rate) => m.editor_video_speed({ rate })
})

export const attachmentFailedLabels = () => ({
  failed: m.editor_attachment_upload_failed(),
  retry: m.editor_attachment_retry(),
  remove: m.editor_attachment_remove()
})
