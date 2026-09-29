import type {
  browserApiErrorsIntegration as sentryBrowserApiErrorsIntegration,
  init as sentryInitContract
} from '@sentry/vue'
import { createApp } from 'vue'
import { expect, it, vi } from 'vitest'

const { sentryInit, browserApiErrorsIntegration } = vi.hoisted(() => ({
  sentryInit: vi.fn<typeof sentryInitContract>(),
  browserApiErrorsIntegration: vi.fn<typeof sentryBrowserApiErrorsIntegration>()
}))

vi.mock(import('@sentry/vue'), () => ({
  browserApiErrorsIntegration,
  init: sentryInit
}))

import { initSentry } from './initSentry'
import { sentryThirdPartyErrorFilter } from './thirdPartyErrorNoise'

it('installs the third-party error filter', () => {
  initSentry({
    app: createApp({}),
    dsn: 'https://public@example.invalid/1',
    enabled: true,
    isCloud: false
  })

  expect(sentryInit).toHaveBeenCalledWith(
    expect.objectContaining({ beforeSend: sentryThirdPartyErrorFilter })
  )
})

it('redacts URL secrets from breadcrumbs and spans', () => {
  initSentry({
    app: createApp({}),
    dsn: 'https://public@example.invalid/1',
    enabled: true,
    isCloud: true
  })

  const options = sentryInit.mock.calls.at(-1)?.[0]
  const secretUrl = 'https://user:secret@example.com/model.glb?token=private'
  expect(
    options?.beforeBreadcrumb?.({
      message: `fetch ${secretUrl}`,
      data: { url: secretUrl }
    })
  ).toMatchObject({
    message: 'fetch https://example.com/model.glb',
    data: { url: 'https://example.com/model.glb' }
  })
  expect(
    options?.beforeSendSpan?.({
      data: { url: secretUrl },
      description: `GET ${secretUrl}`,
      span_id: '1234567890abcdef',
      start_timestamp: 1,
      trace_id: '1234567890abcdef1234567890abcdef'
    })
  ).toMatchObject({
    description: 'GET https://example.com/model.glb',
    data: { url: 'https://example.com/model.glb' }
  })
})
