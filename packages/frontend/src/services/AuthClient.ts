import { createAuthClient } from "better-auth/react"
import {
  inferAdditionalFields,
  magicLinkClient,
  organizationClient
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    inferAdditionalFields({
      user: {
        editorPreference: { type: "string", required: false, input: true }
      }
    })
  ]
})
