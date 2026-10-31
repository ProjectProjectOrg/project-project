export declare const SHADES: ReadonlyArray<string>

export declare function meter(
  value: number,
  cap: number,
  options?: Readonly<{ width?: number; label?: string; maxWidth?: number }>
): string

export declare function barChart(
  rows: ReadonlyArray<Readonly<{ label: string; value: number; text?: string }>>,
  options?: Readonly<{
    width?: number
    max?: number
    empty?: string
    maxWidth?: number
  }>
): string

export declare function heatmap(
  grid: ReadonlyArray<ReadonlyArray<number>>,
  options?: Readonly<{
    rowLabels?: ReadonlyArray<string>
    colLabels?: string
    levels?: ReadonlyArray<string>
    cellWidth?: number
    maxWidth?: number
  }>
): string
