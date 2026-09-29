import { beforeEach, describe, expect, it, vi } from 'vitest'

const rendererModule = vi.hoisted(() => {
  let resolveImport: (() => void) | undefined
  let resolveImportStarted: (() => void) | undefined
  return {
    acquire: vi.fn(),
    importStarted: new Promise<void>((resolve) => {
      resolveImportStarted = resolve
    }),
    importReady: new Promise<void>((resolve) => {
      resolveImport = resolve
    }),
    markImportStarted: () => resolveImportStarted?.(),
    resolveImport: () => resolveImport?.()
  }
})

const createLoad3d = vi.hoisted(() => vi.fn())

vi.mock(import('@/renderer/three/sharedWebGLRenderer'), async () => {
  rendererModule.markImportStarted()
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

  it('cancels before rendering when aborted during renderer import', async () => {
    const controller = new AbortController()
    const result = generateModelThumbnail(
      '/deferred.glb',
      'deferred.glb',
      controller.signal
    )
    await rendererModule.importStarted

    controller.abort()
    rendererModule.resolveImport()

    await expect(result).resolves.toEqual({ status: 'cancelled' })
    expect(rendererModule.acquire).not.toHaveBeenCalled()
    expect(createLoad3d).not.toHaveBeenCalled()
  })
})
