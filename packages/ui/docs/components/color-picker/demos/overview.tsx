import { STRONG_RING } from "@pp/shared"
import { ColorPicker } from "@pp/ui/color-picker"
import { useState, type ReactNode } from "react"

const label = (hex: string) => `Colour ${hex}`

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 justify-items-center gap-2">
      <div className="grid h-8 place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

// The grid open, with Clear and Multicolour (up to 3 colours), then the
// trigger in each state.
// Hover the grid: the dot nearest the pointer grows. Arrow keys move
// across it; Enter picks.
export default function Overview() {
  const [color, setColor] = useState<string | null>(STRONG_RING[8].hex)
  const [multi, setMulti] = useState(false)
  const [picks, setPicks] = useState<ReadonlyArray<string>>([])
  return (
    <div className="@container grid w-full gap-10">
      <div className="grid h-72 place-items-center">
        <ColorPicker
          defaultOpen
          closeOnSelect={false}
          value={color}
          onChange={(hex) => {
            setColor(hex)
            setMulti(false)
          }}
          ariaLabel="Project colour"
          swatchLabel={label}
          clear={{
            label: "No colour",
            onClear: () => {
              setColor(null)
              setMulti(false)
            }
          }}
          limit={3}
          multi={{
            label: "Multicolour",
            on: multi,
            colors: picks,
            onToggle: setMulti,
            onColorsChange: setPicks
          }}
        />
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-y-6 @md:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Cell caption="A colour">
          <ColorPicker
            value={STRONG_RING[2].hex}
            onChange={() => {}}
            ariaLabel="A colour"
            swatchLabel={label}
          />
        </Cell>
        <Cell caption="Multicolour">
          <ColorPicker
            value={STRONG_RING[2].hex}
            onChange={() => {}}
            ariaLabel="Multicolour"
            swatchLabel={label}
            limit={3}
            multi={{
              label: "Multicolour",
              on: true,
              colors: [STRONG_RING[0].hex, STRONG_RING[4].hex],
              onToggle: () => {},
              onColorsChange: () => {}
            }}
          />
        </Cell>
        <Cell caption="No colour">
          <ColorPicker
            value={null}
            onChange={() => {}}
            ariaLabel="No colour"
            swatchLabel={label}
            clear={{ label: "No colour", onClear: () => {} }}
          />
        </Cell>
        <Cell caption="Focus">
          <ColorPicker
            value={STRONG_RING[5].hex}
            onChange={() => {}}
            ariaLabel="Focused"
            swatchLabel={label}
            data-force="focus"
          />
        </Cell>
      </div>
    </div>
  )
}
