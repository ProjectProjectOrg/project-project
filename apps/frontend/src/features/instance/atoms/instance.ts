import { Api } from "@/api/Api"

export const instanceHealth = Api.query("health", "get", {
  timeToLive: "1 hour"
})
