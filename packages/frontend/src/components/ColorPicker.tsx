import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import {
  INNER_RING,
  OUTER_RING,
  type ColorSwatch
} from "@projectproject/shared"
import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  value: string
  onChange: (hex: string) => void
  className?: string
  ariaLabel?: string
}

const SWATCH = 24
const CENTER = 24
const INNER_RADIUS = 28
const OUTER_RADIUS = 42
const EXIT_RATIO = 0.55
const SVG = (OUTER_RADIUS + SWATCH / 2 + 2) * 2

export function ColorPicker({ value, onChange, className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const select = (hex: string) => {
    onChange(hex)
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex items-center justify-center",
        className
      )}
      style={{ width: CENTER, height: CENTER }}
    >
      <button
        type="button"
        aria-label={ariaLabel ?? m.color_picker_aria_label()}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative z-10 grid place-items-center rounded-full border border-border/60 shadow-sm transition-transform duration-100 hover:scale-[1.06] active:scale-[0.94]"
        style={{ width: CENTER, height: CENTER, backgroundColor: value }}
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            key="ring"
            className="pointer-events-none absolute"
            style={{
              width: SVG,
              height: SVG,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)"
            }}
          >
            <Ring
              ring={INNER_RING}
              radius={INNER_RADIUS}
              value={value}
              onSelect={select}
              delay={0}
            />
            <Ring
              ring={OUTER_RING}
              radius={OUTER_RADIUS}
              value={value}
              onSelect={select}
              delay={0.05}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function Ring({
  ring,
  radius,
  value,
  onSelect,
  delay
}: {
  ring: ReadonlyArray<ColorSwatch>
  radius: number
  value: string
  onSelect: (hex: string) => void
  delay: number
}) {
  return (
    <>
      {ring.map((c, i) => {
        const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const isActive = c.hex.toLowerCase() === value.toLowerCase()
        return (
          <motion.button
            type="button"
            key={`${radius}-${c.hue}`}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{ x, y, scale: 1, opacity: 1 }}
            exit={{
              x: x * EXIT_RATIO,
              y: y * EXIT_RATIO,
              scale: 0.3,
              opacity: 0
            }}
            transition={{ ...springs.slow, delay, scale: { duration: 0.15 } }}
            whileHover={{ scale: 1.18 }}
            onClick={() => onSelect(c.hex)}
            aria-label={m.color_swatch_aria_label({ hex: c.hex })}
            className={cn(
              "pointer-events-auto absolute rounded-full border",
              isActive && "border-foreground border-2"
            )}
            style={{
              width: SWATCH,
              height: SWATCH,
              left: "50%",
              top: "50%",
              marginLeft: -SWATCH / 2,
              marginTop: -SWATCH / 2,
              backgroundColor: c.oklch
            }}
          />
        )
      })}
    </>
  )
}
