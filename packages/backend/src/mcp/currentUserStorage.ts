// Module-level AsyncLocalStorage used to propagate the bearer-token-resolved
// user from the /mcp HTTP route down into tool callbacks (which run inside
// the MCP SDK's transport.handleRequest, outside any Effect scope we
// control). Bun preserves ALS across await boundaries, so the dispatcher's
// callback reads the right value for each in-flight request.

import { AsyncLocalStorage } from "node:async_hooks"
import type { User } from "@projectproject/shared"

export const currentUserStorage = new AsyncLocalStorage<User>()
