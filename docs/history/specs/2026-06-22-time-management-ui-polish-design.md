# Time management UI polish

## Goal

Bring the new Everhour-backed time management interface in line with ProjectProject's existing product conventions: compact, neutral, responsive, progressively disclosed, and explicit about active or pending state.

## Scope

Refine the existing ticket time panel, sprint time panel, running timer indicator, manual log form, and work type selector. Keep the existing atoms, API contracts, Everhour behavior, and information architecture intact.

## Direction

Use a compact progressive-disclosure treatment. The timer action remains immediately available, while manual logging expands inline only when requested. Time totals and the active timer provide the strongest hierarchy; supporting controls remain quiet until interaction.

This avoids two weaker directions:

- Motion-only polish would leave the current fragmented hierarchy and duplicated control layouts intact.
- A dashboard-style redesign would add persistent chrome and conflict with the app's restrained, information-dense character.

## Component design

### Shared time controls

Ticket and sprint surfaces use the same visual vocabulary:

- A single compact action row contains the work type selector, timer action, and manual-log trigger.
- Start and stop states transition without moving unrelated content.
- Stop is visually distinct through label and iconography, but remains neutral rather than destructive because stopping is reversible and routine.
- Busy state disables conflicting controls and applies feedback only to the changing data or action.
- Manual logging expands directly below the action row.

The implementation may extract a small shared presentational component if doing so reduces duplication without changing state ownership or public APIs.

### Ticket panel

- Preserve the total and personal time figures.
- Strengthen the values through tabular numerals and spacing rather than cards or color.
- Keep the sync explanation available as quiet secondary information.
- Use the same action layout as the sprint surface.
- Preserve the no-sprint and Everhour connection states, refining their spacing and transitions to match the surrounding ticket detail panel.

### Sprint panel

- Remove the standalone bordered-card appearance.
- Render as a flat, compact section aligned with the sprint detail surface.
- Use the same timer and manual-log interaction as the ticket panel.

### Running timer indicator

- Keep the indicator globally visible in the authenticated shell.
- Make the elapsed time the stable, scannable element using tabular mono numerals.
- Use subtle state motion on the timer glyph rather than continuous decorative animation.
- Preserve direct navigation for ticket timers and an immediate stop action.
- Ensure the indicator truncates safely in narrow layouts.

### Manual log form

- Reveal and dismiss with the existing `motion` library and shared transition tokens.
- Use a compact responsive field layout: duration and date first, then work type and note where width allows.
- Keep labels visible and sentence-cased.
- Preserve inline validation, submission state, and cancel behavior.
- Move focus to the duration input when the form opens so the progressive reveal is keyboard-efficient.

## Motion and interaction

- Use existing shared spring or transition tokens.
- Animate opacity and transform for state feedback; use height animation only for the established inline reveal pattern.
- No page-load choreography or looping decoration.
- Every hover color change includes a transition utility so the global instant-in, eased-out rule applies.
- Buttons retain the shared 97% press feel through the button primitive.
- Respect reduced-motion behavior provided by the motion library and existing app styles.

## Responsive behavior

- Controls wrap without losing action order.
- Primary timer action remains visible before the manual-log action.
- Expanded form fields become a single column on narrow surfaces.
- Long work type labels and timer labels truncate instead of widening the shell.

## Accessibility

- Maintain explicit labels for the work type selector and timer actions.
- Expose expanded state on the manual-log trigger.
- Keep focus-visible behavior from shared primitives.
- Announce validation errors through existing `role="alert"` treatment.
- Do not rely on color or animation alone to communicate running, stopped, busy, or invalid state.

## Data flow and errors

State ownership remains unchanged:

- Existing Effect atoms continue to own timer, connection, work type, and logged-time state.
- Existing optimistic waiting flags drive local pending feedback.
- Existing `ErrorPage` and inline error patterns remain in use.
- No API, schema, backend, or i18n domain changes are required unless a concise accessibility label is missing.

## Verification

- Add or update focused component tests for timer state, manual-log expansion, validation, and narrow-layout-safe semantics where practical.
- Run frontend tests, typecheck, lint, and formatting checks relevant to changed files.
- Review ticket, sprint, and shell timer surfaces in both light and dark themes and at desktop and narrow widths.

## Non-goals

- New time reporting, history, editing, or deletion flows.
- Changes to Everhour synchronization or timer semantics.
- New packages, global state patterns, API endpoints, or design tokens.
