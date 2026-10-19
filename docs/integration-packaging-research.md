# Integration packaging research

Date: 2026-10-19

## Recommendation

Extract Slack into `packages/integration-slack`, with PP-owned capabilities supplied through Effect layers. Keep core ticket/sprint operations independent of Slack. Use this as a pattern for later integrations, without introducing a universal integration driver or moving the workflow engine into each package.

This is a recommendation inferred from the source comparison below. Package extraction has not been performed as part of this research.

## Sources and scope

Inspected public source snapshots, including manifests, implementations and application composition:

| Repository | Inspected commit | Why it is relevant |
| --- | --- | --- |
| T3 Code | [`1451e7cb`](https://github.com/pingdotgg/t3code/commit/1451e7cb23034d29774338608368a15d8845df36) | An Effect application with packaged AI and source-control integrations |
| Effect | [`4cddd3c4`](https://github.com/Effect-TS/effect/commit/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d) | Provider libraries implementing shared Effect contracts |
| Alchemy | [`9e3c0584`](https://github.com/alchemy-run/alchemy/commit/9e3c0584342d67b24a4215f931047aabd230327b) | An Effect framework with many providers and explicit rules preparing a package split |

These are inspected upstream snapshots, not guarantees about every release. PP currently uses a different Effect version; this research does not propose upgrading it. External repositories were inspected without installing dependencies or executing their application code.

## T3 Code: provider packages, application-owned host implementations

T3's provider guide explicitly places drivers in `packages/provider-<name>`. It separates browser-safe client metadata/settings from server implementations and testing exports. Tests requiring the complete orchestrator stay in the server app. Provider packages access application facilities through `ProviderHost`, rather than importing `apps/server`. The guide also acknowledges providers that have not yet moved. ([Provider packaging guide](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/docs/internals/adding-a-provider.md#where-a-driver-plugs-in))

This includes substantial behavior, not just SDK wrappers. The Cursor package owns its SDK dependency and contains authentication, credentials, snapshots, generation and orchestration adaptation. Source control has separate GitHub and other provider packages; the app registers and composes their drivers. ([Cursor manifest](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/packages/provider-cursor/package.json), [Cursor driver](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/packages/provider-cursor/src/server/driver.ts), [source-control composition](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/server/src/sourceControl/builtInDrivers.ts))

`ProviderHost` belongs to provider-core and describes paths, settings, background-work policy, attachment resolution and credential storage. The server implements it using `Layer.effect`, delegating to its actual application modules and translating credential errors. The provider package consumes capabilities without learning where the host stores settings or credentials. ([Host contract](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/packages/provider-core/src/server/ProviderHost.ts), [host implementation](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/server/src/provider/ProviderHostLive.ts))

The host interfaces are domain-specific: source control has its own host with process execution and Git operations. Durable orchestration remains app-owned: the event sink commits events, projections and outbox effects transactionally, and a worker executes recorded effects. Package extraction does not require a separate persistence engine for each provider. ([Source-control host](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/packages/source-control-core/src/server/SourceControlHost.ts), [event sink](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/server/src/orchestration-v2/EventSink.ts), [worker](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/server/src/orchestration-v2/EffectWorker.ts))

The migration is incomplete: built-in registration still mixes app-local Codex, Claude and Antigravity with package-owned providers. This is evidence of a direction and working examples, not a claim that the whole codebase is uniform. ([Current registration](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/server/src/provider/builtInDrivers.ts))

## Effect: concrete providers implement core contracts

Effect publishes actual provider packages such as `@effect/ai-openai` and `@effect/sql-pg`. Their manifests declare Effect as a peer dependency, expose explicit subpaths and exclude internal implementation imports. ([OpenAI manifest](https://github.com/Effect-TS/effect/blob/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d/packages/ai/openai/package.json), [Postgres manifest](https://github.com/Effect-TS/effect/blob/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d/packages/sql/pg/package.json))

The OpenAI implementation supplies core `LanguageModel` through a layer that requires `OpenAiClient`; the client itself requires a supplied HTTP client. The Postgres layer provides both its concrete `PgClient` and the core `SqlClient` tag. Concrete implementations therefore depend on shared contracts, and callers choose implementations through layer composition. ([Language-model layer](https://github.com/Effect-TS/effect/blob/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d/packages/ai/openai/src/OpenAiLanguageModel.ts#L788-L792), [HTTP dependency](https://github.com/Effect-TS/effect/blob/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d/packages/ai/openai/src/OpenAiClient.ts), [SQL layer](https://github.com/Effect-TS/effect/blob/4cddd3c41e71fc4990d37c42b1bcf2ce3780b41d/packages/sql/pg/src/PgClient.ts#L374-L382))

These are reusable libraries, rather than application integrations with PP permissions and subscriptions. They support the dependency direction; they do not establish that Slack, Jira and Figma should implement an identical interface.

## Alchemy: enforce separation before completing the split

At the inspected commit, GitHub and Stripe still ship as subpath exports of the main `alchemy` package. Stripe's implementation also uses a separately packaged lower-level client, `@distilled.cloud/stripe`. Its resource behavior, authentication adaptation and provider-layer composition live in Alchemy. ([Exports](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/packages/alchemy/package.json), [Stripe implementation](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/packages/alchemy/src/Stripe/Customer.ts), [provider composition](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/packages/alchemy/src/Stripe/Providers.ts))

That layout is explicitly transitional. Its custom lint rule documents a planned provider-free core plus provider packages. It rejects imports from core into provider directories and between different providers, including some coupling encoded as resource-name strings. Existing exceptions name the migration phase expected to remove them. The root lint configuration enables the rule as an error. ([Rule and rationale](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/scripts/oxlint/alchemy.ts), [configuration](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/oxlint.config.ts))

This is particularly relevant to PP: package folders alone do not establish independence. Dependency rules can make the intended ownership enforceable during incremental extraction.

## Applying the findings to PP

The initial Slack implementation had three forms of coupling: ticket/sprint modules imported Slack event selectors; `TicketActivity.record` accepted `SlackNotification`; and activity persistence selected Slack subscriptions and inserted Slack delivery jobs. Moving the Slack directory alone would have retained that coupling or created circular package dependencies.

Recommended responsibilities:

| Location | Responsibility |
| --- | --- |
| `integration-slack` | Slack client/SDK, OAuth linking, subscriptions, formatting, Socket Mode, previews, delivery workflows and retries |
| `server-core` | PP ticket/sprint operations, authorization, content access and durable recording of domain changes |
| Backend app | Host implementations, HTTP/session wiring, workflow-engine provisioning and composition of core with Slack |
| `db` / `shared` | Existing centralized migrations and frontend/backend contracts |
| Frontend app | Settings UI and atoms |

Keep Slack-specific persistence in the Slack implementation while continuing to declare its tables in `db`. Give preview code an injected capability that resolves a linked user's authorized ticket summary, implemented using PP's access/content modules. Start with the capabilities Slack actually needs; extract shared host contracts only when other integrations consume them.

The durable write-to-job handoff must survive the extraction. Use a small provider-neutral domain-change contract with the existing SQL/file recovery mechanism, then let Slack select subscriptions and create deliveries. The exact handoff design still needs an implementation decision; an in-memory event callback would lose the restart guarantee. No external broker, event-sourcing rewrite or dynamic plugin loader is justified by this research.

Slack, Jira, GitHub, Figma and Everhour perform different jobs. Copy the ownership and dependency direction from these projects, rather than a universal provider interface. Extract Slack first, keep the shared workflow engine, and migrate other integrations incrementally.

## Implementation follow-through

Slack now lives in [integration-slack](../packages/integration-slack/README.md), with [SlackHostLive](../apps/backend/src/slack/HostLive.ts) adapting PP capabilities. Core captures subscribed `ProjectEvent` deliveries in its existing file/SQL outbox and commits them into `project_integration_event`. Slack atomically promotes only its own deliveries into Slack jobs. The shared engine is provisioned from [workflows/Runtime](../apps/backend/src/workflows/Runtime.ts). Import restrictions enforce the dependency direction, while migrations and HTTP contracts retain their existing owners. Other integrations have not been extracted.
