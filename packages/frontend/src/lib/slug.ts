// Mirrors the server's slugify rule so the user sees the same slug they're
// going to get. The server is still authoritative — it owns conflict
// resolution by appending `-2`, `-3`, etc.

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
