import { describe, expect, it } from 'vitest'

import { redactTelemetryUrls } from './redactTelemetryUrls'

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
})
