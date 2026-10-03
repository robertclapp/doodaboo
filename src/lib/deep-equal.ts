/**
 * Structural equality for plain JSON-ish values, treating an `undefined`
 * property as absent — the same equivalence Convex applies on the wire and
 * on disk, so a record round-tripped through the backend compares equal to
 * the one the app built.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const k of Object.keys(ao)) if (!deepEqual(ao[k], bo[k])) return false;
  for (const k of Object.keys(bo)) if (!(k in ao) && bo[k] !== undefined) return false;
  return true;
}
