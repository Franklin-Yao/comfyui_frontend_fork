import type { App } from 'vue'
import { browserApiErrorsIntegration, init as sentryInit } from '@sentry/vue'
import type { ErrorEvent, EventHint, Exception } from '@sentry/vue'

import { sentryThirdPartyErrorFilter } from './thirdPartyErrorNoise'
import {
  redactTelemetryUrls,
  redactTelemetryValues
} from './redactTelemetryUrls'
function redactSentryEvent(event: ErrorEvent, hint: EventHint) {
  const filtered = sentryThirdPartyErrorFilter(event, hint)
  if (!filtered) return null
  if (filtered.message) {
    filtered.message = redactTelemetryUrls(filtered.message)
  }
  filtered.extra = redactTelemetryValues(filtered.extra)
  filtered.contexts = redactTelemetryValues(filtered.contexts)
  if (filtered.request?.url) {
    filtered.request.url = redactTelemetryUrls(filtered.request.url)
  }
  for (const exception of filtered.exception?.values ?? [])
    redactSentryException(exception)
  return filtered
}

function redactSentryException(exception: Exception): void {
  if (exception.value) exception.value = redactTelemetryUrls(exception.value)
  for (const frame of exception.stacktrace?.frames ?? []) {
    if (frame.filename) frame.filename = redactTelemetryUrls(frame.filename)
    if (frame.abs_path) frame.abs_path = redactTelemetryUrls(frame.abs_path)
  }
}

export function initSentry({
  app,
  dsn,
  enabled,
  isCloud
}: {
  app: App
  dsn: string
  enabled: boolean
  isCloud: boolean
}) {
  sentryInit({
    app,
    dsn,
    enabled,
    release: __COMFYUI_FRONTEND_VERSION__,
    normalizeDepth: 8,
    tracesSampleRate: isCloud ? 1.0 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: redactSentryEvent,
    beforeBreadcrumb: (breadcrumb) => ({
      ...breadcrumb,
      message: breadcrumb.message
        ? redactTelemetryUrls(breadcrumb.message)
        : breadcrumb.message,
      data: redactTelemetryValues(breadcrumb.data)
    }),
    beforeSendSpan: (span) => {
      if (span.description) {
        span.description = redactTelemetryUrls(span.description)
      }
      span.data = redactTelemetryValues(span.data) ?? {}
      return span
    },
    // Only set these for non-cloud builds
    ...(isCloud
      ? {
          integrations: [
            // Disable event target wrapping to reduce overhead on high-frequency
            // DOM events (pointermove, mousemove, wheel). Sentry still captures
            // errors via window.onerror and unhandledrejection.
            browserApiErrorsIntegration({ eventTarget: false })
          ]
        }
      : {
          integrations: [],
          autoSessionTracking: false,
          defaultIntegrations: false
        })
  })
}
