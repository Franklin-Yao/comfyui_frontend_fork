/** Remove credentials, query strings, and fragments from URL-shaped text. */
export function redactTelemetryUrls(text: string): string {
  return text.replace(URL_TOKEN_PATTERN, redactUrlToken)
}

const URL_TOKEN_PATTERN =
  /(?:https?:)?\/\/(?:(?!(?:(?:\[|\]|[(){},;])*)(?:https?:)?\/\/)[^\s"'<>])+|\/(?!\/|https?:\/\/)[A-Za-z0-9._~%-](?:(?!(?:(?:\[|\]|[(){},;])*)(?:https?:)?\/\/)[^\s"'<>])*|\b[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)+[?#][^\s"'<>]*/g

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
  const separatorSuffix = token.match(/[,;]+$/)?.[0] ?? ''
  if (separatorSuffix) {
    trailing = separatorSuffix
    token = token.slice(0, -separatorSuffix.length)
  }
  const bracketSuffix = token.match(/[)\]]+$/)?.[0] ?? ''
  if (bracketSuffix) {
    const peelCount = countExcessClosingBrackets(token, bracketSuffix)
    if (peelCount) {
      trailing = token.slice(-peelCount) + trailing
      token = token.slice(0, -peelCount)
    }
  }
  return { core: token, trailing }
}

function countExcessClosingBrackets(token: string, suffix: string): number {
  let excessParens = countCharacter(token, ')') - countCharacter(token, '(')
  let excessBrackets = countCharacter(token, ']') - countCharacter(token, '[')
  let count = 0
  for (let index = suffix.length - 1; index >= 0; index--) {
    const bracket = suffix[index]
    if (bracket === ')' && excessParens > 0) excessParens--
    else if (bracket === ']' && excessBrackets > 0) excessBrackets--
    else break
    count++
  }
  return count
}

function countCharacter(value: string, character: string): number {
  let count = 0
  for (const current of value) if (current === character) count++
  return count
}

export function redactTelemetryValues<T extends Record<string, unknown>>(
  values: T | undefined
): T | undefined {
  if (!values) return values
  return redactValue(values, {
    ancestors: new WeakSet<object>(),
    memo: new WeakMap<object, unknown>()
  }) as T
}

interface RedactionContext {
  ancestors: WeakSet<object>
  memo: WeakMap<object, unknown>
}

function redactValue(value: unknown, context: RedactionContext): unknown {
  if (typeof value === 'string') return redactTelemetryUrls(value)
  if (typeof value !== 'object' || value === null) return value
  if (context.ancestors.has(value)) return '[Circular]'
  if (context.memo.has(value)) return context.memo.get(value)
  if (isError(value)) return redactError(value, context)
  if (isArray(value)) return redactArray(value, context)
  if (!isPlainObject(value)) return value
  return redactPlainObject(value, context)
}

function redactArray(value: unknown[], context: RedactionContext): unknown[] {
  const output: unknown[] = []
  context.memo.set(value, output)
  context.ancestors.add(value)
  try {
    for (const nested of value) output.push(redactValue(nested, context))
    return output
  } finally {
    context.ancestors.delete(value)
  }
}

function redactPlainObject(
  value: Record<string, unknown>,
  context: RedactionContext
): unknown {
  const entries = ownDataEntries(value)
  if (!entries) return value
  const output: Record<string, unknown> = {}
  context.memo.set(value, output)
  context.ancestors.add(value)
  try {
    for (const [key, nested] of entries) {
      output[key] = redactValue(nested, context)
    }
    return output
  } finally {
    context.ancestors.delete(value)
  }
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

function redactError(source: Error, context: RedactionContext): Error {
  const output = new Error(redactTelemetryUrls(source.message))
  context.memo.set(source, output)
  if (source.cause !== undefined) {
    output.cause = redactValue(source.cause, context)
  }
  output.name = source.name
  if (source.stack) output.stack = redactTelemetryUrls(source.stack)
  return output
}
