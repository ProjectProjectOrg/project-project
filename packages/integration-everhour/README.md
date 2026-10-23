# Everhour integration

Owns the Everhour API client, personal API keys, project connection and
structure sync (one section per sprint, one task per sprint and work type),
time tracking (timers, logged time and per-ticket attribution) and the
`api:time:updated` webhook.

The package depends on `@pp/db`, `@pp/shared` and Effect, with no dependency on
`@pp/server-core` or either application. `EverhourHost` describes the PP
capabilities it needs: project lookup, published project names, project members,
sprints, ticket titles, time-read access and secret encryption. The backend
supplies these through `EverhourHostLive`; `EverhourServicesLive` composes the
package's services and `EverhourRuntimeLive` runs the background sync.

Everhour project links subscribe to sprint lifecycle events. `EverhourEvents`
consumes them from the shared outbox and marks the link's sync as requested;
the runtime claims requested links with a lease and runs the full structure
sync with the key of the manager who last synced the project. A failed sync
keeps the request and retries later, and an event arriving during a sync
triggers another one. An hourly sweep requests a sync for projects not synced
in the last hour, which covers project renames and work-type changes.

Everhour keeps one time record per user, day and task and adds every write to it
as a `history` entry, so attribution is keyed by history entry. Members can only
track time on Everhour projects they are assigned to: syncs add connected
project members without removing anyone, and a denied member is assigned with
the key of the manager who last synced the project. See
[the time tracking plan](../../docs/everhour-time-plan.md).

HTTP handlers, the webhook route and settings UI stay in the applications.
Database tables and migrations stay in `db`; frontend/backend contracts stay in
`shared`. Tests in `test` run against a fake `EverhourHost` and Everhour client;
the Postgres tests need `PROJECTPROJECT_TEST_DATABASE_URL`.

Import restrictions enforce the package direction in lint.
