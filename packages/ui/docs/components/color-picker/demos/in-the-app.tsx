import { STRONG_RING } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ColorPicker } from "@pp/ui/color-picker"
import { Input } from "@pp/ui/input"
import { ProjectIcon } from "@pp/ui/project-icon"
import { useState, type ReactNode } from "react"

const label = (hex: string) => `Colour ${hex}`

function Row({
  thumb,
  title,
  detail,
  action
}: Readonly<{
  thumb: ReactNode
  title: string
  detail: string
  action: ReactNode
}>) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border surface-card p-3">
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold">{title}</span>
        <span className="truncate text-body text-muted-foreground">
          {detail}
        </span>
      </span>
      {action}
    </div>
  )
}

// The three places the app picks a colour: a project's accent (with the
// multicolour tile), a tag's colour next to its name, and a template's
// optional colour (with Clear).
export default function InTheApp() {
  const [accent, setAccent] = useState<string>(STRONG_RING[8].hex)
  const [multi, setMulti] = useState(false)
  const [picks, setPicks] = useState<ReadonlyArray<string>>([])
  const [tag, setTag] = useState<string>(STRONG_RING[4].hex)
  const [template, setTemplate] = useState<string | null>(null)

  return (
    <div className="grid w-full max-w-md gap-6">
      <Row
        thumb={
          <ProjectIcon
            seed="atlas-mobile-app"
            color={accent}
            tone={multi ? "multi" : "mono"}
            colors={picks}
            icon="🧭"
            size={40}
          />
        }
        title="Accent"
        detail={multi ? "Multicolour" : accent.toUpperCase()}
        action={
          <ColorPicker
            value={accent}
            onChange={(hex) => {
              setAccent(hex)
              setMulti(false)
            }}
            ariaLabel="Project colour"
            swatchLabel={label}
            limit={3}
            multi={{
              label: "Multicolour",
              on: multi,
              colors: picks,
              onToggle: setMulti,
              onColorsChange: setPicks
            }}
          />
        }
      />

      <div className="flex items-center gap-1.5 rounded-lg border border-border surface-card p-2">
        <ColorPicker
          value={tag}
          onChange={setTag}
          ariaLabel="Colour of bug"
          swatchLabel={label}
        />
        <Input size="sm" defaultValue="bug" aria-label="Tag name" />
        <Button variant="ghost" size="sm">
          Done
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border surface-card p-2">
        <span className="text-body text-muted-foreground">Template colour</span>
        <span className="ml-auto" />
        <ColorPicker
          value={template}
          onChange={setTemplate}
          ariaLabel="Template colour"
          swatchLabel={label}
          clear={{ label: "No colour", onClear: () => setTemplate(null) }}
        />
      </div>
    </div>
  )
}
