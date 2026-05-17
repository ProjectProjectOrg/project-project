import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react"
import type { DitherProps, DitherType } from "@/components/ui/dither"

export interface TimeWarpZoneConfig {
  enabled: boolean
  radius: number
  strength: number
  falloff: number
}

export type DitherConfig = Required<
  Pick<
    DitherProps,
    | "speed"
    | "octaves"
    | "frequency"
    | "amplitude"
    | "lacunarity"
    | "rotationAngle"
    | "warpStrength"
    | "contrast"
    | "bias"
    | "colorFront"
    | "colorBack"
    | "pixelSize"
    | "ditherType"
    | "cardWellEnabled"
    | "cardFalloff"
    | "cardCornerRadius"
  >
> & {
  mouseWarp: TimeWarpZoneConfig
  centerWarp: TimeWarpZoneConfig
}

const STORAGE_KEY = "dither-tweak-panel:v1"

export const defaultDitherConfig: DitherConfig = {
  speed: 0.3,
  octaves: 4,
  frequency: 2.0,
  amplitude: 0.5,
  lacunarity: 2.0,
  rotationAngle: 0.5,
  warpStrength: 0.0,
  contrast: 0.2,
  bias: 0.0,
  colorFront: "#ffffff",
  colorBack: "#000000",
  pixelSize: 2,
  ditherType: "8x8",
  cardWellEnabled: true,
  cardFalloff: 80,
  cardCornerRadius: 16,
  mouseWarp: {
    enabled: false,
    radius: 0.3,
    strength: 0.5,
    falloff: 1
  },
  centerWarp: {
    enabled: false,
    radius: 0.3,
    strength: 0.5,
    falloff: 1
  }
}

function loadConfig(): DitherConfig {
  if (typeof window === "undefined") return defaultDitherConfig
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDitherConfig
    const parsed = JSON.parse(raw) as Partial<DitherConfig> & {
      mouseRadius?: number
      mouseStrength?: number
      mouseFalloff?: number
      enableMouseInteraction?: boolean
    }
    const mouseWarp: TimeWarpZoneConfig = parsed.mouseWarp ?? {
      enabled: parsed.enableMouseInteraction ?? defaultDitherConfig.mouseWarp.enabled,
      radius: parsed.mouseRadius ?? defaultDitherConfig.mouseWarp.radius,
      strength: parsed.mouseStrength ?? defaultDitherConfig.mouseWarp.strength,
      falloff: parsed.mouseFalloff ?? defaultDitherConfig.mouseWarp.falloff
    }
    const centerWarp = parsed.centerWarp ?? defaultDitherConfig.centerWarp
    return { ...defaultDitherConfig, ...parsed, mouseWarp, centerWarp }
  } catch {
    return defaultDitherConfig
  }
}

export function useDitherConfig() {
  const [config, setConfigState] = useState<DitherConfig>(() => loadConfig())

  const setConfig = useCallback(
    (next: DitherConfig | ((prev: DitherConfig) => DitherConfig)) => {
      setConfigState((prev) => {
        const value = typeof next === "function" ? next(prev) : next
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        } catch {}
        return value
      })
    },
    []
  )

  const resetConfig = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
    setConfigState(defaultDitherConfig)
  }, [])

  return { config, setConfig, resetConfig }
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, onChange }: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-white/80">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-white/50">{value.toFixed(3)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-white"
      />
    </label>
  )
}

interface WarpZoneSectionProps {
  label: string
  value: TimeWarpZoneConfig
  onChange: (next: TimeWarpZoneConfig) => void
}

function WarpZoneSection({ label, value, onChange }: WarpZoneSectionProps) {
  const update = <K extends keyof TimeWarpZoneConfig>(
    key: K,
    next: TimeWarpZoneConfig[K]
  ) => onChange({ ...value, [key]: next })

  return (
    <div className="flex flex-col gap-2 rounded border border-white/10 bg-white/5 p-2">
      <label className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => update("enabled", e.target.checked)}
          className="accent-white"
        />
        {label}
      </label>
      {value.enabled && (
        <>
          <SliderRow
            label="Radius"
            value={value.radius}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => update("radius", v)}
          />
          <SliderRow
            label="Time offset"
            value={value.strength}
            min={-5}
            max={5}
            step={0.05}
            onChange={(v) => update("strength", v)}
          />
          <SliderRow
            label="Falloff (sharpness)"
            value={value.falloff}
            min={0.1}
            max={8}
            step={0.05}
            onChange={(v) => update("falloff", v)}
          />
        </>
      )}
    </div>
  )
}

interface DitherTweakPanelProps {
  config: DitherConfig
  onChange: (
    next: DitherConfig | ((prev: DitherConfig) => DitherConfig)
  ) => void
  onReset: () => void
}

export function DitherTweakPanel({
  config,
  onChange,
  onReset
}: DitherTweakPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const set = <K extends keyof DitherConfig>(key: K, value: DitherConfig[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:collapsed`)
    if (raw === "1") setCollapsed(true)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `${STORAGE_KEY}:collapsed`,
        collapsed ? "1" : "0"
      )
    } catch {}
  }, [collapsed])

  return (
    <div className="fixed right-4 top-4 z-50 w-64 select-none rounded-lg border border-white/15 bg-black/70 p-3 text-white shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
          Dither tweaks
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className="rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.97]"
            aria-label="Reset to defaults"
            title="Reset"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.97]"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3 flex max-h-[80vh] flex-col gap-3 overflow-y-auto pr-1">
          <SliderRow
            label="Speed"
            value={config.speed}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => set("speed", v)}
          />
          <SliderRow
            label="Frequency"
            value={config.frequency}
            min={0.1}
            max={20}
            step={0.05}
            onChange={(v) => set("frequency", v)}
          />
          <SliderRow
            label="Amplitude (octave gain)"
            value={config.amplitude}
            min={0.1}
            max={1}
            step={0.01}
            onChange={(v) => set("amplitude", v)}
          />
          <SliderRow
            label="Lacunarity (octave freq mult)"
            value={config.lacunarity}
            min={1}
            max={4}
            step={0.05}
            onChange={(v) => set("lacunarity", v)}
          />
          <SliderRow
            label="Rotation per octave (rad)"
            value={config.rotationAngle}
            min={0}
            max={Math.PI}
            step={0.01}
            onChange={(v) => set("rotationAngle", v)}
          />
          <SliderRow
            label="Domain warp"
            value={config.warpStrength}
            min={0}
            max={3}
            step={0.01}
            onChange={(v) => set("warpStrength", v)}
          />
          <SliderRow
            label="Octaves"
            value={config.octaves}
            min={1}
            max={8}
            step={1}
            onChange={(v) => set("octaves", Math.round(v))}
          />
          <SliderRow
            label="Contrast"
            value={config.contrast}
            min={0}
            max={0.5}
            step={0.005}
            onChange={(v) => set("contrast", v)}
          />
          <SliderRow
            label="Bias"
            value={config.bias}
            min={-0.5}
            max={0.5}
            step={0.01}
            onChange={(v) => set("bias", v)}
          />
          <SliderRow
            label="Pixel size"
            value={config.pixelSize}
            min={1}
            max={20}
            step={1}
            onChange={(v) => set("pixelSize", Math.round(v))}
          />

          <label className="flex flex-col gap-1 text-[11px] text-white/80">
            <span>Dither matrix</span>
            <select
              value={config.ditherType}
              onChange={(e) => set("ditherType", e.target.value as DitherType)}
              className="rounded border border-white/15 bg-black/60 px-2 py-1 text-white outline-none"
            >
              <option value="random">random</option>
              <option value="2x2">2x2</option>
              <option value="4x4">4x4</option>
              <option value="8x8">8x8</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-white/80">
              <span>Front</span>
              <input
                type="color"
                value={config.colorFront}
                onChange={(e) => set("colorFront", e.target.value)}
                className="h-7 w-full cursor-pointer rounded border border-white/15 bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-white/80">
              <span>Back</span>
              <input
                type="color"
                value={config.colorBack}
                onChange={(e) => set("colorBack", e.target.value)}
                className="h-7 w-full cursor-pointer rounded border border-white/15 bg-transparent"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <input
              type="checkbox"
              checked={config.cardWellEnabled}
              onChange={(e) => set("cardWellEnabled", e.target.checked)}
              className="accent-white"
            />
            Card well
          </label>

          {config.cardWellEnabled && (
            <>
              <SliderRow
                label="Card falloff (px)"
                value={config.cardFalloff}
                min={0}
                max={400}
                step={1}
                onChange={(v) => set("cardFalloff", Math.round(v))}
              />
              <SliderRow
                label="Card corner radius (px)"
                value={config.cardCornerRadius}
                min={0}
                max={64}
                step={1}
                onChange={(v) => set("cardCornerRadius", Math.round(v))}
              />
            </>
          )}

          <WarpZoneSection
            label="Mouse time warp"
            value={config.mouseWarp}
            onChange={(v) => set("mouseWarp", v)}
          />
          <WarpZoneSection
            label="Center time warp"
            value={config.centerWarp}
            onChange={(v) => set("centerWarp", v)}
          />
        </div>
      )}
    </div>
  )
}
