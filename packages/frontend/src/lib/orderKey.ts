export const compareByOrderKey = <T extends { orderKey: string }>(
  a: T,
  b: T
): number => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)
