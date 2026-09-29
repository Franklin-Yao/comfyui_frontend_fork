/** Remove credentials, query strings, and fragments from URL-shaped text. */
export function redactTelemetryUrls(text: string): string {
  return text.replace(
    /(?:https?:)?\/\/[^\s"',;<>]+|\/[A-Za-z0-9._~%-][^\s"',;<>]*/g,
    (token) => {
      let trailing = ''
      while (
        (token.endsWith(')') &&
          token.split(')').length > token.split('(').length) ||
        (token.endsWith(']') &&
          token.split(']').length > token.split('[').length)
      ) {
        trailing = token.at(-1) + trailing
        token = token.slice(0, -1)
      }
      const stackSuffix = token.match(/:\d+:\d+$/)?.[0] ?? ''
      const url = stackSuffix ? token.slice(0, -stackSuffix.length) : token
      const clean = url.split(/[?#]/, 1)[0]
      const absolute = clean.match(/^((?:https?:)?\/\/)([^/]*)(.*)$/)
      if (!absolute) return `${clean}${stackSuffix}${trailing}`

      const [, prefix, authority, path] = absolute
      const userInfoEnd = authority.lastIndexOf('@')
      return `${prefix}${authority.slice(userInfoEnd + 1)}${path}${stackSuffix}${trailing}`
    }
  )
}

export function redactTelemetryValues(
  values: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!values) return values
  const seen = new WeakSet<object>()
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return redactTelemetryUrls(value)
    if (typeof value !== 'object' || value === null) return value
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    try {
      if (Array.isArray(value)) return value.map(redact)
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, redact(nested)])
      )
    } finally {
      seen.delete(value)
    }
  }
  return redact(values) as Record<string, unknown>
}
