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
