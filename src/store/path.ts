/* Immutable get/set for dotted paths, used by every control in the panel. */

export function getPath<T = unknown>(obj: unknown, path: string): T {
  const parts = path.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined as unknown as T
    cur = cur[p]
  }
  return cur as T
}

/** Returns a new object sharing untouched branches, so React sees a real diff. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.')
  const root: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) }
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const next = cur[key]
    cur[key] = Array.isArray(next) ? [...next] : { ...next }
    cur = cur[key]
  }
  cur[parts[parts.length - 1]] = value
  return root as T
}
