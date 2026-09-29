/** Remove credentials, query strings, and fragments from URL-shaped text. */
export function redactTelemetryUrls(text: string): string {
  return text.replace(URL_TOKEN_PATTERN, redactUrlToken)
}

const URL_TOKEN_PATTERN =
  /(?:https?:)?\/\/(?:(?![,;](?=(?:https?:)?\/\/))[^\s"'<>])+|\/[A-Za-z0-9._~%-](?:(?![,;](?=(?:https?:)?\/\/))[^\s"'<>])*/g

function redactUrlToken(token: string): string {
  const { core, trailing } = peelTrailingPunctuation(token)
  const stackSuffix = core.match(/:\d+:\d+$/)?.[0] ?? ''
  const url = stackSuffix ? core.slice(0, -stackSuffix.length) : core
  const clean = url.split(/[?#]/, 1)[0]
  const absolute = clean.match(/^((?:https?:)?\/\/)([^/]*)(.*)$/)
  if (!absolute) return `${clean}${stackSuffix}${trailing}`

  const [, prefix, authority, path] = absolute
  const userInfoEnd = authority.lastIndexOf('@')
  return `${prefix}${authority.slice(userInfoEnd + 1)}${path}${stackSuffix}${trailing}`
}

function peelTrailingPunctuation(token: string): {
  core: string
  trailing: string
} {
  let trailing = ''
  while (token.endsWith(',') || token.endsWith(';')) {
    trailing = token.at(-1) + trailing
    token = token.slice(0, -1)
  }
  while (
    (token.endsWith(')') &&
      token.split(')').length > token.split('(').length) ||
    (token.endsWith(']') && token.split(']').length > token.split('[').length)
  ) {
    trailing = token.at(-1) + trailing
    token = token.slice(0, -1)
  }
  return { core: token, trailing }
}

export function redactTelemetryValues(
  values: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!values) return values
  const ancestors = new WeakSet<object>()
  const memo = new WeakMap<object, unknown>()
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return redactTelemetryUrls(value)
    if (typeof value !== 'object' || value === null) return value
    if (ancestors.has(value)) return '[Circular]'
    if (memo.has(value)) return memo.get(value)
    if (isError(value)) return redactError(value, redact, memo)
    const array = isArray(value)
    if (!array && !isPlainObject(value)) return value

    if (array) {
      const output: unknown[] = []
      memo.set(value, output)
      ancestors.add(value)
      try {
        for (const nested of value) output.push(redact(nested))
        return output
      } finally {
        ancestors.delete(value)
      }
    }

    const entries = ownDataEntries(value)
    if (!entries) return value
    const output: Record<string, unknown> = {}
    memo.set(value, output)
    ancestors.add(value)
    try {
      for (const [key, nested] of entries) {
        output[key] = redact(nested)
      }
      return output
    } finally {
      ancestors.delete(value)
    }
  }
  return redact(values) as Record<string, unknown>
}

function isError(value: object): value is Error {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}

function isArray(value: object): value is unknown[] {
  try {
    return Array.isArray(value)
  } catch {
    return false
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function ownDataEntries(value: object): [string, unknown][] | null {
  try {
    return Object.entries(Object.getOwnPropertyDescriptors(value))
      .filter(
        ([, descriptor]) => descriptor.enumerable && 'value' in descriptor
      )
      .map(([key, descriptor]) => [key, descriptor.value])
  } catch {
    return null
  }
}

function redactError(
  source: Error,
  redact: (value: unknown) => unknown,
  memo: WeakMap<object, unknown>
): Error {
  const output = new Error(redactTelemetryUrls(source.message))
  memo.set(source, output)
  if (source.cause !== undefined) output.cause = redact(source.cause)
  output.name = source.name
  if (source.stack) output.stack = redactTelemetryUrls(source.stack)
  return output
}
