# Dithered Breathing-Fold Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `<Loader />` that animates the ProjectProject logo as a "breathing fold" and runs it through a custom dithering shader modeled on Paper's Apache-2.0 `image-dithering`, then adopt it app-wide.

**Architecture:** A pure geometry module maps a fold position `P ∈ [0,1]` to two trapezoidal panels with per-panel gradients. A Canvas2D drawer renders those panels each frame; a minimal WebGL mount uploads that canvas as a texture and runs a compact dithering fragment shader. `Loader` owns a cosine "breathing" clock (honoring `prefers-reduced-motion`) and exposes size/speed/color props. A `/dev/loader` debug page exercises it across contexts (built before app adoption). Finally it is wired as the router's `defaultPendingComponent`.

**Tech Stack:** React 19, TanStack Router (file-based routes), Vite, Vitest, WebGL1, TypeScript, Tailwind. Path alias `@/*` → `packages/frontend/src/*`.

## Global Constraints

- All paths below are relative to `packages/frontend/` unless stated otherwise. Run all commands from `packages/frontend/`.
- **No code comments** anywhere, with ONE exception: an Apache-2.0 attribution header in `dither-shader.ts` (license requirement).
- Test files are colocated (`foo.ts` → `foo.test.ts`) and use `import { describe, expect, it } from "vitest"`.
- Buttons/interactive controls added anywhere get `active:scale-[0.97]` and a 100–150ms transform transition; hover targets snap in / ease out (~150ms) via existing global rules — add `transition-colors` where needed. (Only relevant to the debug page controls.)
- No modal dialogs. No Playwright / automated browser driving — visual checks are manual against a running `bun run dev`.
- Icons: `lucide-react` only.
- Commit after every task with the exact message shown.

---

### Task 1: Logo geometry (pure math + SVG string)

**Files:**
- Create: `src/components/Loader/logo-geometry.ts`
- Test: `src/components/Loader/logo-geometry.test.ts`

**Interfaces:**
- Produces:
  - `LOGO_GEOMETRY: { w: number; h: number; cy: number; hTall: number; hShort: number }`
  - `type PanelGeometry = { foldX: number; leftPath: string; rightPath: string; leftGradient: { x1: number; x2: number }; rightGradient: { x1: number; x2: number } }`
  - `panelGeometry(p: number): PanelGeometry` — `p` is clamped to `[0,1]`; `foldX = p * w`. Gradients are in user-space coords: `x1` is the fold edge (white), `x2` is the outer edge (black).
  - `logoSvgString(p: number): string` — a full standalone `<svg viewBox="0 0 100 100">` string using the paths + linear gradients (for the debug page's live SVG preview).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { LOGO_GEOMETRY, logoSvgString, panelGeometry } from "./logo-geometry"

const { w, cy, hShort } = LOGO_GEOMETRY

describe("panelGeometry", () => {
  it("places the fold at p*width", () => {
    expect(panelGeometry(0).foldX).toBe(0)
    expect(panelGeometry(0.5).foldX).toBe(w / 2)
    expect(panelGeometry(1).foldX).toBe(w)
  })

  it("clamps p into [0,1]", () => {
    expect(panelGeometry(-1).foldX).toBe(0)
    expect(panelGeometry(2).foldX).toBe(w)
  })

  it("anchors each panel's gradient white at the fold, black at the outer edge", () => {
    const g = panelGeometry(0.5)
    expect(g.leftGradient).toEqual({ x1: w / 2, x2: 0 })
    expect(g.rightGradient).toEqual({ x1: w / 2, x2: w })
  })

  it("is mirror-symmetric about the center", () => {
    const a = panelGeometry(0.3)
    const b = panelGeometry(0.7)
    expect(a.leftGradient.x1).toBe(b.rightGradient.x1 - (w - 2 * a.foldX) - 0) // sanity: folds mirror
    expect(a.foldX).toBe(w - b.foldX)
  })

  it("keeps the fold-edge height constant across p (short height at the fold)", () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const g = panelGeometry(p)
      expect(g.leftPath).toContain(`${cy - hShort}`)
      expect(g.rightPath).toContain(`${cy - hShort}`)
    }
  })

  it("emits a standalone svg with both gradients", () => {
    const svg = logoSvgString(0.5)
    expect(svg).toContain("<svg")
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain("linearGradient")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/Loader/logo-geometry`
Expected: FAIL — cannot resolve `./logo-geometry`.

- [ ] **Step 3: Write minimal implementation**

```ts
export const LOGO_GEOMETRY = {
  w: 100,
  h: 100,
  cy: 50,
  hTall: 44,
  hShort: 30
} as const

export type PanelGeometry = {
  foldX: number
  leftPath: string
  rightPath: string
  leftGradient: { x1: number; x2: number }
  rightGradient: { x1: number; x2: number }
}

const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p)

export function panelGeometry(p: number): PanelGeometry {
  const { w, cy, hTall, hShort } = LOGO_GEOMETRY
  const foldX = clamp01(p) * w
  const topTall = cy - hTall
  const botTall = cy + hTall
  const topShort = cy - hShort
  const botShort = cy + hShort

  const leftPath = `M 0 ${topTall} L ${foldX} ${topShort} L ${foldX} ${botShort} L 0 ${botTall} Z`
  const rightPath = `M ${foldX} ${topShort} L ${w} ${topTall} L ${w} ${botTall} L ${foldX} ${botShort} Z`

  return {
    foldX,
    leftPath,
    rightPath,
    leftGradient: { x1: foldX, x2: 0 },
    rightGradient: { x1: foldX, x2: w }
  }
}

export function logoSvgString(p: number): string {
  const { w, h } = LOGO_GEOMETRY
  const g = panelGeometry(p)
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="${g.leftGradient.x1}" y1="0" x2="${g.leftGradient.x2}" y2="0"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>
<linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="${g.rightGradient.x1}" y1="0" x2="${g.rightGradient.x2}" y2="0"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient>
</defs>
<path d="${g.leftPath}" fill="url(#lg)"/>
<path d="${g.rightPath}" fill="url(#rg)"/>
</svg>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/Loader/logo-geometry`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/Loader/logo-geometry.ts src/components/Loader/logo-geometry.test.ts
git commit -m "feat(loader): pure fold geometry for the dithered logo loader"
```

---

### Task 2: Canvas2D logo drawer

**Files:**
- Create: `src/components/Loader/logo-canvas.ts`
- Test: `src/components/Loader/logo-canvas.test.ts`

**Interfaces:**
- Consumes: `panelGeometry`, `LOGO_GEOMETRY` from Task 1.
- Produces: `drawLogo(ctx: CanvasRenderingContext2D, p: number, w: number, h: number): void` — clears the target, then fills both panels with left→right white→black linear gradients, scaled from the `100×100` geometry space to `w×h`. Background is left transparent (`clearRect`).

- [ ] **Step 1: Write the failing test**

We verify the drawer issues the expected Canvas2D calls against a fake context (no real canvas in jsdom for WebGL, but 2D method calls are assertable via a hand-rolled spy).

```ts
import { describe, expect, it, vi } from "vitest"
import { drawLogo } from "./logo-canvas"

function fakeCtx() {
  const calls: string[] = []
  const grad = { addColorStop: vi.fn() }
  return {
    calls,
    grad,
    clearRect: vi.fn(() => calls.push("clearRect")),
    createLinearGradient: vi.fn(() => {
      calls.push("createLinearGradient")
      return grad
    }),
    beginPath: vi.fn(() => calls.push("beginPath")),
    moveTo: vi.fn(() => calls.push("moveTo")),
    lineTo: vi.fn(() => calls.push("lineTo")),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    set fillStyle(_v: unknown) {}
  }
}

describe("drawLogo", () => {
  it("clears then fills two gradient panels", () => {
    const ctx = fakeCtx()
    drawLogo(ctx as unknown as CanvasRenderingContext2D, 0.5, 200, 200)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200)
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(2)
    expect(ctx.fill).toHaveBeenCalledTimes(2)
    expect(ctx.grad.addColorStop).toHaveBeenCalledWith(0, "#ffffff")
    expect(ctx.grad.addColorStop).toHaveBeenCalledWith(1, "#000000")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/Loader/logo-canvas`
Expected: FAIL — cannot resolve `./logo-canvas`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { LOGO_GEOMETRY, panelGeometry } from "./logo-geometry"

type Trapezoid = [number, number][]

function fillPanel(
  ctx: CanvasRenderingContext2D,
  pts: Trapezoid,
  gx1: number,
  gx2: number,
  sx: number,
  sy: number
) {
  const grad = ctx.createLinearGradient(gx1 * sx, 0, gx2 * sx, 0)
  grad.addColorStop(0, "#ffffff")
  grad.addColorStop(1, "#000000")
  ctx.fillStyle = grad
  ctx.beginPath()
  pts.forEach(([x, y], i) => {
    const px = x * sx
    const py = y * sy
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fill()
}

export function drawLogo(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number
): void {
  const { w: gw, h: gh, cy, hTall, hShort } = LOGO_GEOMETRY
  const sx = w / gw
  const sy = h / gh
  const { foldX, leftGradient, rightGradient } = panelGeometry(p)

  ctx.clearRect(0, 0, w, h)

  const left: Trapezoid = [
    [0, cy - hTall],
    [foldX, cy - hShort],
    [foldX, cy + hShort],
    [0, cy + hTall]
  ]
  const right: Trapezoid = [
    [foldX, cy - hShort],
    [gw, cy - hTall],
    [gw, cy + hTall],
    [foldX, cy + hShort]
  ]

  fillPanel(ctx, left, leftGradient.x1, leftGradient.x2, sx, sy)
  fillPanel(ctx, right, rightGradient.x1, rightGradient.x2, sx, sy)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/Loader/logo-canvas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Loader/logo-canvas.ts src/components/Loader/logo-canvas.test.ts
git commit -m "feat(loader): canvas2d drawer for the fold geometry"
```

---

### Task 3: Dithering shader source

**Files:**
- Create: `src/components/Loader/dither-shader.ts`
- Test: `src/components/Loader/dither-shader.test.ts`

**Interfaces:**
- Produces:
  - `VERTEX_SRC: string` — WebGL1 fullscreen-triangle vertex shader, sets `varying vec2 v_uv`.
  - `FRAGMENT_SRC: string` — WebGL1 dithering fragment shader.
  - `type DitherUniforms = { pxSize: number; colorSteps: number; originalColors: boolean; colorFront: [number, number, number]; colorHighlight: [number, number, number]; colorBack: [number, number, number, number] }`
  - `DEFAULT_UNIFORMS: DitherUniforms` — matches the Paper file: `colorSteps: 2`, `originalColors: true`, `colorFront: green (#94FFAF)`, `colorHighlight: (#EAFF94)`, `colorBack: transparent`, `pxSize: 20`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { DEFAULT_UNIFORMS, FRAGMENT_SRC, VERTEX_SRC } from "./dither-shader"

describe("dither-shader", () => {
  it("exposes both shader stages", () => {
    expect(VERTEX_SRC).toContain("gl_Position")
    expect(FRAGMENT_SRC).toContain("gl_FragColor")
  })

  it("declares the uniforms the mount will set", () => {
    for (const u of [
      "u_image",
      "u_resolution",
      "u_pxSize",
      "u_colorSteps",
      "u_originalColors",
      "u_colorFront",
      "u_colorHighlight",
      "u_colorBack"
    ]) {
      expect(FRAGMENT_SRC).toContain(u)
    }
  })

  it("defaults match the paper preset", () => {
    expect(DEFAULT_UNIFORMS.colorSteps).toBe(2)
    expect(DEFAULT_UNIFORMS.originalColors).toBe(true)
    expect(DEFAULT_UNIFORMS.colorBack[3]).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/Loader/dither-shader`
Expected: FAIL — cannot resolve `./dither-shader`.

- [ ] **Step 3: Write minimal implementation**

```ts
export const VERTEX_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

export const FRAGMENT_SRC = `
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_pxSize;
uniform float u_colorSteps;
uniform bool u_originalColors;
uniform vec3 u_colorFront;
uniform vec3 u_colorHighlight;
uniform vec4 u_colorBack;
varying vec2 v_uv;

float bayer2x2(vec2 cell) {
  vec2 c = mod(floor(cell), 2.0);
  if (c.x == 0.0 && c.y == 0.0) return 0.0 / 4.0;
  if (c.x == 1.0 && c.y == 0.0) return 2.0 / 4.0;
  if (c.x == 0.0 && c.y == 1.0) return 3.0 / 4.0;
  return 1.0 / 4.0;
}

void main() {
  vec2 frag = v_uv * u_resolution;
  vec2 cell = floor(frag / u_pxSize);
  vec2 sampleUv = (cell * u_pxSize + u_pxSize * 0.5) / u_resolution;
  vec4 tex = texture2D(u_image, sampleUv);

  float lum = dot(vec3(0.2126, 0.7152, 0.0722), tex.rgb) * tex.a;
  float threshold = bayer2x2(cell) - 0.5;
  float b = clamp(lum + threshold / u_colorSteps, 0.0, 1.0);
  float q = clamp(floor(b * u_colorSteps), 0.0, u_colorSteps - 1.0) / (u_colorSteps - 1.0);

  vec3 rgb;
  if (u_originalColors) {
    vec3 norm = tex.rgb / max(lum, 0.001);
    rgb = clamp(norm, 0.0, 1.0) * q;
  } else {
    rgb = mix(u_colorBack.rgb, u_colorFront, q);
    float hl = step(1.02 - 0.02 * u_colorSteps, q);
    rgb = mix(rgb, u_colorHighlight, hl);
  }

  float alpha = max(u_colorBack.a, q);
  gl_FragColor = vec4(rgb, alpha);
}
`

export type DitherUniforms = {
  pxSize: number
  colorSteps: number
  originalColors: boolean
  colorFront: [number, number, number]
  colorHighlight: [number, number, number]
  colorBack: [number, number, number, number]
}

export const DEFAULT_UNIFORMS: DitherUniforms = {
  pxSize: 20,
  colorSteps: 2,
  originalColors: true,
  colorFront: [148 / 255, 255 / 255, 175 / 255],
  colorHighlight: [234 / 255, 255 / 255, 148 / 255],
  colorBack: [0, 0, 0, 0]
}
```

Prepend this attribution header as the FIRST lines of the file (the sole allowed comment):

```ts
// Dithering algorithm adapted from @paper-design/shaders (image-dithering),
// licensed under Apache-2.0. https://github.com/paper-design/shaders
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/Loader/dither-shader`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Loader/dither-shader.ts src/components/Loader/dither-shader.test.ts
git commit -m "feat(loader): dithering shader modeled on paper's image-dithering"
```

---

### Task 4: WebGL dither canvas mount

**Files:**
- Create: `src/components/Loader/DitherCanvas.tsx`

**Interfaces:**
- Consumes: `drawLogo` (Task 2); `VERTEX_SRC`, `FRAGMENT_SRC`, `DitherUniforms` (Task 3).
- Produces: `DitherCanvas` React component.

```ts
type DitherCanvasProps = {
  getP: (elapsedMs: number) => number
  paused?: boolean
  uniforms: DitherUniforms
  ditherCells?: number
  className?: string
}
```

It creates a `<canvas>`, gets a WebGL1 context (`alpha: true, premultipliedAlpha: false`), compiles the program, allocates a texture backed by an offscreen 2D canvas, and runs a single `requestAnimationFrame` loop: compute `p = getP(elapsed)`, `drawLogo` into the offscreen canvas, upload it, set uniforms (including `u_pxSize` derived from `ditherCells`), draw. Sizes to its container via `ResizeObserver` at `devicePixelRatio`. Fully disposes on unmount (StrictMode-safe).

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef } from "react"
import {
  DitherUniforms,
  FRAGMENT_SRC,
  VERTEX_SRC
} from "./dither-shader"
import { drawLogo } from "./logo-canvas"

type DitherCanvasProps = {
  getP: (elapsedMs: number) => number
  paused?: boolean
  uniforms: DitherUniforms
  ditherCells?: number
  className?: string
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) throw new Error("createShader failed")
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile error: ${log}`)
  }
  return sh
}

export function DitherCanvas({
  getP,
  paused = false,
  uniforms,
  ditherCells = 40,
  className
}: DitherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const getPRef = useRef(getP)
  const uniformsRef = useRef(uniforms)
  const pausedRef = useRef(paused)
  const cellsRef = useRef(ditherCells)
  getPRef.current = getP
  uniformsRef.current = uniforms
  pausedRef.current = paused
  cellsRef.current = ditherCells

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true
    })
    if (!gl) return

    const prog = gl.createProgram()!
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC)
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(prog, "a_pos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uImage = u("u_image")
    const uRes = u("u_resolution")
    const uPx = u("u_pxSize")
    const uSteps = u("u_colorSteps")
    const uOrig = u("u_originalColors")
    const uFront = u("u_colorFront")
    const uHigh = u("u_colorHighlight")
    const uBack = u("u_colorBack")

    const off = document.createElement("canvas")
    const octx = off.getContext("2d")!

    let raf = 0
    let start = 0
    let w = 0
    let h = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width * dpr))
      h = Math.max(1, Math.round(rect.height * dpr))
      canvas.width = w
      canvas.height = h
      off.width = w
      off.height = h
      gl.viewport(0, 0, w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (t: number) => {
      if (!start) start = t
      const elapsed = pausedRef.current ? 0 : t - start
      const p = getPRef.current(elapsed)

      drawLogo(octx, p, w, h)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off)

      const un = uniformsRef.current
      gl.uniform1i(uImage, 0)
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uPx, Math.max(1, w / cellsRef.current))
      gl.uniform1f(uSteps, un.colorSteps)
      gl.uniform1i(uOrig, un.originalColors ? 1 : 0)
      gl.uniform3fv(uFront, un.colorFront)
      gl.uniform3fv(uHigh, un.colorHighlight)
      gl.uniform4fv(uBack, un.colorBack)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteProgram(prog)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Loader/DitherCanvas.tsx
git commit -m "feat(loader): webgl mount that dithers the per-frame logo canvas"
```

---

### Task 5: Loader component (breathing clock + reduced motion)

**Files:**
- Create: `src/components/Loader/Loader.tsx`
- Create: `src/components/Loader/index.ts`
- Test: `src/components/Loader/breathing.test.ts`

**Interfaces:**
- Consumes: `DitherCanvas` (Task 4); `DEFAULT_UNIFORMS`, `DitherUniforms` (Task 3).
- Produces:
  - `breathingP(elapsedMs: number, periodMs: number): number` — `0.5 - 0.5 * cos(2π * elapsed / period)`, sweeping `0→1→0`, eased at both ends.
  - `Loader` React component:

```ts
type LoaderProps = {
  size?: number | string
  className?: string
  speed?: number
  paused?: boolean
  uniforms?: Partial<DitherUniforms>
  ditherCells?: number
}
```

`Loader` builds `getP` from `breathingP` (period = `4000 / speed`, default speed 1). When `prefers-reduced-motion: reduce` matches, `getP` returns a constant `0.5` and `paused` is forced true.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { breathingP } from "./Loader"

describe("breathingP", () => {
  it("starts folded at the left", () => {
    expect(breathingP(0, 4000)).toBeCloseTo(0, 5)
  })
  it("is fully swept at the half period", () => {
    expect(breathingP(2000, 4000)).toBeCloseTo(1, 5)
  })
  it("returns to the start after a full period", () => {
    expect(breathingP(4000, 4000)).toBeCloseTo(0, 5)
  })
  it("eases (slope ~0) at the extremes", () => {
    const near = breathingP(10, 4000)
    expect(near).toBeLessThan(0.001)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/Loader/breathing`
Expected: FAIL — cannot resolve `./Loader`.

- [ ] **Step 3: Write minimal implementation**

`src/components/Loader/Loader.tsx`:

```tsx
import { useMemo, useSyncExternalStore } from "react"
import {
  DEFAULT_UNIFORMS,
  DitherUniforms
} from "./dither-shader"
import { DitherCanvas } from "./DitherCanvas"

export function breathingP(elapsedMs: number, periodMs: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / periodMs)
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
}

type LoaderProps = {
  size?: number | string
  className?: string
  speed?: number
  paused?: boolean
  uniforms?: Partial<DitherUniforms>
  ditherCells?: number
}

export function Loader({
  size = 96,
  className,
  speed = 1,
  paused = false,
  uniforms,
  ditherCells
}: LoaderProps) {
  const reduced = usePrefersReducedMotion()
  const merged = useMemo(
    () => ({ ...DEFAULT_UNIFORMS, ...uniforms }),
    [uniforms]
  )
  const period = 4000 / (speed || 1)
  const getP = useMemo(
    () =>
      reduced
        ? () => 0.5
        : (elapsed: number) => breathingP(elapsed, period),
    [reduced, period]
  )
  const dim = typeof size === "number" ? `${size}px` : size

  return (
    <DitherCanvas
      className={className}
      getP={getP}
      paused={paused || reduced}
      uniforms={merged}
      ditherCells={ditherCells}
      // sizing via style below through className is possible; inline for clarity
      {...({ style: { width: dim, height: dim } } as object)}
    />
  )
}
```

Note: `DitherCanvas` must forward `style`. Update its props to accept `style?: React.CSSProperties` and spread it onto the `<canvas>`. Edit `DitherCanvas.tsx`: add `style` to `DitherCanvasProps` and render `<canvas ref={canvasRef} className={className} style={style} />`.

`src/components/Loader/index.ts`:

```ts
export { Loader } from "./Loader"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/Loader/breathing`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Loader/Loader.tsx src/components/Loader/index.ts src/components/Loader/breathing.test.ts src/components/Loader/DitherCanvas.tsx
git commit -m "feat(loader): breathing clock, reduced-motion, public Loader component"
```

---

### Task 6: Debug page at `/dev/loader` (first usage, multiple contexts)

**Files:**
- Create: `src/routes/dev.loader.tsx`

**Interfaces:**
- Consumes: `Loader` (Task 5); `logoSvgString` (Task 1).

Renders the loader across several contexts so we can fine-tune: multiple sizes (24 / 48 / 96 / 240 / full-bleed), on both a light and a dark panel, with sliders for `speed` and `ditherCells`, a paused toggle, and — beside the dithered version — a live raw `<svg>` (from `logoSvgString`) driven by its own rAF so we can see the underlying SVG animating undithered.

- [ ] **Step 1: Write the route**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Loader } from "@/components/Loader"
import { logoSvgString } from "@/components/Loader/logo-geometry"
import { breathingP } from "@/components/Loader/Loader"

export const Route = createFileRoute("/dev/loader")({
  component: LoaderDebugPage
})

function RawSvgPreview({ speed }: { speed: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = breathingP(t - start, 4000 / (speed || 1))
      if (ref.current) ref.current.innerHTML = logoSvgString(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speed])
  return <div ref={ref} className="size-24 [&>svg]:size-full" />
}

function LoaderDebugPage() {
  const [speed, setSpeed] = useState(1)
  const [cells, setCells] = useState(40)
  const [paused, setPaused] = useState(false)
  const sizes = [24, 48, 96, 240]

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Loader debug</h1>
        <p className="text-muted-foreground text-sm">
          Dithered breathing-fold loader across contexts.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          speed
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <span className="tabular-nums">{speed}×</span>
        </label>
        <label className="flex items-center gap-2">
          dither cells
          <input
            type="range"
            min={12}
            max={80}
            step={1}
            value={cells}
            onChange={(e) => setCells(Number(e.target.value))}
          />
          <span className="tabular-nums">{cells}</span>
        </label>
        <button
          type="button"
          className="rounded-md border px-3 py-1 transition-colors transition-transform duration-100 active:scale-[0.97]"
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? "play" : "pause"}
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sizes</h2>
        <div className="flex flex-wrap items-end gap-8">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Loader size={s} speed={speed} paused={paused} ditherCells={cells} />
              <span className="text-muted-foreground text-xs">{s}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-center rounded-lg bg-white p-10">
          <Loader size={160} speed={speed} paused={paused} ditherCells={cells} />
        </div>
        <div className="flex items-center justify-center rounded-lg bg-neutral-950 p-10">
          <Loader size={160} speed={speed} paused={paused} ditherCells={cells} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Raw SVG (undithered source)</h2>
        <RawSvgPreview speed={speed} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Full bleed</h2>
        <div className="flex h-64 items-center justify-center rounded-lg border">
          <Loader size="60%" speed={speed} paused={paused} ditherCells={cells} />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify the route builds and renders**

Run: `bun run dev` (leave running).
Manual: open `http://localhost:5173/dev/loader`. Confirm: 4 sizes render dithered green dots; light + dark panels both look right (transparent background composites); raw SVG panel shows the two gradient panels folding; sliders change speed and dot density; pause freezes. No console errors.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/dev.loader.tsx src/routeTree.gen.ts
git commit -m "feat(loader): /dev/loader debug page across contexts"
```

---

### Task 7: Adopt as the app-wide route pending component

**Files:**
- Create: `src/components/Loader/RouteLoader.tsx`
- Modify: `src/main.tsx` (add `defaultPendingComponent` to `createRouter`)

**Interfaces:**
- Consumes: `Loader` (Task 5).
- Produces: `RouteLoader` — a centered, full-area wrapper suitable as a router pending fallback.

- [ ] **Step 1: Write the wrapper**

`src/components/Loader/RouteLoader.tsx`:

```tsx
import { Loader } from "./Loader"

export function RouteLoader() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <Loader size={112} />
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the router**

Edit `src/main.tsx`. Add the import and the `defaultPendingComponent` option:

```tsx
import { RouteLoader } from "./components/Loader/RouteLoader"
```

```tsx
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: RouteLoader,
  context: { registry }
})
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the running app**

Manual (dev server running): navigate between routes that load data (e.g. into a project) and confirm the dithered loader appears as the pending state and is replaced by content. Throttle network in devtools to make the pending state visible if needed. No console errors; no leaked WebGL contexts after several navigations (check `about:gpu`/devtools if unsure).

- [ ] **Step 5: Commit**

```bash
git add src/components/Loader/RouteLoader.tsx src/main.tsx
git commit -m "feat(loader): adopt dithered loader as router pending component"
```

---

## Self-Review

**Spec coverage:**
- Concept & motion → Tasks 1 (geometry), 5 (breathing). ✓
- Rendering pipeline (geometry → SVG/canvas → rasterize → dither) → Tasks 2, 3, 4. ✓
- Shader uniforms match Paper file → Task 3 `DEFAULT_UNIFORMS`. ✓
- Component boundaries (geometry / shader / DitherCanvas / Loader / debug route) → Tasks 1–6; `logo-canvas.ts` added as the Canvas2D drawer per the rasterization decision (documented in spec's pipeline). ✓
- Fixed signature palette → `DEFAULT_UNIFORMS` + `uniforms` prop overrides. ✓
- Dither density scales with size → `u_pxSize = w / ditherCells` in DitherCanvas. ✓
- `prefers-reduced-motion` parks at center + freezes → Task 5. ✓
- WebGL context budget note → debug page keeps a handful; disposal in Task 4 cleanup. ✓
- Testing: geometry unit tests at P=0/0.5/1 → Task 1; visual verification, no Playwright → Tasks 6/7 manual. ✓
- Adoption into the app (added per user request, was "out of scope" in spec) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `panelGeometry`/`PanelGeometry`, `drawLogo(ctx,p,w,h)`, `DitherUniforms`, `breathingP(elapsed,period)`, `getP`, `ditherCells → u_pxSize` are used identically across tasks. `DitherCanvas` gains a `style` prop in Task 5 (called out explicitly). ✓
