import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type CropValue = {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export type CropWindowRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const cropWindowRect = ({
  sourceWidth,
  sourceHeight,
  aspect,
  zoom,
  x,
  y
}: {
  sourceWidth: number
  sourceHeight: number
  aspect: number
  zoom: number
  x: number
  y: number
}): CropWindowRect => {
  const covered =
    sourceWidth / sourceHeight > aspect
      ? { width: sourceHeight * aspect, height: sourceHeight }
      : { width: sourceWidth, height: sourceWidth / aspect }
  const width = covered.width / zoom
  const height = covered.height / zoom

  return {
    left: (sourceWidth - width) * x,
    top: (sourceHeight - height) * y,
    width,
    height
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const NUDGES: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

export function CropWindow({
  src,
  aspect,
  shape,
  value,
  onChange,
  label,
  caption,
  disabled = false
}: {
  src: string
  aspect: number
  shape: "squircle" | "rect"
  value: CropValue
  onChange: (next: CropValue) => void
  label: string
  caption?: string
  disabled?: boolean
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number }>()
  const [frame, setFrame] = useState<{ width: number; height: number }>()
  const dragRef = useRef<
    ({ pointerX: number; pointerY: number } & CropValue) | undefined
  >(undefined)

  useEffect(() => {
    const node = frameRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setFrame({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const photo = new Image()
    photo.addEventListener("load", () => {
      if (!cancelled)
        setNatural({ width: photo.naturalWidth, height: photo.naturalHeight })
    })
    photo.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  const rect =
    natural && frame
      ? cropWindowRect({
          sourceWidth: frame.width,
          sourceHeight: frame.height,
          aspect,
          zoom: value.zoom,
          x: value.x,
          y: value.y
        })
      : null

  const move = (deltaX: number, deltaY: number, from: CropValue) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box || !natural) return
    const window_ = cropWindowRect({
      sourceWidth: box.width,
      sourceHeight: box.height,
      aspect,
      zoom: from.zoom,
      x: from.x,
      y: from.y
    })
    const slackX = box.width - window_.width
    const slackY = box.height - window_.height
    onChange({
      ...from,
      x: slackX > 0 ? clamp(from.x + deltaX / slackX) : from.x,
      y: slackY > 0 ? clamp(from.y + deltaY / slackY) : from.y
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={frameRef}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          const direction = NUDGES[event.key]
          if (!direction || disabled) return
          event.preventDefault()
          const step = event.shiftKey ? 0.1 : 0.01
          onChange({
            ...value,
            x: clamp(value.x + direction[0] * step),
            y: clamp(value.y + direction[1] * step)
          })
        }}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            ...value,
            pointerX: event.clientX,
            pointerY: event.clientY
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          move(event.clientX - drag.pointerX, event.clientY - drag.pointerY, {
            x: drag.x,
            y: drag.y,
            zoom: drag.zoom
          })
        }}
        onPointerUp={() => {
          dragRef.current = undefined
        }}
        onPointerCancel={() => {
          dragRef.current = undefined
        }}
        onLostPointerCapture={() => {
          dragRef.current = undefined
        }}
        className={cn(
          "relative w-full touch-none overflow-hidden rounded-xl bg-muted outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-focus-ring",
          !disabled && "cursor-grab active:cursor-grabbing"
        )}
        style={{ aspectRatio: natural ? natural.width / natural.height : 2 }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain opacity-40 grayscale dark:opacity-55"
        />
        {rect ? (
          <>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute overflow-hidden ring-1 ring-white/70 dark:ring-white/80",
                shape === "squircle"
                  ? "rounded-2xl corner-squircle"
                  : "rounded-md"
              )}
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
              }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute size-full max-w-none object-contain"
                style={{
                  left: -rect.left,
                  top: -rect.top,
                  width: frame?.width,
                  height: frame?.height
                }}
              />
            </div>
          </>
        ) : null}
      </div>
      {caption ? (
        <span className="text-xs text-muted-foreground">{caption}</span>
      ) : null}
    </div>
  )
}
