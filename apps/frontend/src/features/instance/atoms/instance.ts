import { query } from "@/api/query"

export const instanceHealth = query("health", "get", {
  timeToLive: "1 minute"
})
