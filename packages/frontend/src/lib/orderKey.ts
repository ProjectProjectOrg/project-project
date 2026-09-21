export const compareCodePoints = (a: string, b: string): number => {
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < a.length && rightIndex < b.length) {
    const leftCodePoint = a.codePointAt(leftIndex)!
    const rightCodePoint = b.codePointAt(rightIndex)!
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1
    }
    leftIndex += leftCodePoint > 0xffff ? 2 : 1
    rightIndex += rightCodePoint > 0xffff ? 2 : 1
  }
  return leftIndex === a.length && rightIndex === b.length
    ? 0
    : leftIndex === a.length
      ? -1
      : 1
}

export const compareByOrderKey = <T extends { orderKey: string }>(
  a: T,
  b: T
): number => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)
