# 00 — Optional one-time setup: a GitHub OAuth app

If you already have `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env` and you've successfully signed in via the Chapter 2 smoke-test home, **skip this exercise**.

## Goal

Have a GitHub OAuth app whose callback URL matches what Better Auth will redirect to during sign-in.

## Steps

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** anything (e.g. "ProjectProject dev").
   - **Homepage URL:** `http://localhost:5173`.
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`.
     - Important: this is the _backend_ origin, not the Vite origin. Better Auth sets the callback to `BETTER_AUTH_URL` + `/api/auth/callback/github`. `BETTER_AUTH_URL` should be `http://localhost:3000` for dev.
3. Click **Register application**, then **Generate a new client secret**.
4. Copy the client ID and the secret into your project's `.env` (next to the existing `DATABASE_URL` and `BETTER_AUTH_SECRET`):

   ```
   GITHUB_CLIENT_ID=Iv1.abc...
   GITHUB_CLIENT_SECRET=...
   BETTER_AUTH_URL=http://localhost:3000
   BETTER_AUTH_SECRET=<32+ random bytes, e.g. `openssl rand -base64 32`>
   ```

5. Restart `bun --filter @projectproject/backend dev` so the new env values are loaded.

## Verifying it works

In a browser tab pointed at `http://localhost:5173/`, click "Sign in with GitHub" on the existing smoke-test home. You should:

- Be redirected to GitHub.
- See the OAuth consent screen for _your_ OAuth app, including the `read:user`, `user:email`, and `repo` scopes (configured in `packages/backend/src/auth.ts`).
- After consent, land back on `http://localhost:5173/` with a session cookie.
- Clicking "Show /me" should now return your user JSON.

If the round-trip lands on an error page instead, the most common causes are:

- **Callback URL mismatch.** GitHub will tell you. The fix is in the OAuth app settings.
- **`BETTER_AUTH_URL` not set or wrong.** Better Auth uses it to construct the callback URL passed to GitHub.
- **Cookies blocked.** Some browsers block third-party cookies aggressively. The dev origins are first-party, but if you have a strict cookie extension installed, allow `localhost`.

## Acceptance

You have a `/me` response in the smoke-test home with your real GitHub user. From here, the rest of the chapter is plumbing.
