import {
  metadataResponse,
  type ResourceServerMetadata
} from "@better-auth/oauth-provider"
import type { BetterAuthPlugin } from "better-auth"

type ProtectedResourceInput = Readonly<{
  identifier: string
  name: string
}>

export const protectedResourceMetadataUrl = (resource: string) => {
  const url = new URL(resource)
  return new URL(
    `/.well-known/oauth-protected-resource${url.pathname}`,
    url.origin
  ).href
}

export const protectedResourceMetadata = (
  resource: ProtectedResourceInput
): BetterAuthPlugin => ({
  id: "pp-protected-resource-metadata",
  onRequest: async (request, ctx) => {
    if (
      new URL(request.url).pathname !==
      new URL(protectedResourceMetadataUrl(resource.identifier)).pathname
    ) {
      return
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return {
        response: new Response(null, {
          status: 405,
          headers: { Allow: "GET, HEAD" }
        })
      }
    }
    const metadata: ResourceServerMetadata = {
      resource: resource.identifier,
      resource_name: resource.name,
      authorization_servers: [ctx.baseURL],
      bearer_methods_supported: ["header"]
    }
    return { response: metadataResponse(metadata) }
  }
})
