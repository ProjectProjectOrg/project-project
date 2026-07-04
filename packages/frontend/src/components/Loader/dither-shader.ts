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
uniform bool u_inverted;
uniform vec4 u_colorFront;
uniform vec4 u_colorHighlight;
uniform vec4 u_colorBack;
varying vec2 v_uv;

float bayer2x2(vec2 p) {
  vec2 c = fract(p / 2.0) * 2.0;
  int idx = int(c.y) * 2 + int(c.x);
  if (idx == 0) return 0.0 / 4.0;
  if (idx == 1) return 2.0 / 4.0;
  if (idx == 2) return 3.0 / 4.0;
  return 1.0 / 4.0;
}

void main() {
  vec2 pxSizeUV = (gl_FragCoord.xy - 0.5 * u_resolution) / u_pxSize;
  vec2 pixelized = (floor(pxSizeUV) + 0.5) * u_pxSize;
  vec2 uv = pixelized / u_resolution + 0.5;

  vec4 image = texture2D(u_image, uv);
  float lum = dot(vec3(0.2126, 0.7152, 0.0722), image.rgb);
  lum = u_inverted ? (1.0 - lum) : lum;

  float dithering = bayer2x2(pxSizeUV) - 0.5;
  float colorSteps = max(floor(u_colorSteps), 1.0);
  float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);
  brightness = mix(0.0, brightness, image.a);
  float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;

  vec3 color;
  float opacity;
  if (u_originalColors) {
    vec3 normColor = image.rgb / max(lum, 0.001);
    color = normColor * quantLum;
    float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
    opacity = mix(quantLum, 1.0, quantAlpha);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float hlOpacity = u_colorHighlight.a;

    float hl = step(1.02 - 0.02 * colorSteps, brightness);
    fgColor = mix(fgColor, hlColor, hl);
    fgOpacity = mix(fgOpacity, hlOpacity, hl);

    color = fgColor * quantLum;
    opacity = fgOpacity * quantLum;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
  }

  gl_FragColor = vec4(color, opacity);
}
`

export type DitherUniforms = {
  colorSteps: number
  originalColors: boolean
  inverted: boolean
  colorFront: [number, number, number, number]
  colorHighlight: [number, number, number, number]
  colorBack: [number, number, number, number]
}

export const DEFAULT_UNIFORMS: DitherUniforms = {
  colorSteps: 2,
  originalColors: false,
  inverted: false,
  colorFront: [148 / 255, 1, 175 / 255, 1],
  colorHighlight: [234 / 255, 1, 148 / 255, 1],
  colorBack: [0, 0, 0, 0]
}
