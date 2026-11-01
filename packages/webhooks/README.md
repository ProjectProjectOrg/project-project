# Webhooks

Sends signed HTTP requests to user-configured URLs. User-facing behaviour is
documented in [docs/webhooks.md](../../docs/webhooks.md).

The package depends on `@pp/db`, `@pp/shared` and Effect, never on
`@pp/server-core` or the applications. `WebhookHost` describes what it needs
from PP: sealing and opening secrets. The backend supplies it in
`apps/backend/src/webhooks/HostLive.ts`.

- `WebhookEndpoints` owns a target: its encrypted URL, signing secret and extra
  headers, and queues deliveries for it. Project webhooks own one endpoint per
  `project_integration_link`; other owners (such as a per-user T3 Code
  connection) can create endpoints and enqueue deliveries directly.
- `WebhookEvents` turns the provider-neutral `ProjectEvent`s that core captured
  for webhook links into deliveries, atomically with marking them consumed. The
  integration event id becomes the delivery id.
- `WebhookDispatcher` claims due endpoints with a lease token
  (`FOR UPDATE SKIP LOCKED`), sends each one's oldest pending delivery, and
  writes the outcome only while the lease still matches. Changes to an endpoint
  clear its lease, so a result from before the change is discarded. Delivery is
  at least once.
- `WebhookSender` resolves the host, rejects non-public addresses, connects to
  the checked address with the original host name for TLS, and signs the
  request the Standard Webhooks way (`webhook-*` headers) plus a GitHub-style
  body signature (`x-pp-signature-256`).
- `Runtime.layer` runs event intake, dispatch and expiry in the background.

Retry, backoff and auto-disable rules live in `policy.ts` as pure functions.
