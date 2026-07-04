import { describe, expect, it, vi } from "vitest"
import { drawLogo } from "./logo-canvas"

function fakeCtx() {
  const grad = { addColorStop: vi.fn() }
  return {
    grad,
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => grad),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    set fillStyle(_v: unknown) {}
  }
}

describe("drawLogo", () => {
  it("clears then fills two gradient panels", () => {
    const ctx = fakeCtx()
    drawLogo(ctx as unknown as CanvasRenderingContext2D, 0.5, 0.5, 200, 200)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200)
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(2)
    expect(ctx.createLinearGradient).toHaveBeenNthCalledWith(1, 100, 0, 0, 0)
    expect(ctx.createLinearGradient).toHaveBeenNthCalledWith(2, 100, 0, 200, 0)
    expect(ctx.fill).toHaveBeenCalledTimes(2)
    expect(ctx.grad.addColorStop).toHaveBeenCalledWith(0, "#ffffff")
    expect(ctx.grad.addColorStop).toHaveBeenCalledWith(1, "#000000")
  })
})
