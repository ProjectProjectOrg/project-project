import { createHmac, randomUUID } from "node:crypto"
import { parseArgs } from "node:util"

const usage = `Send a signed GitHub App webhook to a local backend.

  bun scripts/github-webhook.ts pull_request --action <action> --branch <ref> --number <n> [--title <text>] [--body <text>] [--draft] [--merged] [--base <ref>]
  bun scripts/github-webhook.ts delete --branch <ref>

Actions: opened, reopened, edited, synchronize, converted_to_draft, ready_for_review, closed (add --merged for a merge).

Common options:
  --installation <id>    GitHub App installation id (default 1)
  --repo <id>            repository id the project is linked to (default 1)
  --default-branch <ref> repository default branch (default main)
  --url <url>            webhook endpoint (default $GITHUB_WEBHOOK_URL or http://localhost:3000/api/integrations/github/webhook)

Signs with $GITHUB_APP_WEBHOOK_SECRET.`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    action: { type: "string" },
    branch: { type: "string" },
    number: { type: "string" },
    title: { type: "string", default: "" },
    body: { type: "string", default: "" },
    draft: { type: "boolean", default: false },
    merged: { type: "boolean", default: false },
    base: { type: "string" },
    installation: { type: "string", default: "1" },
    repo: { type: "string", default: "1" },
    "default-branch": { type: "string", default: "main" },
    url: { type: "string" },
    help: { type: "boolean", default: false }
  }
})

const fail = (message: string): never => {
  console.error(`${message}\n\n${usage}`)
  process.exit(1)
}

const event = positionals[0]
if (values.help || event === undefined) {
  console.log(usage)
  process.exit(0)
}

const secret = process.env["GITHUB_APP_WEBHOOK_SECRET"]
if (!secret) fail("GITHUB_APP_WEBHOOK_SECRET is not set")

const branch = values.branch ?? fail("--branch is required")
const defaultBranch = values["default-branch"]
const installation = { id: Number(values.installation) }
const repository = {
  id: Number(values.repo),
  default_branch: defaultBranch
}

const payload = (() => {
  if (event === "pull_request") {
    const action = values.action ?? fail("--action is required")
    const number = Number(values.number ?? fail("--number is required"))
    return {
      action,
      number,
      installation,
      repository,
      pull_request: {
        number,
        title: values.title,
        body: values.body,
        state: action === "closed" || values.merged ? "closed" : "open",
        draft: values.draft,
        merged: values.merged,
        head: { ref: branch, repo: { id: repository.id } },
        base: { ref: values.base ?? defaultBranch }
      }
    }
  }
  if (event === "delete") {
    return { ref: branch, ref_type: "branch", installation, repository }
  }
  return fail(`Unknown event "${event}"`)
})()

const url =
  values.url ??
  process.env["GITHUB_WEBHOOK_URL"] ??
  "http://localhost:3000/api/integrations/github/webhook"
const body = JSON.stringify(payload)
const delivery = randomUUID()
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-github-event": event,
    "x-github-delivery": delivery,
    "x-hub-signature-256": `sha256=${createHmac("sha256", secret!).update(body).digest("hex")}`
  },
  body
})

console.log(
  `${event}${"action" in payload ? `.${payload.action}` : ""} ${branch} → ${response.status} ${await response.text()} (delivery ${delivery})`
)
if (!response.ok) process.exit(1)
