import { beforeEach, describe, expect, it, vi } from 'vitest'

const rendererModule = vi.hoisted(() => {
  let resolveImport!: () => void
  let resolveImportStarted!: () => void
  return {
    acquire: vi.fn(),
    importStarted: new Promise<void>((resolve) => {
      resolveImportStarted = resolve
    }),
    importReady: new Promise<void>((resolve) => {
      resolveImport = resolve
    }),
    resolveImportStarted,
    resolveImport
  }
})

const createLoad3d = vi.hoisted(() => vi.fn())

vi.mock(import('@/renderer/three/sharedWebGLRenderer'), async () => {
  rendererModule.resolveImportStarted()
  await rendererModule.importReady
  return { acquireSharedRenderer: rendererModule.acquire }
})

vi.mock(import('@/extensions/core/load3d/createLoad3d'), () => ({
  createLoad3d
}))

vi.mock(import('@/platform/assets/utils/assetPreviewUtil'), () => ({
  isAssetPreviewSupported: vi.fn(() => false),
  persistThumbnail: vi.fn()
}))

vi.mock(import('@/platform/telemetry/reportError'), () => ({
  reportError: vi.fn()
}))

import { generateModelThumbnail } from './modelThumbnail'

describe('generateModelThumbnail deferred renderer import', () => {
  beforeEach(() => {
    createLoad3d.mockReset()
    rendererModule.acquire.mockReset()
  })

  it('cancels and advances the queue while renderer import stays unresolved', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const cancelled = generateModelThumbnail(
      '/deferred.glb',
      'deferred.glb',
      controller.signal
    )
    const nextController = new AbortController()
    const next = generateModelThumbnail(
      '/next.glb',
      'next.glb',
      nextController.signal
    )
    await rendererModule.importStarted

    nextController.abort()
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)

    await expect(cancelled).resolves.toEqual({ status: 'cancelled' })
    await expect(next).resolves.toEqual({ status: 'cancelled' })
    expect(rendererModule.acquire).not.toHaveBeenCalled()
    expect(createLoad3d).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
