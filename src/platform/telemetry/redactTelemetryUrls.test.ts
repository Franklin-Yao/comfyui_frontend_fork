import { describe, expect, it } from 'vitest'

import {
  redactTelemetryUrls,
  redactTelemetryValues
} from './redactTelemetryUrls'

describe('redactTelemetryUrls', () => {
  it('redacts query, fragment, and authority credentials', () => {
    expect(
      redactTelemetryUrls(
        'https://example.com/model.glb?email=a@b.com&token=private'
      )
    ).toBe('https://example.com/model.glb')
    expect(
      redactTelemetryUrls(
        'https://user:p@ss@example.com/model.glb#token=private'
      )
    ).toBe('https://example.com/model.glb')
    expect(
      redactTelemetryUrls('//user:secret@example.com/model.glb?token=private')
    ).toBe('//example.com/model.glb')
    expect(redactTelemetryUrls('/api/view?sig=SECRET&x=1?y=2')).toBe(
      '/api/view'
    )
  })

  it('redacts adjacent URLs without consuming punctuation or stack locations', () => {
    expect(
      redactTelemetryUrls(
        'https://a/b,https://user:pw@c/d?t=1; at f (https://host/a.js?v=1:12:9)'
      )
    ).toBe('https://a/b,https://c/d; at f (https://host/a.js:12:9)')
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
})
