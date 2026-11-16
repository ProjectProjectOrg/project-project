const LIST_PATH =
  /^\/api\/orgs\/[^/]+\/projects\/[^/]+\/tickets\/(?:(sections|sprint-sections|epic-sections|parent-sections|titles|count)|[^/]+\/(sequence))$/

export const listEndpointOf = (pathname: string): string | null => {
  const match = LIST_PATH.exec(pathname)
  if (match === null) return null
  return match[1] ?? match[2] ?? null
}
