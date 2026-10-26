import { m } from "@/paraglide/messages"

export const deletePrompt = (input: {
  readonly count: number
  readonly referenced: number
}): string => {
  if (input.referenced === 0) {
    return input.count === 1
      ? m.attachments_delete_confirm()
      : m.attachments_delete_selected_confirm({ count: input.count })
  }
  if (input.count === 1) {
    return input.referenced === 1
      ? m.attachments_delete_confirm_referenced_one()
      : m.attachments_delete_confirm_referenced_many({
          count: input.referenced
        })
  }
  return input.referenced === 1
    ? m.attachments_delete_selected_confirm_referenced_one({
        count: input.count
      })
    : m.attachments_delete_selected_confirm_referenced_many({
        count: input.count,
        referenced: input.referenced
      })
}
