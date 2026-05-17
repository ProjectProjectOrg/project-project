"use client"

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react"

export type DitherType = "random" | "2x2" | "4x4" | "8x8"

export const MAX_TIME_WARP_ZONES = 4
const MAX_RIPPLES = 12
const RIPPLE_LIFETIME_SEC = 1.8
const RIPPLE_RING_FREQUENCY = 24
const RIPPLE_RING_SPEED = 9
const TARGET_FRAME_MS = 1000 / 60
const FRAME_GATE_MS = TARGET_FRAME_MS - 2

export type TimeWarpAnchor =
  | { type: "click" }
  | { type: "fraction"; x: number; y: number }

export interface TimeWarpZone {
  anchor: TimeWarpAnchor
  radius: number
  strength: number
  falloff: number
}

export interface DitherProps {
  speed?: number
  octaves?: number
  frequency?: number
  amplitude?: number
  lacunarity?: number
  rotationAngle?: number
  warpStrength?: number
  contrast?: number
  bias?: number
  colorFront?: string
  colorBack?: string
  pixelSize?: number
  ditherType?: DitherType
  timeWarpZones?: TimeWarpZone[]
  disableAnimation?: boolean
  maxDpr?: number
  cardRef?: RefObject<HTMLElement | null>
  cardWellEnabled?: boolean
  cardFalloff?: number
  cardCornerRadius?: number
  className?: string
  style?: CSSProperties
}

const DITHER_TYPE_TO_INT: Record<DitherType, number> = {
  random: 1,
  "2x2": 2,
  "4x4": 3,
  "8x8": 4
}

const VERT_SRC = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_time;

uniform float u_speed;
uniform int u_octaves;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_lacunarity;
uniform float u_rotationAngle;
uniform float u_warpStrength;
uniform float u_contrast;
uniform float u_bias;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;

uniform float u_pxSize;
uniform int u_ditherType;

uniform vec2 u_warpCenters[4];
uniform float u_warpRadii[4];
uniform float u_warpStrengths[4];
uniform float u_warpFalloffs[4];
uniform int u_warpCount;

uniform vec2 u_ripples[12];
uniform float u_rippleAges[12];
uniform int u_rippleCount;
uniform float u_rippleRadius;
uniform float u_rippleStrength;
uniform float u_rippleFalloff;
uniform float u_rippleLifetime;
uniform float u_rippleFrequency;
uniform float u_rippleSpeed;

uniform vec2 u_cardCenter;
uniform vec2 u_cardHalfSize;
uniform float u_cardRadius;
uniform float u_cardFalloff;
uniform float u_cardActive;

out vec4 fragColor;

vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute4(vec4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289_3(i);
  vec4 p = permute4(permute4(permute4(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float hash21(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
);
const int bayer8x8[64] = int[64](
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
);

float roundedBoxSdf(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

float bayerValue(vec2 cell, int size) {
  ivec2 pos = ivec2(mod(cell, float(size)));
  int index = pos.y * size + pos.x;
  if (size == 2) return float(bayer2x2[index]) / 4.0;
  if (size == 4) return float(bayer4x4[index]) / 16.0;
  return float(bayer8x8[index]) / 64.0;
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 1.0;
  float total = 0.0;
  float c = cos(u_rotationAngle);
  float s = sin(u_rotationAngle);
  mat2 rot = mat2(c, s, -s, c);
  for (int i = 0; i < 8; i++) {
    if (i >= u_octaves) break;
    v += a * (0.5 + 0.5 * snoise3(p));
    total += a;
    p.xy = rot * p.xy * u_lacunarity;
    a *= u_amplitude;
  }
  return total > 0.0 ? v / total : 0.0;
}

void main() {
  float pxSize = max(0.5, u_pxSize * u_pixelRatio);
  vec2 pxSnap = (floor(gl_FragCoord.xy / pxSize) + 0.5) * pxSize;

  vec2 uv = pxSnap / u_resolution;
  uv -= 0.5;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * u_speed;
  for (int i = 0; i < 4; i++) {
    if (i >= u_warpCount) break;
    float radius = u_warpRadii[i];
    if (radius <= 0.0) continue;
    vec2 zoneUv = u_warpCenters[i] / u_resolution;
    zoneUv -= 0.5;
    zoneUv.x *= u_resolution.x / u_resolution.y;
    zoneUv.y = -zoneUv.y;
    float d = length(uv - zoneUv);
    float falloff = 1.0 - smoothstep(0.0, radius, d);
    falloff = pow(falloff, max(u_warpFalloffs[i], 0.001));
    t += u_warpStrengths[i] * falloff;
  }

  for (int i = 0; i < 12; i++) {
    if (i >= u_rippleCount) break;
    float age = u_rippleAges[i];
    float lifeT = clamp(age / max(u_rippleLifetime, 0.001), 0.0, 1.0);
    float grow = 1.0 - pow(1.0 - lifeT, 2.0);
    float radius = max(u_rippleRadius * grow, 0.0001);
    float fade = pow(1.0 - lifeT, 1.5);
    vec2 zoneUv = u_ripples[i] / u_resolution;
    zoneUv -= 0.5;
    zoneUv.x *= u_resolution.x / u_resolution.y;
    zoneUv.y = -zoneUv.y;
    float d = length(uv - zoneUv);
    float env = 1.0 - smoothstep(0.0, radius, d);
    env = pow(env, max(u_rippleFalloff, 0.001));
    float wave = sin(d * u_rippleFrequency - age * u_rippleSpeed);
    t += u_rippleStrength * fade * env * wave;
  }

  vec3 p = vec3(uv * u_frequency, t);
  if (u_warpStrength > 0.0) {
    vec2 q = vec2(
      fbm(p),
      fbm(p + vec3(5.2, 1.3, 0.7))
    ) - 0.5;
    p.xy += q * u_warpStrength;
  }
  float n = fbm(p);

  float shape = clamp(n + u_bias, 0.0, 1.0);
  float edge = clamp(0.5 - u_contrast, 0.0, 0.5);
  shape = smoothstep(edge, 1.0 - edge, shape);

  if (u_cardActive > 0.5) {
    float cardSdf = roundedBoxSdf(
      gl_FragCoord.xy - u_cardCenter,
      u_cardHalfSize,
      u_cardRadius
    );
    float cardWell = 1.0 - smoothstep(0.0, max(u_cardFalloff, 0.001), cardSdf);
    shape -= cardWell;
  }

  float dither = 0.0;
  vec2 cell = pxSnap / pxSize;
  if (u_ditherType == 1) {
    dither = hash21(pxSnap);
  } else if (u_ditherType == 2) {
    dither = bayerValue(cell, 2);
  } else if (u_ditherType == 3) {
    dither = bayerValue(cell, 4);
  } else {
    dither = bayerValue(cell, 8);
  }
  dither -= 0.5;
  float res = step(0.5, shape + dither);

  fragColor = mix(u_colorBack, u_colorFront, res);
}
`

function resolveCssVar(value: string): string {
  if (!value.startsWith("var(")) return value
  if (typeof window === "undefined") return value
  const match = value.match(/var\(\s*(--[^,)\s]+)\s*(?:,\s*([^)]+))?\s*\)/)
  if (!match) return value
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim()
  if (resolved) return resolved
  return match[2]?.trim() || value
}

function parseColor(value: string): [number, number, number, number] {
  if (typeof document === "undefined") return [0, 0, 0, 1]
  const ctx = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true })
  if (!ctx) return [0, 0, 0, 1]
  ctx.fillStyle = resolveCssVar(value)
  ctx.fillRect(0, 0, 1, 1)
  const data = ctx.getImageData(0, 0, 1, 1).data
  return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255]
}

function useThemeRevision(): number {
  const [rev, setRev] = useState(0)
  useEffect(() => {
    if (typeof window === "undefined") return
    const bump = () => setRev((r) => r + 1)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    })
    return () => observer.disconnect()
  }, [])
  return rev
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("createShader failed")
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown"
    gl.deleteShader(shader)
    throw new Error(`Shader compile failed: ${log}`)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error("createProgram failed")
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown"
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${log}`)
  }
  return program
}

export function Dither({
  speed = 0.3,
  octaves = 4,
  frequency = 2.0,
  amplitude = 0.5,
  lacunarity = 2.0,
  rotationAngle = 0.5,
  warpStrength = 0.0,
  contrast = 0.2,
  bias = 0.0,
  colorFront = "var(--dither-front)",
  colorBack = "var(--dither-back)",
  pixelSize = 2,
  ditherType = "8x8",
  timeWarpZones,
  disableAnimation = false,
  maxDpr = 2,
  cardRef,
  cardWellEnabled = false,
  cardFalloff = 80,
  cardCornerRadius = 16,
  className,
  style
}: DitherProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const requestRenderRef = useRef<(() => void) | null>(null)
  const parsedColorsRef = useRef<{
    front: [number, number, number, number]
    back: [number, number, number, number]
  }>({
    front: [0, 0, 0, 1],
    back: [0, 0, 0, 1]
  })
  const propsRef = useRef({
    speed,
    octaves,
    frequency,
    amplitude,
    lacunarity,
    rotationAngle,
    warpStrength,
    contrast,
    bias,
    colorFront,
    colorBack,
    pixelSize,
    ditherType,
    timeWarpZones: timeWarpZones ?? [],
    disableAnimation,
    cardRef,
    cardWellEnabled,
    cardFalloff,
    cardCornerRadius
  })

  useLayoutEffect(() => {
    propsRef.current = {
      speed,
      octaves,
      frequency,
      amplitude,
      lacunarity,
      rotationAngle,
      warpStrength,
      contrast,
      bias,
      colorFront,
      colorBack,
      pixelSize,
      ditherType,
      timeWarpZones: timeWarpZones ?? [],
      disableAnimation,
      cardRef,
      cardWellEnabled,
      cardFalloff,
      cardCornerRadius
    }
  }, [
    speed,
    octaves,
    frequency,
    amplitude,
    lacunarity,
    rotationAngle,
    warpStrength,
    contrast,
    bias,
    colorFront,
    colorBack,
    pixelSize,
    ditherType,
    timeWarpZones,
    disableAnimation,
    cardRef,
    cardWellEnabled,
    cardFalloff,
    cardCornerRadius
  ])

  const themeRevision = useThemeRevision()

  useLayoutEffect(() => {
    parsedColorsRef.current = {
      front: parseColor(colorFront),
      back: parseColor(colorBack)
    }
  }, [colorFront, colorBack, themeRevision])

  useLayoutEffect(() => {
    requestRenderRef.current?.()
  })

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: true,
      alpha: true
    })
    if (!gl) return

    let program: WebGLProgram
    try {
      program = createProgram(gl)
    } catch {
      return
    }
    const positionLoc = gl.getAttribLocation(program, "a_position")
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const uniforms = {
      u_resolution: gl.getUniformLocation(program, "u_resolution"),
      u_pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
      u_time: gl.getUniformLocation(program, "u_time"),
      u_speed: gl.getUniformLocation(program, "u_speed"),
      u_octaves: gl.getUniformLocation(program, "u_octaves"),
      u_frequency: gl.getUniformLocation(program, "u_frequency"),
      u_amplitude: gl.getUniformLocation(program, "u_amplitude"),
      u_lacunarity: gl.getUniformLocation(program, "u_lacunarity"),
      u_rotationAngle: gl.getUniformLocation(program, "u_rotationAngle"),
      u_warpStrength: gl.getUniformLocation(program, "u_warpStrength"),
      u_contrast: gl.getUniformLocation(program, "u_contrast"),
      u_bias: gl.getUniformLocation(program, "u_bias"),
      u_colorFront: gl.getUniformLocation(program, "u_colorFront"),
      u_colorBack: gl.getUniformLocation(program, "u_colorBack"),
      u_pxSize: gl.getUniformLocation(program, "u_pxSize"),
      u_ditherType: gl.getUniformLocation(program, "u_ditherType"),
      u_warpCenters: gl.getUniformLocation(program, "u_warpCenters"),
      u_warpRadii: gl.getUniformLocation(program, "u_warpRadii"),
      u_warpStrengths: gl.getUniformLocation(program, "u_warpStrengths"),
      u_warpFalloffs: gl.getUniformLocation(program, "u_warpFalloffs"),
      u_warpCount: gl.getUniformLocation(program, "u_warpCount"),
      u_ripples: gl.getUniformLocation(program, "u_ripples"),
      u_rippleAges: gl.getUniformLocation(program, "u_rippleAges"),
      u_rippleCount: gl.getUniformLocation(program, "u_rippleCount"),
      u_rippleRadius: gl.getUniformLocation(program, "u_rippleRadius"),
      u_rippleStrength: gl.getUniformLocation(program, "u_rippleStrength"),
      u_rippleFalloff: gl.getUniformLocation(program, "u_rippleFalloff"),
      u_rippleLifetime: gl.getUniformLocation(program, "u_rippleLifetime"),
      u_rippleFrequency: gl.getUniformLocation(program, "u_rippleFrequency"),
      u_rippleSpeed: gl.getUniformLocation(program, "u_rippleSpeed"),
      u_cardCenter: gl.getUniformLocation(program, "u_cardCenter"),
      u_cardHalfSize: gl.getUniformLocation(program, "u_cardHalfSize"),
      u_cardRadius: gl.getUniformLocation(program, "u_cardRadius"),
      u_cardFalloff: gl.getUniformLocation(program, "u_cardFalloff"),
      u_cardActive: gl.getUniformLocation(program, "u_cardActive")
    }

    gl.useProgram(program)

    let rafId = 0
    let elapsed = 0
    let lastFrame = performance.now()
    let lastDrawAt = -Infinity
    let forceDraw = false
    const warpCenters = new Float32Array(MAX_TIME_WARP_ZONES * 2)
    const warpRadii = new Float32Array(MAX_TIME_WARP_ZONES)
    const warpStrengths = new Float32Array(MAX_TIME_WARP_ZONES)
    const warpFalloffs = new Float32Array(MAX_TIME_WARP_ZONES)
    const ripples: { x: number; y: number; age: number }[] = []
    const ripplePositions = new Float32Array(MAX_RIPPLES * 2)
    const rippleAges = new Float32Array(MAX_RIPPLES)

    const resize = () => {
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height)
      gl.uniform1f(uniforms.u_pixelRatio, dpr)
      requestRender()
    }
    const findClickEmitter = (
      zones: ReadonlyArray<TimeWarpZone>
    ): TimeWarpZone | null => {
      for (const zone of zones) {
        if (zone.anchor.type === "click") return zone
      }
      return null
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (prefersReducedMotion) return
      const cur = propsRef.current
      if (!findClickEmitter(cur.timeWarpZones)) return
      const rect = canvas.getBoundingClientRect()
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        return
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
      const x = (e.clientX - rect.left) * dpr
      const y = (e.clientY - rect.top) * dpr
      if (ripples.length >= MAX_RIPPLES) ripples.shift()
      ripples.push({ x, y, age: 0 })
      requestRender()
    }

    const tick = (now: number) => {
      rafId = 0
      const dt = now - lastFrame
      lastFrame = now
      const cur = propsRef.current
      const animate = !cur.disableAnimation && !prefersReducedMotion
      if (animate) elapsed += dt
      const dtSec = dt / 1000
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].age += dtSec
        if (ripples[i].age >= RIPPLE_LIFETIME_SEC) ripples.splice(i, 1)
      }
      if (forceDraw || now - lastDrawAt >= FRAME_GATE_MS) {
        draw(cur)
        lastDrawAt = now
        forceDraw = false
      }
      if (animate || ripples.length > 0) {
        rafId = requestAnimationFrame(tick)
      }
    }

    const requestRender = () => {
      forceDraw = true
      if (rafId !== 0) return
      lastFrame = performance.now()
      rafId = requestAnimationFrame(tick)
    }

    const draw = (cur: typeof propsRef.current) => {
      const fg = parsedColorsRef.current.front
      const bg = parsedColorsRef.current.back
      gl.uniform1f(uniforms.u_time, elapsed * 0.001)
      gl.uniform1f(uniforms.u_speed, cur.speed)
      gl.uniform1i(uniforms.u_octaves, Math.max(1, Math.min(8, cur.octaves)))
      gl.uniform1f(uniforms.u_frequency, cur.frequency)
      gl.uniform1f(uniforms.u_amplitude, cur.amplitude)
      gl.uniform1f(uniforms.u_lacunarity, cur.lacunarity)
      gl.uniform1f(uniforms.u_rotationAngle, cur.rotationAngle)
      gl.uniform1f(uniforms.u_warpStrength, cur.warpStrength)
      gl.uniform1f(uniforms.u_contrast, cur.contrast)
      gl.uniform1f(uniforms.u_bias, cur.bias)
      gl.uniform4f(uniforms.u_colorFront, fg[0], fg[1], fg[2], fg[3])
      gl.uniform4f(uniforms.u_colorBack, bg[0], bg[1], bg[2], bg[3])
      gl.uniform1f(uniforms.u_pxSize, cur.pixelSize)
      gl.uniform1i(uniforms.u_ditherType, DITHER_TYPE_TO_INT[cur.ditherType])
      const zones = cur.timeWarpZones
      warpCenters.fill(0)
      warpRadii.fill(0)
      warpStrengths.fill(0)
      warpFalloffs.fill(1)
      let staticZoneCount = 0
      let clickEmitter: TimeWarpZone | null = null
      for (const zone of zones) {
        if (zone.anchor.type === "click") {
          if (!clickEmitter) clickEmitter = zone
          continue
        }
        if (staticZoneCount >= MAX_TIME_WARP_ZONES) break
        const px = canvas.width * zone.anchor.x
        const py = canvas.height * (1 - zone.anchor.y)
        warpCenters[staticZoneCount * 2] = px
        warpCenters[staticZoneCount * 2 + 1] = py
        warpRadii[staticZoneCount] = zone.radius
        warpStrengths[staticZoneCount] = zone.strength
        warpFalloffs[staticZoneCount] = zone.falloff
        staticZoneCount += 1
      }
      gl.uniform2fv(uniforms.u_warpCenters, warpCenters)
      gl.uniform1fv(uniforms.u_warpRadii, warpRadii)
      gl.uniform1fv(uniforms.u_warpStrengths, warpStrengths)
      gl.uniform1fv(uniforms.u_warpFalloffs, warpFalloffs)
      gl.uniform1i(uniforms.u_warpCount, staticZoneCount)

      ripplePositions.fill(0)
      rippleAges.fill(0)
      const rippleCount = ripples.length
      for (let i = 0; i < rippleCount; i++) {
        ripplePositions[i * 2] = ripples[i].x
        ripplePositions[i * 2 + 1] = ripples[i].y
        rippleAges[i] = ripples[i].age
      }
      gl.uniform2fv(uniforms.u_ripples, ripplePositions)
      gl.uniform1fv(uniforms.u_rippleAges, rippleAges)
      gl.uniform1i(uniforms.u_rippleCount, rippleCount)
      gl.uniform1f(uniforms.u_rippleRadius, clickEmitter?.radius ?? 0)
      gl.uniform1f(uniforms.u_rippleStrength, clickEmitter?.strength ?? 0)
      gl.uniform1f(uniforms.u_rippleFalloff, clickEmitter?.falloff ?? 1)
      gl.uniform1f(uniforms.u_rippleLifetime, RIPPLE_LIFETIME_SEC)
      gl.uniform1f(uniforms.u_rippleFrequency, RIPPLE_RING_FREQUENCY)
      gl.uniform1f(uniforms.u_rippleSpeed, RIPPLE_RING_SPEED)

      const cardEl = cur.cardRef?.current
      if (cardEl && cur.cardWellEnabled) {
        const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
        const canvasRect = canvas.getBoundingClientRect()
        const cardRect = cardEl.getBoundingClientRect()
        const cardCssCenterX = cardRect.left + cardRect.width / 2 - canvasRect.left
        const cardCssCenterY = cardRect.top + cardRect.height / 2 - canvasRect.top
        gl.uniform2f(
          uniforms.u_cardCenter,
          cardCssCenterX * dpr,
          canvas.height - cardCssCenterY * dpr
        )
        gl.uniform2f(
          uniforms.u_cardHalfSize,
          (cardRect.width / 2) * dpr,
          (cardRect.height / 2) * dpr
        )
        gl.uniform1f(uniforms.u_cardRadius, cur.cardCornerRadius * dpr)
        gl.uniform1f(uniforms.u_cardFalloff, cur.cardFalloff * dpr)
        gl.uniform1f(uniforms.u_cardActive, 1)
      } else {
        gl.uniform1f(uniforms.u_cardActive, 0)
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    requestRenderRef.current = requestRender

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener("pointerdown", handlePointerDown)

    const handleVisibility = () => {
      if (document.hidden) {
        if (rafId !== 0) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
      } else {
        requestRender()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      requestRenderRef.current = null
      if (rafId !== 0) cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("visibilitychange", handleVisibility)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [maxDpr, prefersReducedMotion])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  )
}
