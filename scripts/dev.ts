// `bun run dev`: Postgres, the backend, the web app and the app's Metro, all on
// this Mac's Tailscale HTTPS address. The browser, the simulator and a phone
// on the tailnet then reach the same server, and Better Auth, the OAuth issuer
// and the app's /api tokens agree on one URL. `bun run dev:local` is the same
// stack on localhost for machines without Tailscale.
import { $ } from "bun"
import * as Schema from "effect/Schema"

const webPort = 5173

const fail = (message: string) => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const TailscaleStatus = Schema.Struct({
  BackendState: Schema.String,
  Self: Schema.optional(
    Schema.Struct({ DNSName: Schema.optional(Schema.String) })
  ),
  CertDomains: Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))
})

const decodeStatus = Schema.decodeUnknownSync(
  Schema.fromJsonString(TailscaleStatus)
)

const tailscaleStatus = async () => {
  const result = await $`tailscale status --json`.quiet().nothrow()
  if (result.exitCode !== 0) {
    return fail(
      "Tailscale isn't available. Install it (brew install --cask tailscale), sign in, or run `bun run dev:local` to develop on localhost."
    )
  }
  return decodeStatus(result.stdout.toString())
}

const status = await tailscaleStatus()
if (status.BackendState !== "Running") {
  fail(
    `Tailscale is ${status.BackendState.toLowerCase()}. Start it (open -a Tailscale), or run \`bun run dev:local\`.`
  )
}
const host = status.Self?.DNSName?.replace(/\.$/, "") ?? ""
if (host === "" || (status.CertDomains ?? []).length === 0) {
  fail(
    "Tailscale HTTPS certificates aren't enabled on your tailnet. Enable them at https://login.tailscale.com/admin/dns (MagicDNS and HTTPS Certificates), then run `bun run dev` again."
  )
}
const origin = `https://${host}`

await $`bun run dev:db`

const serve = await $`tailscale serve --bg http://127.0.0.1:${webPort}`
  .quiet()
  .nothrow()
if (serve.exitCode !== 0) {
  fail(`tailscale serve didn't start:\n${serve.stderr.toString()}`)
}
const stopServe = () => $`tailscale serve --https=443 off`.quiet().nothrow()

console.log(`
  ProjectProject dev stack
  Web and app server: ${origin}
  Add this address in the app. A phone needs the Tailscale app on the same tailnet.
`)

const stack = Bun.spawn(
  [
    "turbo",
    "run",
    "dev",
    "--filter",
    "@pp/backend",
    "--filter",
    "@pp/frontend",
    "--filter",
    "@pp/mobile"
  ],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, BETTER_AUTH_URL: origin }
  }
)

const stop = () => stack.kill("SIGINT")
process.on("SIGINT", stop)
process.on("SIGTERM", stop)

const code = await stack.exited
await stopServe()
process.exit(code)
