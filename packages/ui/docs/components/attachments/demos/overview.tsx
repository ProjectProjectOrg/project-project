import { AttachmentChip } from "@pp/ui/attachment-chip"
import {
  AttachmentFailed,
  AttachmentUnavailable,
  AttachmentUploading
} from "@pp/ui/attachment-status"
import { AttachmentTile } from "@pp/ui/attachment-tile"
import { AttachmentVideo } from "@pp/ui/attachment-video"
import { useEffect, useState, type ReactNode } from "react"

import bordighera from "../../sidebar/demos/assets/bordighera.webp"
import { failedLabels, renderDemoPdf, tileLabels, videoLabels } from "../labels"
import lilyPond from "./assets/lily-pond.mp4"

function Group({
  title,
  children
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="grid gap-3">
      <h3 className="text-caption text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start justify-items-start gap-2">
      {children}
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

// An upload that runs 0 → 100% over 4s, rests a moment at 100, and starts
// over, so the page filling and the percentage rolling read as one motion.
// Progress steps in 3% hops, like real upload events.
function LoopingUpload() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = ((now - start) % 4800) / 4000
      setProgress(Math.min(1, Math.floor(t * 34) / 33))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <AttachmentUploading
      label="Uploading…"
      progress={progress}
      filename="brief-v2.pdf"
    />
  )
}

// Every part, in every state: chips inline in text, tiles for files, the
// upload and missing states, and the video player. Hover the image chip
// for its preview; play the video for its controls.
export default function Overview() {
  return (
    <div className="@container grid w-full content-start gap-10">
      <Group title="Chips, inline in text">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-body">
          <Cell caption="File">
            <AttachmentChip
              url="/files/release-notes.pdf"
              alt=""
              filename="release-notes.pdf"
              kind="file"
              morphId="overview-file"
              downloadLabel="Download"
            />
          </Cell>
          <Cell caption="Image (hover)">
            <AttachmentChip
              url={bordighera}
              alt="Bordighera, by Claude Monet"
              filename="bordighera.webp"
              kind="image"
              morphId="overview-image"
              downloadLabel="Download"
            />
          </Cell>
          <Cell caption="Video">
            <AttachmentChip
              url={lilyPond}
              alt=""
              filename="lily-pond.mp4"
              kind="file"
              morphId="overview-video"
              downloadLabel="Download"
            />
          </Cell>
          <Cell caption="In a link">
            <AttachmentChip
              url="/files/spec.zip"
              alt=""
              filename="spec.zip"
              kind="file"
              morphId="overview-linked"
              downloadLabel="Download"
              variant="linked"
            />
          </Cell>
          <Cell caption="Unavailable">
            <AttachmentUnavailable
              label="This attachment couldn't be loaded."
              variant="inline"
            />
          </Cell>
        </div>
      </Group>

      <Group title="Tiles, one per format">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {[
            ["roadmap.pdf", "PDF, first pages fanned"],
            ["assets.zip", "Zip"],
            ["backup.tar", "Tar"],
            ["logs.gz", "Gzip"],
            ["recording.mov", "Video the browser can't play"],
            ["notes.key", "Any other file"]
          ].map(([filename, caption]) => (
            <Cell key={filename} caption={caption}>
              <AttachmentTile
                url={`/files/${filename}`}
                alt=""
                filename={filename}
                morphId={`overview-${filename}`}
                labels={tileLabels}
                renderPdf={renderDemoPdf}
              />
            </Cell>
          ))}
        </div>
      </Group>

      <Group title="Uploading, failed, unavailable">
        <div className="grid gap-4 @2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          <Cell caption="Uploading">
            <LoopingUpload />
          </Cell>
          <Cell caption="Failed">
            <AttachmentFailed
              uploadId="demo"
              filename="brief-v2.pdf"
              labels={failedLabels}
            />
          </Cell>
          <Cell caption="Unavailable">
            <AttachmentUnavailable label="This attachment couldn't be loaded." />
          </Cell>
        </div>
      </Group>

      <Group title="Video">
        <AttachmentVideo
          src={lilyPond}
          filename="lily-pond.mp4"
          downloadHref={lilyPond}
          labels={videoLabels}
          onUnplayable={() => {}}
        />
      </Group>
    </div>
  )
}
