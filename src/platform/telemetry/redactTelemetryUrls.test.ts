import { describe, expect, it } from 'vitest'

import {
  redactTelemetryUrls,
  redactTelemetryValues
} from './redactTelemetryUrls'

describe('redactTelemetryUrls', () => {
  describe.for([
    {
      kind: 'absolute query',
      input: 'https://example.com/model.glb?email=a@b.com&token=private',
      expected: 'https://example.com/model.glb'
    },
    {
      kind: 'absolute credentials and fragment',
      input: 'https://user:p@ss@example.com/model.glb#token=private',
      expected: 'https://example.com/model.glb'
    },
    {
      kind: 'protocol-relative credentials',
      input: '//user:secret@example.com/model.glb?token=private',
      expected: '//example.com/model.glb'
    },
    {
      kind: 'credentials containing URL sub-delimiters',
      input: 'https://user:pa,ss;word@example.com/model.glb',
      expected: 'https://example.com/model.glb'
    },
    {
      kind: 'query values containing URL sub-delimiters',
      input: 'https://example.com/model.glb?token=private,still;private',
      expected: 'https://example.com/model.glb'
    },
    {
      kind: 'root-relative query',
      input: '/api/view?sig=SECRET&x=1?y=2',
      expected: '/api/view'
    },
    {
      kind: 'bracketed query keys',
      input: 'https://h/api/view?filter[id]=1&token=SECRET',
      expected: 'https://h/api/view'
    }
  ])('$kind', ({ input, expected }) => {
    it('redacts URL metadata', () => {
      expect(redactTelemetryUrls(input)).toBe(expected)
    })
  })

  it('redacts adjacent URLs without consuming punctuation or stack locations', () => {
    expect(
      redactTelemetryUrls(
        'https://a/b,https://user:pw@c/d?t=1; at f (https://host/a.js?v=1:12:9)'
      )
    ).toBe('https://a/b,https://c/d; at f (https://host/a.js:12:9)')
  })

  it('splits URL starts glued by brackets or proxy-like paths', () => {
    expect(
      redactTelemetryUrls(
        '[https://user:one@a.test/x?token=1][https://user:two@b.test/y?token=2] proxy/https://user:three@c.test/z?token=3'
      )
    ).toBe('[https://a.test/x][https://b.test/y] proxy/https://c.test/z')
  })

  it('redacts query data from relative path references', () => {
    expect(
      redactTelemetryUrls(
        'request api/view?token=SECRET and assets/a.glb#private'
      )
    ).toBe('request api/view and assets/a.glb')
  })
})

describe('redactTelemetryValues', () => {
  it('redacts URL credentials inside nested console arguments', () => {
    expect(
      redactTelemetryValues({
        arguments: [
          'Error loading model:',
          { message: 'failed https://user:secret@example.com/a.glb?token=x' }
        ]
      })
    ).toEqual({
      arguments: [
        'Error loading model:',
        { message: 'failed https://example.com/a.glb' }
      ]
    })
  })

  it('preserves repeated DAG values while still marking ancestor cycles', () => {
    const shared = { url: 'https://example.com/a?token=secret' }
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    expect(
      redactTelemetryValues({ first: shared, second: shared, cyclic })
    ).toEqual({
      first: { url: 'https://example.com/a' },
      second: { url: 'https://example.com/a' },
      cyclic: { self: '[Circular]' }
    })
  })

  it('memoizes densely shared objects instead of rewalking every path', () => {
    let shared: Record<string, unknown> = {
      url: 'https://example.com/a?token=secret'
    }
    for (let depth = 0; depth < 30; depth++) {
      shared = { left: shared, right: shared }
    }

    const redacted = redactTelemetryValues({ shared })?.shared as Record<
      string,
      unknown
    >
    expect(redacted.left).toBe(redacted.right)
  })

  it('redacts real errors without flattening other object instances or invoking getters', () => {
    const error = new Error(
      'failed https://user:secret@example.com/a.glb?token=x'
    )
    const date = new Date()
    const getter = vi.fn(() => 'https://example.com/a?token=x')
    const value = Object.defineProperty({}, 'unsafe', {
      enumerable: true,
      get: getter
    })

    const redacted = redactTelemetryValues({ error, date, value })

    expect(redacted?.error).toBeInstanceOf(Error)
    expect((redacted?.error as Error).message).toBe(
      'failed https://example.com/a.glb'
    )
    expect(redacted?.date).toBe(date)
    expect(redacted?.value).toEqual({})
    expect(getter).not.toHaveBeenCalled()
  })

  it('passes through proxies that reject reflection without throwing', () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()

    expect(redactTelemetryValues({ proxy })?.proxy).toBe(proxy)
  })
})
