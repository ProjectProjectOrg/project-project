const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export const cellSize = (size: number) => (size <= 24 ? 2 : size <= 48 ? 3 : 4)

export const threshold = (x: number, y: number) =>
  (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
