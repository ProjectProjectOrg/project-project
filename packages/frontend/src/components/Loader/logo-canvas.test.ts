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
