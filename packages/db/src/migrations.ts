import { fileURLToPath } from "node:url"

export const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url)
)
