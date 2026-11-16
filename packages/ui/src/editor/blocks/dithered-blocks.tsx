const CELL = 8
const COLS = 11
const ROWS = 8

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

const FG = "var(--foreground, #FEFEFE)"
const MUTED = "var(--muted-foreground, #807F7F)"

type Shelf = Readonly<{ row: number; icon: number; bar: number; width: number }>

const SHELVES: ReadonlyArray<Shelf> = [
  { row: 0, icon: 16, bar: 13, width: 7 },
  { row: 3, icon: 12, bar: 8, width: 8 },
  { row: 6, icon: 6, bar: 4, width: 6 }
]

type Tile = Readonly<{ x: number; y: number; color: string }>

const lit = (x: number, y: number, level: number) => BAYER[y % 4][x % 4] < level

const shelfTiles = (shelf: Shelf): ReadonlyArray<Tile> =>
  [shelf.row, shelf.row + 1].flatMap((y) => [
    ...[0, 1].flatMap((x) =>
      lit(x, y, shelf.icon) ? [{ x, y, color: FG }] : []
    ),
    ...Array.from({ length: shelf.width }, (_, index) => index + 3).flatMap(
      (x) => (lit(x, y, shelf.bar) ? [{ x, y, color: MUTED }] : [])
    )
  ])

const TILES: ReadonlyArray<Tile> = SHELVES.flatMap(shelfTiles)

export function DitheredBlocks({
  size = 96,
  className
}: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg
      width={size}
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      role="img"
      aria-hidden
      className={className}
    >
      {TILES.map((tile) => (
        <rect
          key={`${tile.x}:${tile.y}`}
          x={tile.x * CELL}
          y={tile.y * CELL}
          width={CELL}
          height={CELL}
          fill={tile.color}
        />
      ))}
    </svg>
  )
}
