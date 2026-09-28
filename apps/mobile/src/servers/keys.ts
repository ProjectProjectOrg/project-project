export const serverKeys = {
  catalog: () => ["servers:catalog"] as const,
  lastUsed: () => ["servers:last-used"] as const,
  session: (instanceId: string) => [`servers:${instanceId}:session`] as const
}
