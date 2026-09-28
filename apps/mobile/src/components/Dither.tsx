import {
  Canvas,
  FilterMode,
  Fill,
  ImageShader,
  MipmapMode,
  Shader,
  Skia,
  type SkImage
} from "@shopify/react-native-skia"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { type DerivedValue, useDerivedValue } from "react-native-reanimated"
import { useCSSVariable } from "uniwind"

// The web's dithered noise field (apps/frontend/src/components/ui/dither.tsx),
// with the login page's settings, in two passes. The noise is static, so it's
// drawn once per layout: every 3 pt cell shares one value, so the shader runs
// once per cell into a small image, about 40k evaluations on a phone instead
// of millions of pixels. That image is drawn on the CPU: Skia runs the shader
// there in about 200 ms, where the GPU first spends seconds compiling it into
// a Metal pipeline, and the welcome screen can't start until it's there.
// The ground pass reads that image per cell and adds what moves: the well,
// the reveal and the Bayer shading. It's a texture read and a few sums per
// pixel, so it can run every frame.
const field = Skia.RuntimeEffect.Make(`
uniform float2 u_resolution;
uniform float u_octaves;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_lacunarity;
uniform float u_rotation;
uniform float u_warpStrength;
uniform float u_contrast;
uniform float u_bias;
uniform float3 u_zone;

float3 mod289_3(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float4 mod289_4(float4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float4 permute4(float4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
float4 taylorInvSqrt(float4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(float3 v) {
  const float2 C = float2(1.0 / 6.0, 1.0 / 3.0);
  const float4 D = float4(0.0, 0.5, 1.0, 2.0);
  float3 i = floor(v + dot(v, C.yyy));
  float3 x0 = v - i + dot(i, C.xxx);
  float3 g = step(x0.yzx, x0.xyz);
  float3 l = 1.0 - g;
  float3 i1 = min(g.xyz, l.zxy);
  float3 i2 = max(g.xyz, l.zxy);
  float3 x1 = x0 - i1 + C.xxx;
  float3 x2 = x0 - i2 + C.yyy;
  float3 x3 = x0 - D.yyy;
  i = mod289_3(i);
  float4 p = permute4(permute4(permute4(
    i.z + float4(0.0, i1.z, i2.z, 1.0))
    + i.y + float4(0.0, i1.y, i2.y, 1.0))
    + i.x + float4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  float3 ns = n_ * D.wyz - D.xzx;
  float4 j = p - 49.0 * floor(p * ns.z * ns.z);
  float4 x_ = floor(j * ns.z);
  float4 y_ = floor(j - 7.0 * x_);
  float4 x = x_ * ns.x + ns.yyyy;
  float4 y = y_ * ns.x + ns.yyyy;
  float4 h = 1.0 - abs(x) - abs(y);
  float4 b0 = float4(x.xy, y.xy);
  float4 b1 = float4(x.zw, y.zw);
  float4 s0 = floor(b0) * 2.0 + 1.0;
  float4 s1 = floor(b1) * 2.0 + 1.0;
  float4 sh = -step(h, float4(0.0));
  float4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  float4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  float3 p0 = float3(a0.xy, h.x);
  float3 p1 = float3(a0.zw, h.y);
  float3 p2 = float3(a1.xy, h.z);
  float3 p3 = float3(a1.zw, h.w);
  float4 norm = taylorInvSqrt(float4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  float4 m = max(0.6 - float4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, float4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(float3 p) {
  float v = 0.0;
  float a = 1.0;
  float total = 0.0;
  float2x2 rot = float2x2(cos(u_rotation), sin(u_rotation), -sin(u_rotation), cos(u_rotation));
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_octaves) break;
    v += a * (0.5 + 0.5 * snoise3(p));
    total += a;
    p.xy = rot * p.xy * u_lacunarity;
    a *= u_amplitude;
  }
  return total > 0.0 ? v / total : 0.0;
}

half4 main(float2 cell) {
  float2 uv = cell / u_resolution - 0.5;
  uv.x *= u_resolution.x / u_resolution.y;

  float zone = 1.0 - smoothstep(0.0, u_zone.x, length(uv));
  float t = u_zone.y * pow(zone, u_zone.z);

  float3 p = float3(uv * u_frequency, t);
  float2 q = float2(fbm(p), fbm(p + float3(5.2, 1.3, 0.7))) - 0.5;
  p.xy += q * u_warpStrength;
  float n = fbm(p);

  float edge = clamp(0.5 - u_contrast, 0.0, 0.5);
  return half4(half3(smoothstep(edge, 1.0 - edge, clamp(n + u_bias, 0.0, 1.0))), 1.0);
}
`)

// The field's shape per cell, put on the dither colours. The well clears the
// texture around the content and fades into it. While u_reveal runs from 0
// to 1 the texture spreads outward from the well's edge, over u_spread cells,
// so it grows out of whatever the well holds.
// A second well, u_next, is the next step's content: a tight well that keeps
// its text clear, and around it the texture thins out, sparse near the
// content and dense at the edges. It thins by shrinking the texture's blobs,
// not by dimming it: a dimmed field leaves wide areas on the Bayer matrix's
// lowest levels, which read as a rigid grid of dots and lines. The well's
// edge is pushed in and out by the field too, so it follows the texture
// instead of running straight. The texture never moves between the two.
// As u_step runs from 0 to 1, blocks of 2x2 cells switch from the first look
// to the next in Bayer order, 16 steps, like a 1-bit screen dissolving.
const ground = Skia.RuntimeEffect.Make(`
uniform shader field;
uniform float2 u_cells;
uniform float u_cellSize;
uniform float4 u_well;
uniform float2 u_wellShape;
uniform float u_reveal;
uniform float u_spread;
uniform half4 u_front;
uniform half4 u_back;
uniform float4 u_next;
uniform float3 u_nextShape;
uniform float u_step;

// Same values as the web's 4x4 Bayer table, computed instead of indexed.
float bayer2(float2 a) {
  a = floor(a);
  return fract(dot(a, float2(0.5, a.y * 0.75)));
}
float bayer4(float2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

float roundedBoxSdf(float2 p, float2 b, float r) {
  r = min(r, min(b.x, b.y));
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0))) - r;
}

half4 main(float2 point) {
  float2 cell = floor(point / u_cellSize);
  float shape = field.eval(cell + 0.5).r;
  float threshold = bayer4(cell) - 0.5;

  float sdf = roundedBoxSdf(cell - u_well.xy, u_well.zw, u_wellShape.x);
  float reach = u_reveal * (length(u_cells) + u_spread);
  shape *= clamp((reach - max(sdf, 0.0)) / u_spread, 0.0, 1.0);
  float first = shape - (1.0 - smoothstep(0.0, u_wellShape.y, sdf));
  bool on = step(0.5, first + threshold) > 0.5;

  if (u_step > 0.0) {
    float nextSdf = roundedBoxSdf(cell - u_next.xy, u_next.zw, u_wellShape.x)
      - (shape - 0.5) * u_nextShape.x * 1.5;
    float sparse = 1.0 - smoothstep(0.0, u_nextShape.y, max(nextSdf, 0.0));
    float cut = u_nextShape.z * sparse;
    float thinned = mix(shape, smoothstep(cut, cut + 0.15, shape), sparse);
    float next = thinned - (1.0 - smoothstep(0.0, u_nextShape.x, nextSdf));
    if (bayer4(floor(cell / 2.0)) < u_step) on = step(0.5, next + threshold) > 0.5;
  }

  return on ? u_front : u_back;
}
`)

const cellSize = 3

const login = {
  octaves: 7,
  frequency: 2.2,
  amplitude: 0.52,
  lacunarity: 2.2,
  rotation: 0.5,
  warpStrength: 1.32,
  contrast: 0.2,
  bias: -0.07,
  zone: { radius: 0.77, strength: 3, falloff: 4.85 },
  wellFalloff: 80,
  wellRadius: 16
} as const

// How far behind its front the revealed texture reaches full strength.
const spread = 240

export type DitherWell = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

type Grid = Readonly<{ cols: number; rows: number }>

// A well as the shader takes it: its centre and half size, in cells.
const wellUniform = (box: DitherWell) => {
  "worklet"
  return [
    (box.x + box.width / 2) / cellSize,
    (box.y + box.height / 2) / cellSize,
    box.width / 2 / cellSize,
    box.height / 2 / cellSize
  ]
}

// A plain array, so the uniforms can be copied to the UI thread.
const colorUniform = (color: string) => Array.from(Skia.Color(color))

const renderField = ({ cols, rows }: Grid) => {
  if (field === null) return null
  // Skia aborts instead of failing on an empty texture, and the first layout
  // pass can report a zero size.
  if (cols < 1 || rows < 1) return null
  const surface = Skia.Surface.Make(cols, rows)
  if (surface === null) return null
  const paint = Skia.Paint()
  paint.setShader(
    field.makeShader([
      cols,
      rows,
      login.octaves,
      login.frequency,
      login.amplitude,
      login.lacunarity,
      login.rotation,
      login.warpStrength,
      login.contrast,
      login.bias,
      login.zone.radius,
      login.zone.strength,
      login.zone.falloff
    ])
  )
  surface.getCanvas().drawPaint(paint)
  return surface.makeImageSnapshot()
}

// Around the next step's content: how far its tight well fades, how far out
// the texture thins, and how much it thins right by the content.
const next = { falloff: 24, thinReach: 220, thinDepth: 0.4 } as const

// `well` is in the dither's own coordinates. `reveal` runs from 0, the bare
// dither-back ground, to 1, the full field. `next` is the next step's
// content and how far the dissolve to it has gone, from 0 to 1.
export function Dither({
  well,
  reveal,
  next: nextStep,
  className
}: Readonly<{
  well: DerivedValue<DitherWell>
  reveal: DerivedValue<number>
  next?: Readonly<{
    well: DerivedValue<DitherWell>
    step: DerivedValue<number>
  }>
  className?: string
}>) {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [front, back] = useCSSVariable([
    "--color-dither-front",
    "--color-dither-back"
  ])
  const image = useMemo<SkImage | null>(
    () => (grid === null ? null : renderField(grid)),
    [grid]
  )
  const colors = useMemo(
    () =>
      front === undefined || back === undefined
        ? null
        : {
            u_front: colorUniform(String(front)),
            u_back: colorUniform(String(back))
          },
    [front, back]
  )
  const uniforms = useDerivedValue(() => {
    const box = well.value
    const nextBox = nextStep?.well.value ?? box
    return {
      u_cells: grid === null ? [0, 0] : [grid.cols, grid.rows],
      u_cellSize: cellSize,
      u_well: wellUniform(box),
      u_wellShape: [login.wellRadius / cellSize, login.wellFalloff / cellSize],
      u_next: wellUniform(nextBox),
      u_nextShape: [
        next.falloff / cellSize,
        next.thinReach / cellSize,
        next.thinDepth
      ],
      u_step: nextStep?.step.value ?? 0,
      u_reveal: reveal.value,
      u_spread: spread / cellSize,
      ...colors
    }
  })
  return (
    <View
      pointerEvents="none"
      className={className}
      onLayout={({ nativeEvent }) =>
        setGrid({
          cols: Math.ceil(nativeEvent.layout.width / cellSize),
          rows: Math.ceil(nativeEvent.layout.height / cellSize)
        })
      }
    >
      {ground === null || image === null || colors === null ? null : (
        <Canvas style={{ flex: 1 }}>
          <Fill>
            <Shader source={ground} uniforms={uniforms}>
              <ImageShader
                image={image}
                sampling={{
                  filter: FilterMode.Nearest,
                  mipmap: MipmapMode.None
                }}
              />
            </Shader>
          </Fill>
        </Canvas>
      )}
    </View>
  )
}
