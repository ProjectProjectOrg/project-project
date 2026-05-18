# ProjectProject

ProjectProject is a markdown-first project management system where project access and invitations are explicit domain concepts.

## Language

**Member**:
A user with accepted access to a project.
_Avoid_: Pending member, invitee

**Pending project member**:
An email address with a pending invitation that will grant project access if accepted.
_Avoid_: Member, user

## Relationships

- A **Member** has exactly one project role on a project.
- A **Pending project member** belongs to exactly one pending organization invitation and one project.
- A **Pending project member** becomes a **Member** only when the invitation is accepted.
- A project detail includes both **Members** and **Pending project members** for the members list.
- **Pending project members** are transient database-backed invite state, not markdown frontmatter.
- Re-inviting the same **Pending project member** updates the existing pending project role instead of creating a duplicate invite.
- Only an owner may change a **Pending project member** role.
- Only an owner may invite or promote someone into the admin role; admins may invite members only.
- A **Pending project member** can be canceled from the project members list.
- Resending a **Pending project member** invitation is not part of the current flow.
- Canceling a **Pending project member** removes that project grant; the underlying organization invitation is canceled only when no project grants remain.
- A **Pending project member** is displayed by email, not by a user profile, until the invitation is accepted.

## Example Dialogue

> **Dev:** "Should the pending invite show in the members list?"
> **Domain expert:** "Yes, visually. But it is a **Pending project member**, not a **Member**, because it does not grant access until the invitation is accepted."

## Flagged Ambiguities

- "member" was used to mean both accepted project access and pending invitees. Resolved: **Member** only means accepted access; **Pending project member** means an invite grant waiting for acceptance.
