export const proofUrl = (requestPath: string, resource: string) => {
  const url = new URL(requestPath, resource)
  return `${url.origin}${url.pathname}`
}
