export type PageSlot = number | "gap"

export const pageCount = (total: number, pageSize: number): number =>
  total <= 0 ? 1 : Math.ceil(total / pageSize)

export const pageRange = (input: {
  readonly page: number
  readonly pageSize: number
  readonly total: number
}): { readonly from: number; readonly to: number } => {
  if (input.total <= 0) return { from: 0, to: 0 }
  const from = (input.page - 1) * input.pageSize + 1
  return { from, to: Math.min(input.page * input.pageSize, input.total) }
}

export const pageWindow = (input: {
  readonly page: number
  readonly pages: number
  readonly span: number
}): ReadonlyArray<PageSlot> => {
  const { page, pages, span } = input
  if (pages <= span) {
    return Array.from({ length: pages }, (_, index) => index + 1)
  }

  const inner = span - 2
  const half = Math.floor((inner - 1) / 2)
  let start = page - half
  let end = start + inner - 1

  if (start <= 2) {
    start = 2
    end = start + inner - 1
  }
  if (end >= pages - 1) {
    end = pages - 1
    start = end - inner + 1
  }

  const slots: Array<PageSlot> = [1]
  if (start > 2) {
    slots.push("gap")
    start += 1
  }
  const trailingGap = end < pages - 1
  if (trailingGap) end -= 1
  for (let value = start; value <= end; value++) slots.push(value)
  if (trailingGap) slots.push("gap")
  slots.push(pages)
  return slots
}
