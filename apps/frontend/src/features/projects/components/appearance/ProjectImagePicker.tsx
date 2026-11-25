import { Button } from "@pp/ui/button"
import { Upload } from "@pp/ui/icons"
import { useRef, useState } from "react"

import { m } from "@/paraglide/messages"

export function ProjectImagePicker({
  accept,
  onPick
}: Readonly<{
  accept: string
  onPick: (file: File) => void
}>) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="dropzone"
        size="dropzone"
        data-dragging={dragging}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) onPick(file)
        }}
      >
        <Upload
          className="mb-1 size-4 text-muted-foreground"
          strokeWidth={1.75}
        />
        <span className="text-body font-semibold">
          {m.project_icon_dropzone_title()}
        </span>
        <span className="text-caption text-muted-foreground">
          {m.project_icon_dropzone_hint()}
        </span>
      </Button>
      <input
        ref={input}
        hidden
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onPick(file)
        }}
      />
    </>
  )
}
