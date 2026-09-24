import {
  BLOCK_ICONS,
  type BlockIconName,
  type LibraryColor,
  type LibraryOrigin
} from "@pp/shared"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { ColorPicker } from "@/components/ColorPicker"
import { MetaRow } from "@/components/TicketPage/MetaRow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"

export function AsideField({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return <MetaRow label={label}>{children}</MetaRow>
}

type CommitInputProps = Readonly<{
  value: string
  onCommit: (value: string) => void
  ariaLabel: string
  placeholder?: string
  maxLength?: number
  required?: boolean
  disabled?: boolean
  className?: string
}>

export function CommitInput({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  maxLength,
  required = false,
  disabled = false,
  className
}: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (required && next === "") return
    if (next !== value) onCommit(next)
  }
  return (
    <Input
      variant="inline"
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className={cn("-mx-2", className)}
    />
  )
}

export function BlockIconPicker({
  value,
  color,
  onChange,
  disabled = false
}: Readonly<{
  value: BlockIconName
  color: LibraryColor
  onChange: (icon: BlockIconName) => void
  disabled?: boolean
}>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current
      if (root !== null && !root.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        aria-label={m.templates_editor_icon_aria()}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-md border border-input bg-background transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <BlockIconGlyph icon={value} color={color} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={springs.moderate}
            className="absolute top-10 left-0 z-50 w-[228px] rounded-md border border-border bg-popover p-2 shadow-md"
          >
            <div className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
              {BLOCK_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={m.templates_editor_icon_option_aria({ name })}
                  aria-pressed={name === value}
                  onClick={() => {
                    onChange(name)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex size-7 items-center justify-center rounded transition-all duration-100 hover:bg-accent active:scale-[0.97]",
                    name === value && "bg-accent"
                  )}
                >
                  <BlockIconGlyph
                    icon={name}
                    color={color}
                    className="size-3.5"
                  />
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function IconAndColorField({
  icon,
  color,
  onIcon,
  onColor,
  disabled = false
}: Readonly<{
  icon: BlockIconName
  color: LibraryColor
  onIcon: (icon: BlockIconName) => void
  onColor: (color: LibraryColor) => void
  disabled?: boolean
}>) {
  return (
    <div className="flex items-center gap-2">
      <BlockIconPicker
        value={icon}
        color={color}
        onChange={onIcon}
        disabled={disabled}
      />
      {disabled ? null : (
        <>
          <ColorPicker
            value={color ?? ""}
            onChange={onColor}
            ariaLabel={m.templates_editor_color_aria()}
          />
          {color === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onColor(null)}
            >
              {m.templates_editor_color_clear()}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

const ORIGIN_LABELS: Record<LibraryOrigin, () => string> = {
  org: m.templates_settings_origin_org,
  project: m.templates_settings_origin_project
}

export const originLabel = (origin: LibraryOrigin): string =>
  ORIGIN_LABELS[origin]()

export function MutedValue({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>
}
