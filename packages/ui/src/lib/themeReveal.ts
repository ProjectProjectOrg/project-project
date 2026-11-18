export function getThemeRevealRadius(
  x: number,
  y: number,
  width: number,
  height: number
) {
  const horizontal = Math.max(x, width - x)
  const vertical = Math.max(y, height - y)

  return Math.hypot(horizontal, vertical)
}

/**
 * Sets where the theme reveal's circle starts and how far it grows, as
 * percentages of the viewport. The circle clips the page snapshot, which the
 * browser can scale (by the device pixel ratio, or to the scrolled
 * document), so pixel values land in the wrong place; percentages follow the
 * snapshot whatever its scale.
 */
export function setThemeRevealOrigin(x: number, y: number) {
  const width = window.innerWidth
  const height = window.innerHeight
  // A circle() radius percentage is measured against the reference box's
  // diagonal divided by √2.
  const unit = Math.hypot(width, height) / Math.SQRT2
  const radius = getThemeRevealRadius(x, y, width, height) / unit
  const root = document.documentElement
  root.style.setProperty("--theme-clip-x", `${(x / width) * 100}%`)
  root.style.setProperty("--theme-clip-y", `${(y / height) * 100}%`)
  root.style.setProperty("--theme-clip-radius", `${radius * 100}%`)
}
