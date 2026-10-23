# Effect Schema parser reuse

Date: 2026-10-23

## Recommendation

Hoist fixed-schema parser factories to module scope. For dynamic schemas, reuse a parser at an existing owner’s construction boundary. Prefer explicit ownership over adding memoization. `Function.memoize` is a valid fallback when an existing API must keep accepting schemas per operation, but it is not the default pattern and is not used in this cleanup.

Luuk approved changing artifact `readJson` and the local-storage hooks to accept retained decoders/codecs. Artifact callers now supply their compiled value decoder; the artifact service retains JSON parsing and error mapping. Local-storage callers construct one codec per schema at module scope; each codec retains its parsers and typed snapshot cache. Private provider helpers likewise accept retained parsers.

Effect 4.0.5 already caches AST compilation. The benefit of parser retention is avoiding repeated wrapper creation and initialization; full recompilation on every factory call is not an accurate general claim. No performance improvement was benchmarked.

## Installed Effect 4.0.5: what is actually reused

Checked `node_modules/effect/package.json` and pinned the official [4.0.5 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.5) to [`7f524e25cfb49a71ac39b0f44278d08d40dda5de`](https://github.com/Effect-TS/effect/commit/7f524e25cfb49a71ac39b0f44278d08d40dda5de). Installed `SchemaParser.ts`, `SchemaAST.ts`, and `internal/schema/compilerRegistry.ts` are byte-identical to that commit. Relevant `Schema.ts` API spans and `Function.memoize` implementation also match; those installed files contain additional documentation/signature formatting, so their line numbers can differ from upstream.

- The registry is an AST-identity `WeakMap`; its entry lazily retains `Interpreter.compile(...)`. Repeated factory calls for the same AST can therefore share the compiled parser. ([Registry and entry](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/internal/schema/compilerRegistry.ts#L33-L85), [lookup](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/internal/schema/compilerRegistry.ts#L180-L188))
- A decoder factory still creates closures. `runWithCompiler` retains its resolved parser per returned function; `Schema.decodeUnknownEffect` adds its `SchemaError` adapter. Retaining that function avoids recreating these wrappers and repeating their first-use lookup. ([Runner](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaParser.ts#L1001-L1018), [registry compiler](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaParser.ts#L1178-L1179), [Schema adapter](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/Schema.ts#L1524-L1531))
- `Schema.is` has its own lazy guard initialization and checks the decoded type side. Encoders run against the flipped AST; `toType` and `flip` themselves memoize their transformations. ([Guard](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaParser.ts#L143-L195), [encoder](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaParser.ts#L633-L645), [type projection](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaAST.ts#L4704-L4723), [flip](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaAST.ts#L4792-L4802))

Cache identity matters: constructing `Schema.Array(schema)` afresh creates a different outer AST, even when `schema` is stable. Retain the derived schema and parser together. A local runtime probe confirmed different array AST identities, memoized parser identity reuse, and that `Schema.is(Schema.NumberFromString)(42)` is true while the same guard on `"42"` is false.

The installed official guide explicitly demonstrates retained module-level `decodeUser` / `encodeUser`: [Schema basics](../../node_modules/effect/ai-docs/src/01_effect/02_schema/10_schema-basics.ts#L29-L33). Follow this pattern for fixed schemas:

```ts
const TicketIds = Schema.Array(TicketId)
const decodeTicketIds = Schema.decodeUnknownEffect(TicketIds)
const encodeTicketIds = Schema.encodeEffect(TicketIds)
const isTicketId = Schema.is(TicketId)
```

Keep the existing adapter (`Effect`, `Result`, `Option`, sync, etc.), parse options, and error mapping. A hoist should not change validation semantics or turn typed failures into exceptions.

## Generic runtime schemas and Function.memoize

`Function.memoize` is the library's synchronous object-identity memoizer, implemented with a private `WeakMap`; structurally equal fresh schemas do not share entries. It supports a single input, not a schema-plus-options key. ([Implementation](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/Function.ts#L1339-L1374))

**Generic types survive these uses.** A temporary declaration-emission probe using installed TypeScript **7.0.2**, strict mode, and Effect 4.0.5 compiled with zero diagnostics (`tsc --ignoreConfig --strict --skipLibCheck --declaration --emitDeclarationOnly --module preserve --moduleResolution bundler --target esnext`). `memoize(Schema.decodeUnknownSync)`, `memoize(Schema.decodeUnknownEffect)`, `memoize(Schema.encodeSync)`, and `memoize(Schema.is)` retained their generic schema parameters, encoded input/output types, service requirements, and guard narrowing. A generic array-decoder factory and `<A>(schema: Schema.Decoder<A>)` helper also retained their type relationships. This is consistent with TypeScript's [higher-order generic inference](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#higher-order-type-inference-from-generic-functions), not a guarantee for every overloaded function.

For an existing operation taking a schema every time, this is a concrete option:

```ts
const decodeFor = Function.memoize(Schema.decodeUnknownEffect)

const decodeResponse = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
) => decodeFor(schema)(value)
```

The inferred memoizer still returns `Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>`. No widening to a universal decoder and no cast is needed. Create the memoizer once at module scope; creating it inside the operation loses reuse.

For composed schemas, memoize the entire derivation against the original stable schema:

```ts
const decodeJsonFor = Function.memoize(
  <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
    Schema.decodeEffect(Schema.fromJsonString(schema))
)
```

This variant was also type-checked: its returned parser accepts `string` and retains `S["Type"]`. Pass per-call parse options to the returned parser, or close over fixed options in a dedicated factory. Do not silently drop options when replacing a two-argument parser factory with the unary memoizer.

If a schema is already available when constructing a retained owner, a closure is simpler:

```ts
const makeReader = <S extends Schema.Constraint>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema)
  return (input: unknown) => decode(input)
}
```

Reuse the returned reader. Calling `makeReader(schema)` inside every operation only relocates the allocation. Introducing this owner boundary where none exists, changing a service method from schema to parser, changing shared contracts, or adding a shared parser-cache module requires architecture approval under `AGENTS.md`; those two public contract changes were subsequently approved for this cleanup.

## Decoder types versus unknown-input decoders

`decodeUnknownEffect` accepts untrusted `unknown`; `decodeEffect` accepts `S["Encoded"]`. They use the same runtime implementation. The analogous encode distinction is `unknown` versus `S["Type"]`. Select by the actual boundary type, rather than casting input to make the typed variant compile. `SchemaParser` adapters expose `SchemaIssue.Issue`; `Schema` adapters expose `SchemaError`, so swapping modules changes error behavior. ([Decode signatures](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/Schema.ts#L1524-L1561), [encode signatures](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/Schema.ts#L1941-L1978), [issue-level adapter](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/SchemaParser.ts#L270-L282))

`Schema.Decoder<A, R>` is a **schema view**, not an already-compiled callable parser. It preserves the decoded type and decoding services, while its encoded side is `unknown`. Use it for decode-only APIs; use `Schema.Codec<A, I, RD, RE>` when both sides matter. A generic `S extends Schema.ConstraintDecoder<unknown>` preserves the specific caller's `S`; annotating a value as the broad constraint itself loses that specificity. ([Codec and Decoder](https://github.com/Effect-TS/effect/blob/7f524e25cfb49a71ac39b0f44278d08d40dda5de/packages/effect/src/Schema.ts#L1036-L1099))

## Public T3 Code snapshot

Inspected `pingdotgg/t3code` at [`807319c276c6831b2c219640e9da5b38019a8f1d`](https://github.com/pingdotgg/t3code/commit/807319c276c6831b2c219640e9da5b38019a8f1d), using a shallow clone in `/tmp`. The server package `t3` and private desktop package declare version `0.1.2`; private `@t3tools/shared` has no package version. These are manifest values, not a claim about the latest published release. ([Server manifest](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/apps/server/package.json#L1-L8), [desktop manifest](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/apps/desktop/package.json#L1-L6), [shared manifest](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/package.json#L1-L5))

The Effect catalog pins **`4.0.5`**, and the lockfile resolves that exact version. Server and shared dependencies reference the catalog. This matches PP's installed version. ([Catalog](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/pnpm-workspace.yaml#L43-L64), [lockfile](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/pnpm-lock.yaml#L434-L436), [server dependency](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/apps/server/package.json#L58), [shared dependency](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/package.json#L515-L520))

## Concrete reuse patterns

**Fixed schemas: module-level functions.** Auth handoff code binds both directions outside its operations:

```ts
const encodeHandoff = Schema.encodeSync(Schema.fromJsonString(CodexAuthHandoff));
const decodeHandoff = Schema.decodeUnknownSync(Schema.fromJsonString(CodexAuthHandoff));
```

`codexAuthHandoffUrl` and `readCodexAuthHandoff` invoke those retained functions. This example separately constructs each direction's JSON schema; it does not establish that schemas themselves must always be shared. ([Bindings](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/codexAuthHandoff.ts#L21-L24), [operations](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/codexAuthHandoff.ts#L89-L115))

**Guards follow the same pattern.** Logging binds `const isRotatingFileSinkError = Schema.is(RotatingFileSinkError)` at module scope, then calls the guard in its error handling. ([Binding](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/logging.ts#L30-L43), [use](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/logging.ts#L94-L109))

**Generic schemas: build once per retained parser owner.** `decodeJsonResult<S extends Schema.Codec<unknown, unknown, never, never>>(schema)` creates `Schema.decodeExit(Schema.fromJsonString(schema))` before returning its input-taking closure. Each returned parser retains that decoder; calling the factory again creates another decoder function. GitLab code calls this factory at module scope for list/detail parsers, then reuses the list decoder and a separate entry decoder inside its loop. Genericity therefore does not require creation per operation. ([Factory](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/schemaJson.ts#L108-L119), [retained instances and loop](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/source-control-gitlab/src/server/gitLabMergeRequests.ts#L132-L154))

**Per-operation creation also exists.** Codex helpers accept both `schema` and payload and immediately invoke `Schema.decodeUnknownEffect(schema)(raw)` or `Schema.encodeEffect(schema)(payload)` on each helper call. Even a fixed schema still appears inline in the telemetry protocol callback. These counterexamples limit claims of repository-wide consistency. ([Generic helpers](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/effect-codex-app-server/src/_internal/shared.ts#L20-L59), [fixed-schema callback](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/packages/shared/src/otelEnvironment.ts#L142-L154))

## What the lint rule actually checks

T3 enables `t3code/no-inline-schema-compile` as a warning. It lists decoder/encoder factories plus `is` and `asserts`; `Schema.encode` as a schema transformation is excluded. ([Configuration](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/vite.config.ts#L219-L225), [method list](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L7-L35))

Its implementation reports immediately invoked factories inside functions, matching the receiver name `Schema`. Schema detection uses uppercase-leading identifiers, member expressions and nested `Schema` calls, with special handling for `fromJsonString`. It does not resolve symbol identity, prove staticness or measure cost. A local decoder binding followed by invocation escapes the immediate-invocation check. ([Detection](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L37-L95), [report conditions](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L126-L149))

Its fixtures explicitly allow module-scope parsers, generic factories retaining a decoder, and immediate decoding with a lowercase dynamic schema parameter. The diagnostic's rebuilding language is policy rationale, not proof of full recompilation or its runtime expense. ([Allowed cases](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/oxlint-plugin-t3code/rules/no-inline-schema-compile.test.ts#L8-L54), [diagnostic text](https://github.com/pingdotgg/t3code/blob/807319c276c6831b2c219640e9da5b38019a8f1d/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L97-L108))

No direct `Function.memoize` call was found by a bounded search of T3's `apps`, `packages`, and plugin sources at the pinned SHA. Its retained generic factory is useful reference practice, not evidence for a universal cache or a measured performance claim.

## Apply to the PP cleanup

- **Fixed schemas:** hoist the schema derivation and parser/guard together. This is an implementation detail when all dependencies are static.
- **Existing generic operations:** module-local `Function.memoize` can preserve their current signatures. Candidates observed include `EverhourLive.decodeResponse`, `FigmaLive.request`, `SlackClient.request`, Jira client response decoding, and artifact `readJson`. Recheck the current source before editing; root owns concurrent source changes. ([Everhour](../../packages/server-core/src/everhour/EverhourLive.ts#L107-L113), [Figma](../../packages/server-core/src/figma/FigmaLive.ts#L150-L168), [Slack](../../packages/integration-slack/src/Client.ts#L116-L123), [Jira client](../../packages/server-core/src/jira/Client.ts#L526-L545), [artifacts](../../packages/server-core/src/jira/MigrationArtifacts.ts#L168-L177))
- **Derived dynamic schemas:** retain the full derivation. `ScanV2.nested` currently builds `Schema.Array(schema)` inside its per-chunk callback; moving parser construction to an existing retained factory, or using a memoized array-decoder factory keyed by `schema`, gives real reuse. ([ScanV2](../../packages/server-core/src/jira/ScanV2.ts#L86-L114))
- **No diagnostic-only reshuffles:** PP's vendored rule only recognizes immediate `Schema.*(...)(...)` inside functions. It neither resolves imports nor distinguishes static from generic schemas; a local binding merely evades it. T3's rule has an additional heuristic that exempts lowercase dynamic schema parameters. Neither rule measures runtime cost. ([PP rule](../../tools/oxlint/anti-slop/effect/rules/no-inline-schema-compile.ts#L22-L40))

Use the smallest reuse lifetime the existing code supports. Do not add stores, casts, lint suppressions, JIT/AOT compiler configuration, or new public APIs as a mechanical warning fix. Exact speedup, cache hit rates in production, and the best lifetime for genuinely per-request schemas remain unmeasured. A fresh schema identity every call defeats a schema-keyed memoizer; root should inspect that callsite rather than assume caching helps.

Only this research note was written. No source/config/tests were edited, and no application, database, or preview channel was started. The validation was source comparison plus temporary type/runtime probes; no benchmark was run.
