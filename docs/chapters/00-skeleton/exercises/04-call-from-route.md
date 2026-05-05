# Exercise 4 — Close the loop: call the API from `/`

**File to edit:** `packages/frontend/src/routes/index.tsx`

## Goal

On the home page (`/`), call `client.health.get()` through the `ApiClient` service you built in Exercise 3, and render the response. When this works, you've proven the whole chain: shared `AppApi` → backend handler → Bun → Vite proxy → frontend `HttpApiClient` → React render. That is Chapter 0's payoff.

## Concepts practiced

- Running an `Effect` program from React (manually, the awkward way)
- Providing a layer with `Effect.provide`
- `Effect.runPromise` as the bridge from Effect-land to Promise-land
- Spotting the rough edges that motivate `@effect-atom/atom-react` later

## Steps

1. Run both dev servers in two terminals: `bun run --filter @projectproject/backend dev` and `bun run --filter @projectproject/frontend dev`. The frontend boots on `http://localhost:5173`. Confirm the backend is still serving `/health`.
2. Open `packages/frontend/src/routes/index.tsx`. Add the imports the comments call for: `createFileRoute` from `@tanstack/react-router`, `Effect` from `effect`, and `ApiClient` from `../services/ApiClient`. You'll also need React's `useEffect` and `useState`. (Note: just `ApiClient` — no separate `ApiClientLive`. The Layer is `ApiClient.Default`, accessed off the class itself.)
3. Declare the route: `export const Route = createFileRoute("/")({ component: Home })`. (TanStack Router's plugin watches your file tree and regenerates `routeTree.gen.ts` so this works with no extra config.)
4. Write the `Home` component. Inside, use `useState` to hold the response (start as `null`) and `useEffect` to kick off the call once on mount. The Effect program:
   - Yields `ApiClient` (`const client = yield* ApiClient`).
   - Calls `client.health.get()` and yields its result.
   - Is then `.pipe(Effect.provide(ApiClient.Default))` so the runtime knows where to find `ApiClient`.
   - Goes into `Effect.runPromise(...).then(setData)`.
5. Render whatever you got. `<pre>{JSON.stringify(data, null, 2)}</pre>` is fine. Ugly is _encouraged_ — Chapter 0 ends here, polish comes later.
6. Open `http://localhost:5173`. You should see `{ "status": "ok" }`. Check the browser network tab: the request goes to `/api/health` and Vite forwards it to `http://localhost:3000/health`.

## Acceptance criteria

- [ ] The home page renders `{ "status": "ok" }` (or the equivalent JSON, however you formatted it).
- [ ] In the browser network tab the request URL is `/api/health` (not `/health`, not `http://localhost:3000/health` directly). The Vite proxy is doing its job.
- [ ] If you stop the backend, the page either shows an error or stays empty — _not_ a misleading success. (You won't have nice error UI yet; that's expected.)
- [ ] If you change the response in the backend (e.g. typo `"ok"` → `"oki"`), you can't even compile it: the `Schema.Literal("ok")` rejects it. Restore.

## Hints

<details>
<summary>Hint 1 — the `Home` component</summary>

```tsx
function Home() {
  const [data, setData] = useState<{ status: "ok" } | null>(null)

  useEffect(() => {
    const program = Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.health.get()
    }).pipe(Effect.provide(ApiClient.Default))

    Effect.runPromise(program).then(setData).catch(console.error)
  }, [])

  return <pre>{data ? JSON.stringify(data, null, 2) : "loading..."}</pre>
}
```

The `.catch(console.error)` is a band-aid — without it, a failed promise becomes an unhandled rejection.

</details>

<details>
<summary>Hint 2 — why does <code>client.health.get()</code> with no arguments work?</summary>

The endpoint declared no path params, no payload, no query. `HttpApiClient` reflects that into its call signature: with no required inputs, you can call it with zero arguments. If you later add `.setPath(...)` or `.setPayload(...)` to the endpoint, the client's call signature gains a `{ path, payload }` argument — automatically, no codegen.

Try it: in `shared/api.ts`, add `.setPath(Schema.Struct({ name: Schema.String }))` to the endpoint and change the path to `/health/:name`. The frontend will stop compiling until you pass `{ path: { name: "..." } }`. Revert when you're done playing.

</details>

<details>
<summary>Hint 3 — what about errors in the <code>E</code> channel?</summary>

`client.health.get()` returns `Effect<{ status: "ok" }, HttpClientError | ParseError, never>` (roughly). Your `Effect.gen` propagates that error type, and `Effect.runPromise` rejects the promise with it. We didn't `.addError(...)` anything on the endpoint, so you only see _transport_ errors here (network down, bad response, etc.). Once you start adding tagged errors in Chapter 2-ish, the `E` channel will narrow to the things you actually declared, and the compiler will force you to handle them.

</details>

## What you've actually built

- A typed contract that lives in one place.
- A backend that the compiler checks against that contract.
- A frontend that the compiler also checks against that contract — via a derived client, no codegen.
- An end-to-end Effect program running on both sides of the wire.

Phase 1 — Auth — is next, and it's where layers start to compose for real (DB, BetterAuth, session middleware). Take a moment to skim `docs/PROJECTPROJECT.md`'s "Backend Architecture" and "Auth Flow" sections before you ask to start Chapter 1, so you know the destination.
