import type { TicketId } from "@pp/shared"

export const ticketContentKey = ({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) =>
  `${orgSlug}/${slug}/${id}`

export function rememberPreloaded<K, V>(
  preloaded: Map<K, V>,
  key: K,
  value: V,
  limit: number
) {
  preloaded.delete(key)
  preloaded.set(key, value)
  const evicted: Array<V> = []
  for (const [oldest, keys] of preloaded) {
    if (preloaded.size <= limit) break
    preloaded.delete(oldest)
    evicted.push(keys)
  }
  return evicted
}
