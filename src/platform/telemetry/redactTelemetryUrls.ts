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
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' ? redactTelemetryUrls(value) : value
    ])
  )
}
