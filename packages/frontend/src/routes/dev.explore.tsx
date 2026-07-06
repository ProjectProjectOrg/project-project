import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import logoRaw from "@/public/logo/logo.svg?raw"

export const Route = createFileRoute("/dev/explore")({
  component: ExplorePage
})

type LogoPath = { d: string; fill: string }

const parsed = new DOMParser().parseFromString(logoRaw, "image/svg+xml")
const VIEWBOX =
  parsed.querySelector("svg")?.getAttribute("viewBox") ?? "0 0 245 245"
const PATHS: LogoPath[] = Array.from(parsed.querySelectorAll("path")).map(
  (p) => ({
    d: p.getAttribute("d") ?? "",
    fill: p.getAttribute("fill") ?? "#FEFEFE"
  })
)
const LOGO_DATA_URI = `data:image/svg+xml;base64,${btoa(logoRaw)}`

const STYLES = `
.exp svg { width: 100%; height: 100%; overflow: visible; }

@keyframes exp-draw {
  0% { stroke-dashoffset: 1; fill-opacity: 0; }
  45% { stroke-dashoffset: 0; fill-opacity: 0; }
  60% { fill-opacity: 1; }
  85% { fill-opacity: 1; stroke-dashoffset: 0; }
  100% { fill-opacity: 0; stroke-dashoffset: 1; }
}
.exp-draw path {
  fill-opacity: 0;
  stroke: currentColor;
  stroke-width: 2;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: exp-draw 3.4s ease-in-out infinite;
}

@keyframes exp-assemble {
  0% { opacity: 0; transform: translateY(10px) scale(0.6); }
  55% { opacity: 1; transform: translateY(0) scale(1); }
  85% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(0) scale(1); }
}
.exp-assemble path {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: exp-assemble 2.6s ease-in-out infinite;
}

@keyframes exp-wave {
  0%, 100% { opacity: 0.25; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
}
.exp-wave path {
  transform-box: fill-box;
  transform-origin: center;
  animation: exp-wave 1.6s ease-in-out infinite;
}

.exp-sheen path { fill: url(#exp-sheen-grad); }

@keyframes exp-shimmer-move {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
.exp-shimmer {
  position: relative;
}
.exp-shimmer path { fill: #4a4a4a; }
.exp-shimmer .exp-shimmer-band {
  position: absolute;
  inset: 0;
  -webkit-mask: var(--logo-mask) center / contain no-repeat;
  mask: var(--logo-mask) center / contain no-repeat;
  overflow: hidden;
}
.exp-shimmer .exp-shimmer-band::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    #ffffff 50%,
    transparent 70%
  );
  animation: exp-shimmer-move 1.8s linear infinite;
}
`

function LogoSvg({
  className,
  defs
}: {
  className?: string
  defs?: React.ReactNode
}) {
  return (
    <svg viewBox={VIEWBOX} className={className}>
      {defs}
      {PATHS.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill}
          pathLength={1}
          style={{ animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </svg>
  )
}

function LogoDissolve() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true
    })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(
      prog,
      compile(
        gl.VERTEX_SHADER,
        `attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}`
      )
    )
    gl.attachShader(
      prog,
      compile(
        gl.FRAGMENT_SHADER,
        `precision mediump float;varying vec2 v;uniform sampler2D u_img;uniform float u_p;
         float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
         void main(){
           vec2 uv=vec2(v.x,1.-v.y);
           vec4 c=texture2D(u_img,uv);
           float n=hash(floor(uv*40.0));
           float edge=smoothstep(n-0.15,n+0.15,u_p);
           float alpha=c.a*edge;
           gl_FragColor=vec4(c.rgb*alpha,alpha);
         }`
      )
    )
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const a = gl.getAttribLocation(prog, "a")
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    )

    const uP = gl.getUniformLocation(prog, "u_p")
    let raf = 0
    let start = 0
    let ready = false

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = Math.round(160 * dpr)
    canvas.width = size
    canvas.height = size
    gl.viewport(0, 0, size, size)

    const img = new Image()
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      ready = true
    }
    img.src = LOGO_DATA_URI

    const tri = (x: number) => {
      const f = x - Math.floor(x)
      return f < 0.5 ? f * 2 : 2 - f * 2
    }
    const frame = (t: number) => {
      if (!start) start = t
      if (ready) {
        gl.uniform1f(uP, tri((t - start) / 2600))
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [])
  return <canvas ref={canvasRef} style={{ width: 160, height: 160 }} />
}

const logoMask = `url("${LOGO_DATA_URI}")`

function Cell({
  label,
  tech,
  children
}: {
  label: string
  tech: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex size-40 items-center justify-center rounded-lg bg-neutral-950 text-[#FEFEFE]">
        {children}
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-muted-foreground text-xs">{tech}</div>
      </div>
    </div>
  )
}

function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <style>{STYLES}</style>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Logo loader explorations</h1>
        <p className="text-muted-foreground text-sm">
          Six ways to animate the real logo, CSS → SVG → GLSL.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        <Cell label="Draw-on" tech="SVG stroke-dashoffset">
          <div className="exp exp-draw size-28">
            <LogoSvg />
          </div>
        </Cell>

        <Cell label="Assemble" tech="CSS staggered scale/fade">
          <div className="exp exp-assemble size-28">
            <LogoSvg />
          </div>
        </Cell>

        <Cell label="Wave" tech="CSS positional pulse">
          <div className="exp exp-wave size-28">
            <LogoSvg />
          </div>
        </Cell>

        <Cell label="Sheen" tech="SVG animated gradient">
          <div className="exp exp-sheen size-28">
            <LogoSvg
              defs={
                <defs>
                  <linearGradient
                    id="exp-sheen-grad"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop offset="0" stopColor="#6b6b6b" />
                    <stop offset="0.5" stopColor="#ffffff" />
                    <stop offset="1" stopColor="#6b6b6b" />
                    <animateTransform
                      attributeName="gradientTransform"
                      type="translate"
                      from="-1 0"
                      to="1 0"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                  </linearGradient>
                </defs>
              }
            />
          </div>
        </Cell>

        <Cell label="Shimmer" tech="CSS mask sweep">
          <div
            className="exp-shimmer size-28"
            style={{ "--logo-mask": logoMask } as React.CSSProperties}
          >
            <div className="exp size-full">
              <LogoSvg />
            </div>
            <div className="exp-shimmer-band" />
          </div>
        </Cell>

        <Cell label="Dissolve" tech="GLSL noise threshold">
          <LogoDissolve />
        </Cell>
      </div>
    </div>
  )
}
