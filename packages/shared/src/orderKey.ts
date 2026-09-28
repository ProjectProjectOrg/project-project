import * as Order from "effect/Order"

export const compareCodePoints = Order.make<string>((a, b) => {
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
})

export const compareByOrderKey = Order.mapInput(
  Order.String,
  (item: Readonly<{ orderKey: string }>) => item.orderKey
)
