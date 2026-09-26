import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import {
  inferAdditionalFields,
  magicLinkClient,
  organizationClient
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    oauthProviderClient(),
    inferAdditionalFields({
      user: {
        editorPreference: { type: "string", required: false, input: true }
      }
    })
  ]
})
