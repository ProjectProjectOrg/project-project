# Forms

Read before adding or changing a form in `apps/frontend`. The short rules live in `AGENTS.md`.

Multi-field and multi-step forms use **TanStack Form** (`@tanstack/react-form`, currently the v2 alpha). Setup follows the conventions in the `omgevingschat-platform` web app:

- `apps/frontend/src/lib/form.ts` builds the hook via `createFormHook` and exports `useAppForm`, `useFormContext`, `appFormOptions`, `defineAppFieldGroup`, plus `useFormValues`. In v2 `createFormHook` no longer takes contexts, so there is no `form-context.ts`.
- A form lives in `apps/frontend/src/features/<feature>/forms/<name>/`, with shared options and schemas in `opts.ts` and the form in `index.tsx`. Multi-step forms get one file per step beside them (`SourceStep.tsx`, `CropStep.tsx`).

**Validators are Effect Schema, not zod.** TanStack Form accepts any Standard Schema, and `Schema.toStandardSchemaV1` (Effect v4) produces one — so `@pp/shared` schemas can be used directly. Do not add zod; it is not a dependency and a second schema library is not wanted.

## Multi-step forms are FormGroups, not a bespoke primitive

Follow the upstream multi-step wizard example. There is no stepped-form component and there should not be one — the library already does the work:

- One `form.FormGroup name="<step>"` per step, rendered conditionally on the current step index.
- **The group's `onSubmit` is how you advance.** A step's button submits the *group*; the group validates, and `onSubmit` fires only when it passes, so advancing is gated without computing validity or disabling anything. `onSubmitInvalid` handles the failure case.
- The last step's group `onSubmit` calls `form.handleSubmit()`.
- Put the whole-form schema in the form's own `validators` with `triggers: []`, so it runs on `form.handleSubmit()` only. That validates every step regardless of which groups are mounted.
- Use `createValidator` for the per-step validators so a step only revalidates on change after its first submit attempt — don't show errors before the user has tried.

## Single-step forms

- Wrap the form's Effect Schema in `validateAfterSubmit` from `lib/form.ts`. It runs on submit, then on change and blur after the first attempt. Include blur: a blur clears submit errors from validators that don't run on blur.
- Validators that depend on runtime data (taken keys, a derived key) are a `Schema.makeFilter` on the struct returning `{ path: ["field"], issue: m.message() }`, so the issue lands on that field.
- Keep the payload builder (`toLogTimeInput`, `toConnectStorageInput`) in `opts.ts` and test it there.
- Inside an `InlineForm` shell, read busy and failure from the mutation atom; call the shell's `setBusy` around the awaited mutation only when its `Cancel` or Escape handling must respect it. Never mirror the atom into the shell from an effect.
- Type a form passed to step components with `ReactFormType<typeof yourFormOpts>`.

## The form owns validity; the atom owns the mutation

- **The form owns** field values, validation, and step progression.
- **The atom owns** the mutation. `onSubmit` awaits the Effect-Atom mutation, and everything the user sees about progress and failure (`waiting`, `animate-pulse`, error text) is read from the atom, never from `isSubmitting`.

Never disable a control on `isSubmitting` when an atom is doing the work — pass the atom's `waiting` down instead.

## Notes on the v2 alpha

- Validators are an array of `{ run, triggers, runOnMount }`. There is no `onChange`/`onMount` key and no `revalidateLogic` — that was the v1 model.
- **Neither `form.state` nor `group.state` is reactive.** Both are snapshots. Read group state through `group.Subscribe`; read form values through `useFormValues(form)`, which selects off `form.atom`. Fields subscribe for themselves, so a component reading `form.state.values` during render silently freezes at whatever the values were when it last rendered for some other reason — live previews and step summaries drawn that way never update.
- Range checks are `Schema.isBetween({ minimum, maximum })` in Effect v4, not `Schema.between`.
