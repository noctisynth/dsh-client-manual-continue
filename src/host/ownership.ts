/** An absent legacy capability selects the formally injected subagent service instead. */
export function legacyRootCheck(registry: unknown): ((agent: unknown) => boolean) | undefined {
  if (typeof registry !== 'object' || registry === null) return undefined
  try {
    const roots: unknown = Reflect.get(registry, 'roots')
    if (roots === undefined) return undefined
    if (typeof roots !== 'function') return () => false
    return (agent) => {
      try {
        const result: unknown = Reflect.apply(roots, registry, [])
        return Array.isArray(result) && result.some((root: unknown) => root === agent)
      } catch {
        return false
      }
    }
  } catch {
    return () => false
  }
}
