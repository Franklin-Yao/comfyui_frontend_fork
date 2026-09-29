import { describe, expect, it } from 'vitest'

import { redactTelemetryUrls } from './redactTelemetryUrls'

describe('redactTelemetryUrls', () => {
  it.each([
    [
      'https://example.com/model.glb?email=a@b.com&token=private',
      'https://example.com/model.glb'
    ],
    [
      'https://user:p@ss@example.com/model.glb#token=private',
      'https://example.com/model.glb'
    ],
    [
      '//user:secret@example.com/model.glb?token=private',
      '//example.com/model.glb'
    ],
    ['/api/view?sig=SECRET&x=1?y=2', '/api/view']
  ])('redacts %s', (input, expected) => {
    expect(redactTelemetryUrls(input)).toBe(expected)
  })
})
