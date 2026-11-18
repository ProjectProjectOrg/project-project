import { AttachmentChip } from "@pp/ui/attachment-chip"
import { AttachmentTile } from "@pp/ui/attachment-tile"
import { AttachmentVideo } from "@pp/ui/attachment-video"

import bordighera from "../../sidebar/demos/assets/bordighera.webp"
import { renderDemoPdf, tileLabels, videoLabels } from "../labels"
import lilyPond from "./assets/lily-pond.mp4"

// A ticket description as the editor renders it: compact attachments sit in
// the text as chips; rich ones take their own line (a PDF's tile, a video).
export default function InADescription() {
  return (
    <article className="grid max-w-2xl content-start gap-4 text-body">
      <p>
        The hero now uses the reference from{" "}
        <AttachmentChip
          url={bordighera}
          alt="Bordighera, by Claude Monet"
          filename="bordighera.webp"
          kind="image"
          morphId="desc-image"
          downloadLabel="Download"
        />{" "}
        and the copy in{" "}
        <AttachmentChip
          url="/files/hero-copy.pdf"
          alt=""
          filename="hero-copy.pdf"
          kind="file"
          morphId="desc-copy"
          downloadLabel="Download"
        />
        . The full brief, with the motion study:
      </p>
      <AttachmentTile
        url="/files/hero-brief.pdf"
        alt="Hero brief"
        filename="hero-brief.pdf"
        morphId="desc-brief"
        labels={tileLabels}
        renderPdf={renderDemoPdf}
      />
      <AttachmentVideo
        src={lilyPond}
        filename="motion-study.mp4"
        downloadHref={lilyPond}
        labels={videoLabels}
        onUnplayable={() => {}}
      />
    </article>
  )
}
