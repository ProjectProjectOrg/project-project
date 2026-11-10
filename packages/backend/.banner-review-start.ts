import { config } from "dotenv"
config({ path: "/tmp/projectproject-banners-review.env", override: true, quiet: true })
await import("./src/.banner-review-main")
