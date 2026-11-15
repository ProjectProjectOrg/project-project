import { Badge } from "@pp/ui/badge"
import { FileText, Image } from "@pp/ui/icons"

const CHIP = "mx-0.5 max-w-full gap-1.5 align-middle"

// A ticket description: a mention, a ticket reference and two attachments,
// all inline in the text. Mentions and tickets are soft xs badges that link
// somewhere; files are outline chips, which open a preview.
export default function InProse() {
  return (
    <p className="max-w-md text-body leading-7">
      Ask{" "}
      <Badge
        tone="blue"
        size="xs"
        className="align-middle"
        render={<a href="#noor" aria-label="Mention of Noor" />}
      >
        @Noor
      </Badge>{" "}
      to check{" "}
      <Badge
        size="xs"
        className="align-baseline font-mono"
        render={<a href="#pp-214" aria-label="Ticket PP-214" />}
      >
        PP-214
      </Badge>{" "}
      before the release. The final copy is in
      <Badge
        variant="outline"
        className={CHIP}
        render={<button type="button" aria-label="Preview release-notes.pdf" />}
      >
        <FileText strokeWidth={1.75} />
        <span className="truncate">release-notes.pdf</span>
      </Badge>
      and the new header is
      <Badge
        variant="outline"
        className={CHIP}
        render={<button type="button" aria-label="Preview header@2x.png" />}
      >
        <Image strokeWidth={1.75} />
        <span className="truncate">header@2x.png</span>
      </Badge>
      .
    </p>
  )
}
