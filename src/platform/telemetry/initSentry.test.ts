import type {
  browserApiErrorsIntegration as sentryBrowserApiErrorsIntegration,
  init as sentryInitContract
} from '@sentry/vue'
import { fromPartial } from '@total-typescript/shoehorn'
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
it('installs the third-party error filter in the send sanitizer', () => {
  initSentry({
    app: createApp({}),
    dsn: 'https://public@example.invalid/1',
    enabled: true,
    isCloud: false
  })

  const options = sentryInit.mock.calls.at(-1)?.[0]
  const beforeSend = options?.beforeSend
  expect(
    beforeSend?.(fromPartial({ message: 'ordinary failure' }), {})
  ).toMatchObject({
    message: 'ordinary failure'
  })
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
    options?.beforeSend?.(
      fromPartial({
        exception: {
          values: [{ value: `failed ${secretUrl}` }]
        }
      }),
      {}
    )
  ).toMatchObject({
    exception: {
      values: [{ value: 'failed https://example.com/model.glb' }]
    }
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
