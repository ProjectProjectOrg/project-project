# Slack integration

Owns Slack credentials and identity linking, project subscriptions, message
formatting, Socket Mode, ticket previews and durable notification delivery.
Self-host setup is documented in the [root README](../../README.md#slack-integration).

Socket Mode uses SDK 3.1.0 and requires Bun 1.4.4 or newer. Bun 1.4.4 fixes
the missing Undici ping and heartbeat diagnostics APIs that caused SDK 3 to
reconnect repeatedly ([Bun #37110](https://github.com/oven-sh/bun/issues/37110)).
Run `bun run test` in this package when changing the SDK or runtime: the test
keeps a real local connection open through heartbeat checks, then verifies
event acknowledgement.

The package depends on `@pp/db`, `@pp/shared` and Effect, with no dependency on
`@pp/server-core` or either application. `SlackHost` describes the PP capabilities
it needs: authorized ticket summaries, current sprint state and secret encryption.
The backend supplies these through `SlackHostLive` and provisions the shared SQL
workflow engine. `SlackServicesLive` composes the package's services;
`SlackRuntimeLive` runs its sockets and background dispatch.

Core document writes capture provider-neutral `ProjectEvent` deliveries for the
integration links subscribed at write time. The existing file/SQL outbox settles
them after the document write and recovers interrupted handoffs. `SlackEvents`
atomically creates Slack jobs and marks its integration events consumed, using
the same stable delivery ID on retries. Events for other providers are untouched.
The background workflow checks current connection state before sending and
revalidates scheduled sprint starts through the host.

HTTP/session wiring and settings UI stay in the applications. Database tables and
migrations stay in `db`; frontend/backend contracts stay in `shared`. Full
integration tests live beside backend composition so they exercise the real PP
host, persistence, document operations and Slack services together.

Import restrictions enforce the package direction in lint. Other integrations
can adopt the same ownership without implementing a universal driver interface.
