import { useEffect, useRef } from "react"
import {
  FRAGMENT_SRC,
  VERTEX_SRC,
  type DitherUniforms
} from "./dither-shader"
import { drawLogo } from "./logo-canvas"

type DitherCanvasProps = {
  getFrame: (elapsedMs: number) => { p: number; persp: number }
  paused?: boolean
  uniforms: DitherUniforms
  ditherCells?: number
  className?: string
  style?: React.CSSProperties
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
  getFrame,
  paused = false,
  uniforms,
  ditherCells = 30,
  className,
  style
}: DitherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const getFrameRef = useRef(getFrame)
  const uniformsRef = useRef(uniforms)
  const pausedRef = useRef(paused)
  const cellsRef = useRef(ditherCells)
  getFrameRef.current = getFrame
  uniformsRef.current = uniforms
  pausedRef.current = paused
  cellsRef.current = ditherCells

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
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
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uImage = u("u_image")
    const uRes = u("u_resolution")
    const uPx = u("u_pxSize")
    const uSteps = u("u_colorSteps")
    const uOrig = u("u_originalColors")
    const uInv = u("u_inverted")
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
      const { p, persp } = getFrameRef.current(elapsed)

      drawLogo(octx, p, persp, w, h)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off)

      const un = uniformsRef.current
      gl.uniform1i(uImage, 0)
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uPx, Math.max(1, w / cellsRef.current))
      gl.uniform1f(uSteps, un.colorSteps)
      gl.uniform1i(uOrig, un.originalColors ? 1 : 0)
      gl.uniform1i(uInv, un.inverted ? 1 : 0)
      gl.uniform4fv(uFront, un.colorFront)
      gl.uniform4fv(uHigh, un.colorHighlight)
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
    }
  }, [])

  return <canvas ref={canvasRef} className={className} style={style} />
}
