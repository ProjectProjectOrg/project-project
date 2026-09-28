import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  Skia,
  type SkImage
} from "@shopify/react-native-skia"
import { useMemo, useState } from "react"
import { type LayoutRectangle, View } from "react-native"
import { useCSSVariable } from "uniwind"

// The web's dithered noise field (apps/frontend/src/components/ui/dither.tsx),
// with the login page's settings. It's static, so it's drawn once per layout
// and theme. Every 3 pt cell shares one value, so the shader runs once per
// cell into a small offscreen image that's scaled up with nearest sampling:
// about 40k shader evaluations on a phone instead of millions of pixels.
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
uniform float4 u_well;
uniform float2 u_wellShape;
uniform half4 u_front;
uniform half4 u_back;

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
  float shape = smoothstep(edge, 1.0 - edge, clamp(n + u_bias, 0.0, 1.0));

  if (u_well.z > 0.0) {
    float sdf = roundedBoxSdf(cell - u_well.xy, u_well.zw, u_wellShape.x);
    shape -= 1.0 - smoothstep(0.0, u_wellShape.y, sdf);
  }

  return step(0.5, shape + bayer4(cell) - 0.5) > 0.5 ? u_front : u_back;
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

type Size = Readonly<{ width: number; height: number }>

const renderField = (
  size: Size,
  well: LayoutRectangle | undefined,
  front: string,
  back: string
) => {
  if (field === null) return null
  const cols = Math.ceil(size.width / cellSize)
  const rows = Math.ceil(size.height / cellSize)
  // Skia aborts instead of failing on an empty texture, and the first layout
  // pass can report a zero size.
  if (cols < 1 || rows < 1) return null
  const surface = Skia.Surface.MakeOffscreen(cols, rows)
  if (surface === null) return null
  const wellCells =
    well === undefined
      ? [0, 0, 0, 0]
      : [
          (well.x + well.width / 2) / cellSize,
          (well.y + well.height / 2) / cellSize,
          well.width / 2 / cellSize,
          well.height / 2 / cellSize
        ]
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
      login.zone.falloff,
      ...wellCells,
      login.wellRadius / cellSize,
      login.wellFalloff / cellSize,
      ...Skia.Color(front),
      ...Skia.Color(back)
    ])
  )
  surface.getCanvas().drawPaint(paint)
  surface.flush()
  return surface.makeImageSnapshot().makeNonTextureImage()
}

export function Dither({
  well,
  className
}: Readonly<{ well?: LayoutRectangle; className?: string }>) {
  const [size, setSize] = useState<Size | null>(null)
  const [front, back] = useCSSVariable([
    "--color-dither-front",
    "--color-dither-back"
  ])
  const image = useMemo<SkImage | null>(
    () =>
      size === null || front === undefined || back === undefined
        ? null
        : renderField(size, well, String(front), String(back)),
    [size, well, front, back]
  )
  return (
    <View
      pointerEvents="none"
      className={className}
      onLayout={({ nativeEvent }) =>
        setSize({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height
        })
      }
    >
      {image === null || size === null ? null : (
        <Canvas style={{ flex: 1 }}>
          <Image
            image={image}
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fit="fill"
            sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
          />
        </Canvas>
      )}
    </View>
  )
}
