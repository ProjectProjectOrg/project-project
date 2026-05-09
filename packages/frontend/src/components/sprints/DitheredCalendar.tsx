// 2-color stepped/dithered calendar mark using the project's brand vocabulary
// (#FEFEFE foreground + #807F7F muted-foreground), drawn as ordered-dither squares.
export function DitheredCalendar({
  size = 96,
  className
}: {
  size?: number
  className?: string
}) {
  const cell = 8
  const cols = 9
  const rows = 8
  const w = cols * cell
  const h = rows * cell

  const FG = "var(--foreground, #FEFEFE)"
  const MUTED = "var(--muted-foreground, #807F7F)"

  // Bayer-ish 4x4 ordered dither mask
  const mask = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ]
  const fill = (x: number, y: number, level: number) => {
    return mask[y % 4][x % 4] < level
  }

  const tiles: Array<{ x: number; y: number; color: string }> = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Header band on row 0–1
      if (y < 2) {
        if (fill(x, y, 14)) tiles.push({ x, y, color: MUTED })
      } else {
        // Dotted day grid: place a tile at every 2nd column / 2nd row
        if (x % 2 === 0 && y % 2 === 0) {
          tiles.push({ x, y, color: FG })
        } else if (fill(x, y, 4)) {
          tiles.push({ x, y, color: MUTED })
        }
      }
    }
  }

  return (
    <svg
      width={size}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-hidden
      className={className}
    >
      {tiles.map((t, i) => (
        <rect
          key={i}
          x={t.x * cell}
          y={t.y * cell}
          width={cell}
          height={cell}
          fill={t.color}
        />
      ))}
    </svg>
  )
}
