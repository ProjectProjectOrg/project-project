// Dithering algorithm adapted from @paper-design/shaders (image-dithering),
// licensed under Apache-2.0. https://github.com/paper-design/shaders

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
