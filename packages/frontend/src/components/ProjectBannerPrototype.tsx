import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Upload,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"
import {
  ProjectBannerPrototypeShader,
  type BannerPrototypeSettings
} from "./ProjectBannerPrototypeShader"
import sampleUrl from "./project-banner-prototype-sample.jpg"
import forestUrl from "./project-banner-prototype-forest.jpg"
import dunesUrl from "./project-banner-prototype-dunes.jpg"
import oceanUrl from "./project-banner-prototype-ocean.jpg"
import canyonUrl from "./project-banner-prototype-canyon.jpg"
import coastUrl from "./project-banner-prototype-coast.jpg"

const templates = [
  {
    src: sampleUrl,
    label: () => m.project_banner_template_mountains(),
    photographer: "Mattia Poli",
    provider: "Unsplash",
    url: "https://unsplash.com/photos/a-mountain-lake-surrounded-by-snow-covered-mountains-XPVVtqCQWzY",
    x: 0,
    y: 0.24
  },
  {
    src: forestUrl,
    label: () => m.project_banner_template_forest(),
    photographer: "Laura Chouette",
    provider: "Pexels",
    url: "https://www.pexels.com/photo/misty-forest-landscape-with-evergreen-trees-29508251/",
    x: 0.5,
    y: 0.6
  },
  {
    src: oceanUrl,
    label: () => m.project_banner_template_ocean(),
    photographer: "ysnapshotjournal",
    provider: "Pexels",
    url: "https://www.pexels.com/photo/dynamic-ocean-waves-captured-from-above-35295868/",
    x: 0.5,
    y: 0.5
  },
  {
    src: dunesUrl,
    label: () => m.project_banner_template_dunes(),
    photographer: "Jacob Moore",
    provider: "Pexels",
    url: "https://www.pexels.com/photo/sand-dunes-landscape-15852511/",
    x: 0.5,
    y: 0.5
  },
  {
    src: canyonUrl,
    label: () => m.project_banner_template_canyon(),
    photographer: "Ekaterina Belinskaya",
    provider: "Pexels",
    url: "https://www.pexels.com/photo/beautiful-orange-rock-formation-4671689/",
    x: 0.5,
    y: 0.5
  },
  {
    src: coastUrl,
    label: () => m.project_banner_template_coast(),
    photographer: "Pok Rie",
    provider: "Pexels",
    url: "https://www.pexels.com/photo/aerial-view-of-waves-and-rocky-coastline-31743481/",
    x: 0.5,
    y: 0.65
  }
]

const initialSettings: BannerPrototypeSettings = {
  pixelSize: 2,
  strength: 0.85,
  color: 0.5,
  fade: 0.8,
  opacity: 1,
  overallOpacity: 0.2,
  height: 160,
  noise: 0.3,
  noiseScale: 5.5,
  zoom: 1,
  x: 0,
  y: 0.24
}

export default function ProjectBannerPrototype({
  mode,
  embedded = false
}: {
  embedded?: boolean
  mode: "image" | "mask"
}) {
  const navigate = useNavigate()
  const [source, setSource] = useState(sampleUrl)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  const [settings, setSettings] = useState(initialSettings)
  const [expanded, setExpanded] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [saved, setSaved] = useState({
    source: sampleUrl,
    settings: initialSettings,
    removed: false
  })
  const objectUrls = useRef<string[]>([])
  const cancel = () => {
    setSource(saved.source)
    setSettings(saved.settings)
    setRemoved(saved.removed)
    setError(false)
    setExpanded(false)
  }
  const selectedTemplate = templates.find((template) => template.src === source)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{
    x: number
    y: number
    cropX: number
    cropY: number
  } | null>(null)
  const change = (key: keyof BannerPrototypeSettings, value: number) =>
    setSettings((current) => ({ ...current, [key]: value }))
  const switchMode = () => {
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        bannerPrototype: mode === "image" ? "mask" : "image"
      })
    })
  }

  useEffect(() => {
    let cancelled = false
    const photo = new Image()
    photo.addEventListener("load", () => {
      if (!cancelled) setImage(photo)
    })
    photo.addEventListener("error", () => {
      if (!cancelled) setError(true)
    })
    photo.src = source
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  useEffect(() => {
    if (embedded) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, button, [contenteditable], [role=slider]"
        )
      )
        return
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      void navigate({
        to: ".",
        replace: true,
        resetScroll: false,
        search: (previous) => ({
          ...previous,
          bannerPrototype: mode === "image" ? "mask" : "image"
        })
      })
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [mode, navigate, embedded])

  const sliders: {
    key: keyof BannerPrototypeSettings
    label: string
    min: number
    max: number
    step: number
  }[] = [
    {
      key: "pixelSize",
      label: m.project_banner_prototype_pixel_size(),
      min: 1,
      max: 6,
      step: 0.5
    },
    {
      key: "strength",
      label: m.project_banner_prototype_strength(),
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "color",
      label: m.project_banner_prototype_color(),
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "fade",
      label: m.project_banner_prototype_fade(),
      min: 0.2,
      max: 1,
      step: 0.05
    },
    {
      key: "opacity",
      label: m.project_banner_prototype_opacity(),
      min: 0.1,
      max: 1,
      step: 0.05
    },
    {
      key: "overallOpacity",
      label: m.project_banner_prototype_overall_opacity(),
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "height",
      label: m.project_banner_prototype_height(),
      min: 96,
      max: 240,
      step: 8
    },
    {
      key: "noise",
      label: m.project_banner_prototype_noise(),
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "noiseScale",
      label: m.project_banner_prototype_noise_scale(),
      min: 1,
      max: 20,
      step: 0.5
    },
    {
      key: "zoom",
      label: m.project_banner_prototype_zoom(),
      min: 1,
      max: 4,
      step: 0.05
    },
    {
      key: "x",
      label: m.project_banner_prototype_x(),
      min: 0,
      max: 1,
      step: 0.01
    },
    {
      key: "y",
      label: m.project_banner_prototype_y(),
      min: 0,
      max: 1,
      step: 0.01
    }
  ]

  return (
    <>
      <div
        className="pointer-events-none absolute -inset-x-6 -top-6 -z-10 overflow-hidden"
        style={{
          height: settings.height,
          opacity: settings.overallOpacity ?? initialSettings.overallOpacity
        }}
      >
        {image && !removed && (
          <ProjectBannerPrototypeShader
            image={image}
            settings={settings}
            mode={mode}
            label={m.project_banner_prototype_preview()}
          />
        )}
      </div>
      {embedded && !expanded && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {m.project_banner_settings_label()}
          </span>
          <div className="w-48">
            <Button
              variant="image-option"
              size="image-option"
              aria-label={m.project_banner_settings_preview()}
              onClick={() => setExpanded(true)}
            >
              {removed ? (
                <span className="text-xs">
                  {m.project_banner_settings_add()}
                </span>
              ) : (
                <img
                  src={source}
                  alt=""
                  className="size-full object-cover"
                  style={{
                    objectPosition: `${settings.x * 100}% ${settings.y * 100}%`
                  }}
                />
              )}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setExpanded(true)}
          >
            {removed
              ? m.project_banner_settings_add()
              : m.project_banner_settings_change()}
          </Button>
        </div>
      )}
      <section
        hidden={embedded && !expanded}
        aria-label={m.project_banner_prototype_title()}
        className={
          embedded
            ? "col-span-full w-full max-w-2xl rounded-xl border border-border bg-popover p-4 text-popover-foreground"
            : "fixed bottom-4 left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-md"
        }
      >
        {expanded && (
          <div className="mb-3 flex max-h-[min(65vh,600px)] flex-col gap-4 overflow-auto border-b border-border pb-4 [&>*]:shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {embedded
                    ? m.project_banner_settings_label()
                    : m.project_banner_prototype_title()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.project_banner_prototype_local_notice()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.project_banner_prototype_close_controls()}
                onClick={() => (embedded ? cancel() : setExpanded(false))}
              >
                <X />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">
                {m.project_banner_templates_heading()}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {templates.map((template) => (
                  <div
                    key={template.src}
                    className="flex min-w-0 flex-col gap-1.5"
                  >
                    <Button
                      variant="image-option"
                      size="image-option"
                      aria-label={template.label()}
                      aria-pressed={source === template.src}
                      onClick={() => {
                        setError(false)
                        setRemoved(false)
                        setSource(template.src)
                        setSettings((current) => ({
                          ...current,
                          zoom: 1,
                          x: template.x,
                          y: template.y
                        }))
                      }}
                    >
                      <img
                        src={template.src}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${template.x * 100}% ${template.y * 100}%`
                        }}
                      />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {template.label()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {image && !removed && (
              <div
                role="group"
                aria-label={m.project_banner_prototype_crop()}
                className="aspect-[3/1] w-full touch-none cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                    cropX: settings.x,
                    cropY: settings.y
                  }
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current
                  if (!drag) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const scale =
                    Math.max(
                      rect.width / image.naturalWidth,
                      rect.height / image.naturalHeight
                    ) * settings.zoom
                  const overflowX = image.naturalWidth * scale - rect.width
                  const overflowY = image.naturalHeight * scale - rect.height
                  setSettings((current) => ({
                    ...current,
                    x:
                      overflowX > 0
                        ? Math.max(
                            0,
                            Math.min(
                              1,
                              drag.cropX - (event.clientX - drag.x) / overflowX
                            )
                          )
                        : current.x,
                    y:
                      overflowY > 0
                        ? Math.max(
                            0,
                            Math.min(
                              1,
                              drag.cropY - (event.clientY - drag.y) / overflowY
                            )
                          )
                        : current.y
                  }))
                }}
                onPointerUp={() => {
                  dragRef.current = null
                }}
                onPointerCancel={() => {
                  dragRef.current = null
                }}
                onLostPointerCapture={() => {
                  dragRef.current = null
                }}
              >
                <ProjectBannerPrototypeShader
                  image={image}
                  settings={settings}
                  mode="original"
                  label={m.project_banner_prototype_crop()}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {embedded
                ? m.project_banner_settings_crop_hint()
                : m.project_banner_prototype_crop_hint()}
            </p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
              {sliders
                .filter(({ key }) =>
                  embedded
                    ? ["zoom", "x", "y"].includes(key)
                    : mode === "mask" ||
                      (key !== "noise" && key !== "noiseScale")
                )
                .map(({ key, label, min, max, step }) => (
                  <label key={key} className="flex flex-col gap-2 text-xs">
                    <span className="flex justify-between gap-2">
                      <span>{label}</span>
                      <output className="font-mono text-muted-foreground">
                        {settings[key] ?? initialSettings[key]}
                      </output>
                    </span>
                    <input
                      aria-label={label}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={settings[key] ?? initialSettings[key]}
                      onChange={(event) =>
                        change(key, Number(event.target.value))
                      }
                      className="w-full accent-foreground"
                    />
                  </label>
                ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSettings({
                    ...initialSettings,
                    x: selectedTemplate?.x ?? 0.5,
                    y: selectedTemplate?.y ?? 0.5
                  })
                }
              >
                {m.project_banner_prototype_reset()}
              </Button>
              {selectedTemplate && (
                <a
                  href={selectedTemplate.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {m.project_banner_template_credit({
                    photographer: selectedTemplate.photographer,
                    provider: selectedTemplate.provider
                  })}
                </a>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!embedded && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.project_banner_prototype_previous()}
                onClick={switchMode}
              >
                <ChevronLeft />
              </Button>
              <span
                aria-live="polite"
                className="min-w-0 text-xs font-medium sm:min-w-40 sm:text-sm"
              >
                {mode === "image"
                  ? m.project_banner_prototype_image()
                  : m.project_banner_prototype_mask()}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.project_banner_prototype_next()}
                onClick={switchMode}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              leadingIcon={Upload}
            >
              {m.project_banner_prototype_upload()}
            </Button>
            {!embedded && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.project_banner_prototype_controls()}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                <SlidersHorizontal />
              </Button>
            )}
            {embedded && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRemoved(true)
                  }}
                >
                  {m.project_banner_settings_remove()}
                </Button>
                <Button variant="ghost" size="sm" onClick={cancel}>
                  {m.common_cancel_button()}
                </Button>
                <Button
                  size="sm"
                  disabled={error || (!removed && !image)}
                  onClick={() => {
                    setSaved({ source, settings, removed })
                    setExpanded(false)
                  }}
                >
                  {m.project_banner_settings_apply()}
                </Button>
              </>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setError(false)
            const url = URL.createObjectURL(file)
            objectUrls.current.push(url)
            setSource(url)
            setRemoved(false)
            setSettings((current) => ({ ...current, zoom: 1, x: 0.5, y: 0.5 }))
            setExpanded(true)
            event.target.value = ""
          }}
        />
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {m.project_banner_prototype_load_error()}
          </p>
        )}
      </section>
    </>
  )
}
