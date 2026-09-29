/** Remove credentials, query strings, and fragments from URL-shaped text. */
export function redactTelemetryUrls(text: string): string {
  return text.replace(/(?:https?:)?\/\/[^\s"']+|\/[^\s"']+/g, (token) => {
    const clean = token.split(/[?#]/, 1)[0]
    const absolute = clean.match(/^((?:https?:)?\/\/)([^/]*)(.*)$/)
    if (!absolute) return clean

    const [, prefix, authority, path] = absolute
    const userInfoEnd = authority.lastIndexOf('@')
    return `${prefix}${authority.slice(userInfoEnd + 1)}${path}`
  })
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
    if (Array.isArray(value)) return value.map(redact)
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redact(nested)])
    )
  }
  return redact(values) as Record<string, unknown>
}
